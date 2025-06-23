import { MusixMatchLyricProvider } from "./provider"

export default ({ useConfig, registerLyricProvider, logger }) => {
  logger.info("[Lyrs] [MusixMatch] Initializing MusixMatch lyric provider...")
  registerLyricProvider(new MusixMatchLyricProvider(useConfig(), logger))
}