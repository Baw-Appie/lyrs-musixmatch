import "./wasm_exec.js"

// GitHub raw URLs for WASM files
const GITHUB_REPO_BASE = "https://raw.githubusercontent.com/Baw-Appie/lyrs-musixmatch/master/src/hangulize";
const HANGULIZE_WASM_URL = `${GITHUB_REPO_BASE}/hangulize.wasm`;
const TRANSLIT_WASM_URL = `${GITHUB_REPO_BASE}/furigana.translit.wasm`;

// Cache for compiled WASM modules to avoid re-downloading and re-compiling
let hangulizeModule = null;
let translitModule = null;
let loadPromise = null;


async function load() {
  // Prevent multiple simultaneous loads
  if (loadPromise) {
    return await loadPromise;
  }
  
  loadPromise = (async () => {
    const hangulizeGo = new globalThis.Go();
    const furiganaGo = new globalThis.Go();
    
    // Use WebAssembly.instantiateStreaming for efficient streaming compilation
    // Cache compiled modules to avoid re-downloading and re-compiling
    if (!hangulizeModule) {
      hangulizeModule = await WebAssembly.instantiateStreaming(fetch(HANGULIZE_WASM_URL), hangulizeGo.importObject);
    }
    if (!translitModule) {
      translitModule = await WebAssembly.instantiateStreaming(fetch(TRANSLIT_WASM_URL), furiganaGo.importObject);
    }

    hangulizeGo.run(hangulizeModule.instance)
    furiganaGo.run(translitModule.instance)
    await globalThis.hangulize.useTranslit("furigana", async (word) => {
      return await globalThis.translit("furigana", word)
    })
  })();
  
  try {
    await loadPromise;
  } catch (error) {
    // Reset loadPromise so it can be retried
    loadPromise = null;
    throw error;
  }
}
load()

export async function hangulize(text) {
  if(!globalThis.hangulize) await load();
  return await globalThis.hangulize("jpn", text)
}