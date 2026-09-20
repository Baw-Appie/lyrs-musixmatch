import { MusixMatchLyricProvider } from './src/provider.js';

const config = {
  language: 'ko',
  useHangulize: false,
};

const provider = new MusixMatchLyricProvider(
  [() => config, (updates) => Object.assign(config, updates)],
  console,
);

const lyrics = await provider.searchLyrics({
  title: process.argv[2] || '夜に駆ける',
  artist: process.argv[3] || 'YOASOBI',
});

console.dir(lyrics, { depth: null });