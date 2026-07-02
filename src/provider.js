import { z } from 'zod';
import makeCookieFetch from 'fetch-cookie';
import { hangulize } from './hangulize/index.js';

const cookieFetch = makeCookieFetch(fetch);
const cacheTable = {} // 가사 캐시
const isrcCache = {} // ISRC 검색 결과 캐시
const translationCache = {} // 번역 캐시

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
    this.usertoken = ""
    this._updatingUserTokenPromise = null;
    this.targetLanguage = "ko";
    this.useHangulize = true; // 기본값
    this.config = config()
    this.setConfig = setConfig
    this.logger = logger;
  }

  async getUserToken() {
    this.targetLanguage = this.config.language
    this.useHangulize = this.config.useHangulize !== false // 기본값은 true
    this.usertoken = this.config.musixMatchToken
    if (this.usertoken) return this.usertoken;
    if (!this._updatingUserTokenPromise) {
      this.logger.info('[Lyrs] [MusixMatch] Fetching user token...');
      this._updatingUserTokenPromise = this._updateUserToken();
    }
    return await this._updatingUserTokenPromise;
  }

  async _updateUserToken() {
    const res = await cookieFetch("https://apic.musixmatch.com/ws/1.1/token.get?app_id=mac-ios-v2.0")
    const json = await res.json()
    if (!json || !json.message || json.message.header.status_code !== 200) {
      throw new Error('Failed to fetch user token from MusixMatch');
    }
    this.usertoken = json.message.body.user_token;
    this.setConfig({ musixMatchToken: this.usertoken });
    return this.usertoken;
  }

  async getLyricById(id) {
    const cacheKey = `id:${id}`;
    if(cacheTable[cacheKey]) {
      this.logger.info("[Lyrs] [MusixMatch] Returning cached lyric for ID", id);
      return cacheTable[cacheKey];
    }
    const query = new URLSearchParams();
    query.set('commontrack_id', this.encode(id));
    query.set('usertoken', this.encode(await this.getUserToken()));
    query.set('app_id', this.encode("mac-ios-v2.0"));
    this.logger.info("[LYRS] [MusixMatch] Fetching lyric by ID", id, query.toString());

    const response = await cookieFetch(`https://apic.musixmatch.com/ws/1.1/macro.subtitles.get?${query.toString()}`);
    const json = await response.json();
    const success = json.message?.body?.macro_calls?.['track.lyrics.get']?.message?.header?.status_code === 200
    if (!success) {
      this.logger.warn('[Lyrs] [MusixMatch] Failed to fetch lyrics', json);
      return null;
    }
    const parsed = await this.musixmatchMacroToLyricScheme(json);
    if (!parsed.success) return null;

    const lyric = parsed.data[0];
    if (!lyric.syncedLyrics) return null;

    const convertedLyrics = this.syncedLyricsToLyric(lyric.syncedLyrics);

    if (
      this.useHangulize &&
      this.targetLanguage == "ko" &&
      json.message?.body?.macro_calls?.['track.subtitles.get']?.message?.body?.subtitle_list[0]?.subtitle?.subtitle_language == "ja"
    ) {
      try {
        this.logger.info("[Lyrs] [MusixMatch] Found Japanese lyrics, converting to Korean...", await hangulize("日本語"));
        Object.entries(convertedLyrics).forEach(async ([timestamp, lines]) => convertedLyrics[Number(timestamp)].push(await hangulize(lines[0])));
      } catch (e) {
        this.logger.warn("[Lyrs] [MusixMatch] Failed to convert Japanese lyrics to Korean...", e.message);
      }
    }

    // 번역 캐시 체크
    const translationCacheKey = `translation:${lyric.id}:${this.targetLanguage}`;
    let translations = translationCache[translationCacheKey];
    
    if (!translations) {
      const translationResponse = await cookieFetch(`https://apic.musixmatch.com/ws/1.1/crowd.track.translations.get?app_id=mac-ios-v2.0&usertoken=${this.encode(await this.getUserToken())}&commontrack_id=${this.encode(lyric.id.toString())}&selected_language=${this.targetLanguage}`);
      const translationJson = await translationResponse.json();
      const translationSuccess = translationJson.message?.header?.status_code === 200;
      if (!translationSuccess) {
        this.logger.warn('[Lyrs] [MusixMatch] Failed to fetch translation', translationJson);
        translations = [];
      } else {
        translations = translationJson.message?.body?.translations_list || [];
        // 번역 결과 캐싱
        translationCache[translationCacheKey] = translations;
      }
    } else {
      this.logger.info("[Lyrs] [MusixMatch] Using cached translation for", lyric.id);
    }

    translations.forEach(tr => {
      const { subtitle_matched_line: source, description: target } = tr.translation;
      Object.entries(convertedLyrics).forEach(([timestamp, lines]) => lines.includes(source) && convertedLyrics[Number(timestamp)].push(target));
    });

    const result = {
      ...this.responseToMetadata(lyric),

      lyric: convertedLyrics,
      lyricRaw: lyric.syncedLyrics,
    }
    cacheTable[cacheKey] = result;
    return result;
  }

  async getLyricByIsrc(isrc, cacheKey = null) {
    // ISRC 기반 캐시 체크
    const isrcCacheKey = `isrc:${isrc}`;
    if (cacheTable[isrcCacheKey]) {
      this.logger.info("[Lyrs] [MusixMatch] Returning cached lyric for ISRC", isrc);
      return cacheTable[isrcCacheKey];
    }

    // cacheKey 기반 캐시 체크 (하위 호환성)
    if (cacheKey && cacheTable[cacheKey]) {
      this.logger.info("[Lyrs] [MusixMatch] Returning cached lyric for cache key", cacheKey);
      return cacheTable[cacheKey];
    }

    const query = new URLSearchParams();
    query.set('usertoken', this.encode(await this.getUserToken()));
    query.set('app_id', this.encode("mac-ios-v2.0"));
    query.set('track_isrc', this.encode(isrc));
    this.logger.info("[Lyrs] [MusixMatch] Fetching lyrics with query", query.toString());

    const response = await cookieFetch(`https://apic.musixmatch.com/ws/1.1/macro.subtitles.get?${query.toString()}`);
    const json = await response.json();
    const success = json.message?.body?.macro_calls?.['track.lyrics.get']?.message?.header?.status_code === 200
    if (!success) {
      this.logger.warn('[Lyrs] [MusixMatch] Failed to fetch lyrics', json);
      return null;
    }
    const parsed = await this.musixmatchMacroToLyricScheme(json);
    if (!parsed.success) {
      this.logger.warn(
        '[Lyrs] [MusixMatch] Failed to parse search response',
        parsed.error,
      );
      return null;
    }

    const lyric = parsed.data[0];
    this.logger.info("[LYRS] [MusixMatch] Fetched lyric", lyric);
    if (!lyric.syncedLyrics) return null;
    this.logger.info("[LYRS] [MusixMatch] Synced lyrics found", lyric.syncedLyrics)

    const result = {
      ...this.responseToMetadata(lyric),
      lyric: this.syncedLyricsToLyric(lyric.syncedLyrics),
      lyricRaw: lyric.syncedLyrics,
    }
    
    // 여러 캐시 키에 저장
    cacheTable[isrcCacheKey] = result;
    if (cacheKey) {
      cacheTable[cacheKey] = result;
    }
    
    return result;
  }

  async getLyric(params) {
    if (params.page && params.page > 1) return null;
    const cacheKey = Object.values(params).join('|');
    if (cacheTable[cacheKey]) {
      this.logger.info("[Lyrs] [MusixMatch] Returning cached lyric for params", params);
      return cacheTable[cacheKey];
    }

    const isrcList = await this.getIsrc(params.title || "", params.artist || "", 1);
    if (!isrcList || isrcList.length === 0) {
      this.logger.warn('[Lyrs] [MusixMatch] No isrc ID found for search', params);
      return null;
    }

    return await this.getLyricByIsrc(isrcList[0].isrc, cacheKey);
  }

  async searchLyrics(params) {
    if (params.page && params.page > 1) return [];
    
    // 여러 곡 검색 (최대 5개)
    const isrcList = await this.getIsrc(params.title || "", params.artist || "", 5);
    if (!isrcList || isrcList.length === 0) {
      this.logger.warn('[Lyrs] [MusixMatch] No isrc IDs found for search', params);
      return [];
    }

    this.logger.info(`[Lyrs] [MusixMatch] Found ${isrcList.length} songs, fetching lyrics...`);

    // 각 곡에 대해 가사 가져오기
    const lyrics = [];
    for (const isrcInfo of isrcList) {
      try {
        const lyric = await this.getLyricByIsrc(isrcInfo.isrc);
        if (lyric) {
          lyrics.push(lyric);
        }
      } catch (error) {
        this.logger.warn(`[Lyrs] [MusixMatch] Failed to fetch lyric for ${isrcInfo.title}`, error);
      }
    }

    this.logger.info(`[Lyrs] [MusixMatch] Successfully fetched ${lyrics.length} lyrics`);
    return lyrics;
  }

  getOptions(language) {
    return [
      {
        id: 'useHangulize',
        type: 'toggle',
        label: language === 'ko' ? '한글라이즈 사용' : 'Use Hangulize',
        description: language === 'ko' 
          ? '일본어 가사를 한글로 자동 변환합니다' 
          : 'Automatically convert Japanese lyrics to Korean',
        default: true,
      }
    ];
  }

  onOptionChange(options) {
    this.useHangulize = options.useHangulize !== false;
    this.setConfig({ useHangulize: this.useHangulize });
  }

  encode(str) {
    return encodeURIComponent(str).replace(/%20/g, '+');
  }

  async musixmatchMacroToLyricScheme(json) {
    this.logger.info(json.message?.body?.macro_calls?.['track.subtitles.get']?.message?.body?.subtitle_list)
    return await LyricResponseSchema.array().spa([{
      id: json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.commontrack_id,
      name: json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.track_name,
      trackName: json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.track_name,
      artistName: json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.artist_name,
      albumName: json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.album_name,
      duration: json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.track_length,
      instrumental: !!json.message?.body?.macro_calls?.['matcher.track.get']?.message?.body?.track?.instrumental,
      plainLyrics: json.message?.body?.macro_calls?.['track.subtitles.get']?.message?.body?.subtitle_list[0]?.subtitle?.subtitle_body || '',
      syncedLyrics: json.message?.body?.macro_calls?.['track.subtitles.get']?.message?.body?.subtitle_list[0]?.subtitle?.subtitle_body || '',
    }]);
  }

  async getIsrc(title, artist, limit = 1) {
    // ISRC 검색 결과 캐싱
    const searchKey = `search:${artist}:${title}:${limit}`;
    if (isrcCache[searchKey]) {
      this.logger.info("[Lyrs] [MusixMatch] Returning cached ISRC search results");
      return isrcCache[searchKey];
    }

    // https://www.shazam.com/services/amapi/v1/catalog/KR/search?types=songs&term=yorushika&limit=3
    const query = new URLSearchParams();
    query.set('term', artist + ' ' + title);
    query.set('types', 'songs');
    query.set('limit', limit.toString());
    const response = await fetch(`https://www.shazam.com/services/amapi/v1/catalog/KR/search?${query.toString()}`);
    const json = await response.json();
    if (!json || json.results?.songs?.data?.length === 0) {
      this.logger.warn('[Lyrs] [MusixMatch] No results found for Isrc search', json);
      isrcCache[searchKey] = []; // 빈 결과도 캐싱하여 중복 요청 방지
      return [];
    }
    const isrcList = json.results.songs.data.map(song => ({
      isrc: song.attributes.isrc,
      title: song.attributes.name,
      artist: song.attributes.artistName,
      album: song.attributes.albumName,
    }));
    this.logger.info("[Lyrs] [MusixMatch] Found Isrc IDs", isrcList);
    
    // 검색 결과 캐싱
    isrcCache[searchKey] = isrcList;
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
    return lyrics.split('\n').reduce(
      (prev, line) => {
        const [time, ...text] = line.split('] ');
        const [minute, second] = time.slice(1).split(':').map(Number);
        const timestamp = minute * 60 * 1000 + second * 1000;

        return {
          ...prev,
          [timestamp]: [text.join('] ')],
        };
      },
      {},
    );
  }
}