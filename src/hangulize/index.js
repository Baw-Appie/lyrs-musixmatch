import "./wasm_exec.js"

// GitHub raw URLs for WASM files
const GITHUB_REPO_BASE = "https://raw.githubusercontent.com/Baw-Appie/lyrs-musixmatch/master/src/hangulize";
const HANGULIZE_WASM_URL = `${GITHUB_REPO_BASE}/hangulize.wasm`;
const TRANSLIT_WASM_URL = `${GITHUB_REPO_BASE}/furigana.translit.wasm`;

// Memoized loader: WASM is fetched on first hangulize() call, never on import
let loadPromise = null;

async function fetchWasmBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM from ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function init() {
  const [hangulizeBytes, translitBytes] = await Promise.all([
    fetchWasmBytes(HANGULIZE_WASM_URL),
    fetchWasmBytes(TRANSLIT_WASM_URL),
  ]);

  const hangulizeGo = new globalThis.Go();
  const furiganaGo = new globalThis.Go();
  const [hangulizeMod, furiganaMod] = await Promise.all([
    WebAssembly.instantiate(hangulizeBytes, hangulizeGo.importObject),
    WebAssembly.instantiate(translitBytes, furiganaGo.importObject),
  ]);
  hangulizeGo.run(hangulizeMod.instance);
  furiganaGo.run(furiganaMod.instance);
  await globalThis.hangulize.useTranslit("furigana", (word) => globalThis.translit("furigana", word));
}

async function load() {
  if (!loadPromise) {
    // Reset on failure so the next call can retry
    loadPromise = init().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export async function hangulize(text) {
  await load();
  return await globalThis.hangulize("jpn", text)
}
