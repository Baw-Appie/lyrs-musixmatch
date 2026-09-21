import { z } from 'zod';
import makeCookieFetch from 'fetch-cookie';
import { hangulize } from './hangulize/index.js';

const APP_ID = 'mac-ios-v2.0';
const MX_API = 'https://apic.musixmatch.com/ws/1.1';
const LOG = '[Lyrs] [MusixMatch]';

const cookieFetch = makeCookieFetch(fetch);

const LyricResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  trackName: z.string(),
  artistName: z.string(),
  albumName: z.string(),
  duration: z.number(), // in seconds not ms
  instrumental: z.boolean().optional(),
  plainLyrics: z.string(),
  syncedLyrics: z.string().nullable(), // [mm:ss.xx] lyrics\n ...
});

export class MusixMatchLyricProvider {
  constructor(_config, logger) {
    const [config, setConfig] = _config;
    this.name = 'MusixMatch';
    this.usertoken = '';
    this._updatingUserTokenPromise = null;
    this.targetLanguage = 'ko';
    this.useHangulize = true; // 기본값
    this.config = config();
    this.setConfig = setConfig;
    this.logger = logger;
    this.lyricCache = new Map(); // 가사 캐시
    this.isrcCache = new Map(); // ISRC 검색 결과 캐시
    this.translationCache = new Map(); // 번역 캐시
    this.shazamToken = null;
    this.shazamExpiresAt = 0;
  }

  syncConfig() {
    this.targetLanguage = this.config.language ?? 'ko';
    this.useHangulize = this.config.useHangulize !== false; // 기본값은 true
    if (this.config.musixMatchToken) this.usertoken = this.config.musixMatchToken;
  }

  async getUserToken() {
    this.syncConfig();
    if (this.usertoken) return this.usertoken;
    this._updatingUserTokenPromise ??= this._updateUserToken().finally(() => {
      this._updatingUserTokenPromise = null;
    });
    return this._updatingUserTokenPromise;
  }

  async _updateUserToken() {
    this.logger.info(`${LOG} Fetching user token...`);
    const res = await cookieFetch(`${MX_API}/token.get?app_id=${APP_ID}`);
    const json = await res.json();
    if (!json || json.message?.header?.status_code !== 200) {
      throw new Error('Failed to fetch user token from MusixMatch');
    }
    this.usertoken = json.message.body.user_token;
    this.setConfig({ musixMatchToken: this.usertoken });
    return this.usertoken;
  }

  // MusixMatch macro.subtitles.get 조회 → 파싱까지 공통 처리
  async fetchTrackLyric(params) {
    const query = new URLSearchParams({
      app_id: APP_ID,
      usertoken: await this.getUserToken(),
      ...params,
    });
    const response = await cookieFetch(`${MX_API}/macro.subtitles.get?${query}`);
    const json = await response.json();
    if (json.message?.body?.macro_calls?.['track.lyrics.get']?.message?.header?.status_code !== 200) {
      this.logger.warn(`${LOG} Failed to fetch lyrics`, json);
      return null;
    }
    const parsed = this.musixmatchMacroToLyricScheme(json);
    if (!parsed.success) {
      this.logger.warn(`${LOG} Failed to parse search response`, parsed.error);
      return null;
    }
    return { lyric: parsed.data[0], json };
  }

  // 파싱된 가사에 한글라이즈·번역을 덧붙여 최종 형태로 조립
  async buildResult(lyric, json) {
    const converted = this.syncedLyricsToLyric(lyric.syncedLyrics);
    const subtitle =
      json.message?.body?.macro_calls?.['track.subtitles.get']?.message?.body?.subtitle_list?.[0]?.subtitle;

    if (this.useHangulize && this.targetLanguage === 'ko' && subtitle?.subtitle_language === 'ja') {
      try {
        for (const lines of Object.values(converted)) lines.push(await hangulize(lines[0]));
      } catch (e) {
        this.logger.warn(`${LOG} Failed to convert Japanese lyrics to Korean...`, e.message);
      }
    }

    const cacheKey = `translation:${lyric.id}:${this.targetLanguage}`;
    let translations = this.translationCache.get(cacheKey);
    if (!translations) {
      translations = await this.fetchTranslations(lyric.id);
      this.translationCache.set(cacheKey, translations);
    }

    for (const { translation } of translations) {
      for (const lines of Object.values(converted)) {
        if (lines.includes(translation.subtitle_matched_line)) lines.push(translation.description);
      }
    }

    return {
      ...this.responseToMetadata(lyric),
      lyric: converted,
      lyricRaw: lyric.syncedLyrics,
    };
  }

  async fetchTranslations(commontrackId) {
    const query = new URLSearchParams({
      app_id: APP_ID,
      usertoken: await this.getUserToken(),
      commontrack_id: String(commontrackId),
      selected_language: this.targetLanguage,
    });
    const res = await cookieFetch(`${MX_API}/crowd.track.translations.get?${query}`);
    const json = await res.json();
    if (json.message?.header?.status_code !== 200) {
      this.logger.warn(`${LOG} Failed to fetch translation`, json);
      return [];
    }
    return json.message?.body?.translations_list || [];
  }

  async getLyricById(id) {
    const cacheKey = `id:${id}`;
    if (this.lyricCache.has(cacheKey)) {
      this.logger.info(`${LOG} Returning cached lyric for ID`, id);
      return this.lyricCache.get(cacheKey);
    }
    this.logger.info(`${LOG} Fetching lyric by ID`, id);

    const fetched = await this.fetchTrackLyric({ commontrack_id: String(id) });
    if (!fetched?.lyric.syncedLyrics) return null;

    const result = await this.buildResult(fetched.lyric, fetched.json);
    this.lyricCache.set(cacheKey, result);
    return result;
  }

  async getLyricByIsrc(isrc, cacheKey = null) {
    for (const key of [`isrc:${isrc}`, cacheKey]) {
      if (key && this.lyricCache.has(key)) {
        this.logger.info(`${LOG} Returning cached lyric for`, key);
        return this.lyricCache.get(key);
      }
    }
    this.logger.info(`${LOG} Fetching lyrics with ISRC`, isrc);

    const fetched = await this.fetchTrackLyric({ track_isrc: isrc });
    if (!fetched?.lyric.syncedLyrics) return null;

    const result = await this.buildResult(fetched.lyric, fetched.json);
    this.lyricCache.set(`isrc:${isrc}`, result);
    if (cacheKey) this.lyricCache.set(cacheKey, result);
    return result;
  }

  async getLyric(params) {
    if (params.page && params.page > 1) return null;
    const cacheKey = Object.values(params).join('|');
    if (this.lyricCache.has(cacheKey)) {
      this.logger.info(`${LOG} Returning cached lyric for params`, params);
      return this.lyricCache.get(cacheKey);
    }

    const isrcList = await this.getIsrc(params.title || '', params.artist || '', 1);
    if (!isrcList || isrcList.length === 0) {
      this.logger.warn(`${LOG} No isrc ID found for search`, params);
      return null;
    }

    return await this.getLyricByIsrc(isrcList[0].isrc, cacheKey);
  }

  async searchLyrics(params) {
    if (params.page && params.page > 1) return [];

    // 여러 곡 검색 (최대 5개)
    let isrcList;
    try {
      isrcList = await this.getIsrc(params.title || '', params.artist || '', 5);
      if (!isrcList || isrcList.length === 0) {
        this.logger.warn(`${LOG} No isrc IDs found for search`, params);
        return [];
      }
    } catch (error) {
      this.logger.warn(`${LOG} Failed to search lyrics`, error);
      return [];
    }

    this.logger.info(`${LOG} Found ${isrcList.length} songs, fetching lyrics...`);

    // 각 곡에 대해 가사 가져오기
    const lyrics = [];
    for (const isrcInfo of isrcList) {
      try {
        const lyric = await this.getLyricByIsrc(isrcInfo.isrc);
        if (lyric) lyrics.push(lyric);
      } catch (error) {
        this.logger.warn(`${LOG} Failed to fetch lyric for ${isrcInfo.title}`, error);
      }
    }

    this.logger.info(`${LOG} Successfully fetched ${lyrics.length} lyrics`);
    return lyrics;
  }

  getOptions(language) {
    return [
      {
        id: 'useHangulize',
        type: 'toggle',
        label: language === 'ko' ? '한글라이즈 사용' : 'Use Hangulize',
        description:
          language === 'ko'
            ? '일본어 가사를 한글로 자동 변환합니다'
            : 'Automatically convert Japanese lyrics to Korean',
        default: true,
      },
    ];
  }

  onOptionChange(options) {
    this.useHangulize = options.useHangulize !== false;
    this.setConfig({ useHangulize: this.useHangulize });
  }

  encode(str) {
    return encodeURIComponent(str).replace(/%20/g, '+');
  }

  musixmatchMacroToLyricScheme(json) {
    const track = json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track ?? {};
    const subtitle =
      json.message?.body?.macro_calls?.['track.subtitles.get']?.message?.body?.subtitle_list?.[0]
        ?.subtitle ?? {};
    return LyricResponseSchema.array().safeParse([
      {
        id: track.commontrack_id,
        name: track.track_name,
        trackName: track.track_name,
        artistName: track.artist_name,
        albumName: track.album_name,
        duration: track.track_length,
        instrumental: !!track.instrumental,
        plainLyrics: subtitle.subtitle_body || '',
        syncedLyrics: subtitle.subtitle_body || '',
      },
    ]);
  }

  async getShazamToken() {
    if (this.shazamToken && Date.now() < this.shazamExpiresAt) return this.shazamToken;
    const res = await fetch('https://www.shazam.com/services/musickit/validate');
    const token = res.headers.get('x-shz-validation');
    if (!token) return null;
    this.shazamToken = token;
    this.shazamExpiresAt = Date.now() + 5 * 60 * 1000;
    try {
      const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (exp) this.shazamExpiresAt = exp * 1000;
    } catch {
      // Use the fallback cache duration for non-JWT validation tokens.
    }
    return token;
  }

  async getIsrc(title, artist, limit = 1) {
    // ISRC 검색 결과 캐싱
    const searchKey = `search:${artist}:${title}:${limit}`;
    if (this.isrcCache.has(searchKey)) {
      this.logger.info(`${LOG} Returning cached ISRC search results`);
      return this.isrcCache.get(searchKey);
    }

    const shazam = await this.getShazamToken();
    if (!shazam) {
      this.logger.warn(`${LOG} Failed to fetch Shazam validation headers`);
      return [];
    }

    // https://www.shazam.com/services/amapi/v1/catalog/KR/search?types=songs&term=yorushika&limit=3
    const query = new URLSearchParams({
      term: `${artist} ${title}`,
      types: 'songs',
      limit: String(limit),
      l: 'ko-KR',
    });
    const response = await fetch(`https://api.music.apple.com/v1/catalog/kr/search?${query}`, {
      headers: {
        Authorization: `Bearer ${shazam}`,
        Origin: 'https://www.shazam.com',
      },
    });
    const json = await response.json();
    const isrcList = (json.results?.songs?.data ?? []).map(({ attributes: a }) => ({
      isrc: a.isrc,
      title: a.name,
      artist: a.artistName,
      album: a.albumName,
    }));
    if (isrcList.length === 0) this.logger.warn(`${LOG} No results found for Isrc search`, json);
    else this.logger.info(`${LOG} Found Isrc IDs`, isrcList);

    // 검색 결과 캐싱 (빈 결과도 캐싱하여 중복 요청 방지)
    this.isrcCache.set(searchKey, isrcList);
    return isrcList;
  }

  responseToMetadata(lyric) {
    return {
      id: lyric.id.toString(),
      title: lyric.trackName,
      album: lyric.albumName,
      artist: lyric.artistName,
      playtime: lyric.duration * 1000,
    };
  }

  syncedLyricsToLyric(lyrics) {
    const out = {};
    for (const line of lyrics.split('\n')) {
      const sep = line.indexOf('] ');
      if (sep < 0) continue;
      const [minute, second] = line.slice(1, sep).split(':').map(Number);
      if (!Number.isFinite(minute) || !Number.isFinite(second)) continue;
      out[minute * 60 * 1000 + second * 1000] = [line.slice(sep + 2)];
    }
    return out;
  }
}
