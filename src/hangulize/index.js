import "./wasm_exec.js"

// GitHub raw URLs for WASM files
const GITHUB_REPO_BASE = "https://raw.githubusercontent.com/Baw-Appie/lyrs-musixmatch/master/src/hangulize";
const HANGULIZE_WASM_URL = `${GITHUB_REPO_BASE}/hangulize.wasm`;
const TRANSLIT_WASM_URL = `${GITHUB_REPO_BASE}/furigana.translit.wasm`;

// Cache for WASM bytes to avoid re-downloading
let hangulizeBytes = null;
let translitBytes = null;
let loadPromise = null;

async function fetchWasmBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM from ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}


async function load() {
  // Prevent multiple simultaneous loads
  if (loadPromise) {
    return await loadPromise;
  }
  
  loadPromise = (async () => {
    // Fetch WASM files from GitHub if not already cached
    if (!hangulizeBytes) {
      hangulizeBytes = await fetchWasmBytes(HANGULIZE_WASM_URL);
    }
    if (!translitBytes) {
      translitBytes = await fetchWasmBytes(TRANSLIT_WASM_URL);
    }

    const hangulizeGo = new globalThis.Go();
    const furiganaGo = new globalThis.Go();
    const result = await WebAssembly.instantiate(hangulizeBytes, hangulizeGo.importObject)
    const furigana = await WebAssembly.instantiate(translitBytes, furiganaGo.importObject)
    hangulizeGo.run(result.instance)
    furiganaGo.run(furigana.instance)
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