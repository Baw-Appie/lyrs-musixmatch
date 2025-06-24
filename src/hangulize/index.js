import "./wasm_exec.js"

import hangulizeB64 from "./hangulize.wasm";
import translitB64 from "./furigana.translit.wasm";

const hangulizeBytes = Uint8Array.from(atob(hangulizeB64), c => c.charCodeAt(0));
const translitBytes = Uint8Array.from(atob(translitB64), c => c.charCodeAt(0));


async function load() {
  const hangulizeGo = new globalThis.Go();
  const furiganaGo = new globalThis.Go();
  const result = await WebAssembly.instantiate(hangulizeBytes, hangulizeGo.importObject)
  const furigana = await WebAssembly.instantiate(translitBytes, furiganaGo.importObject)
  hangulizeGo.run(result.instance)
  furiganaGo.run(furigana.instance)
  await globalThis.hangulize.useTranslit("furigana", async (word) => {
    return await globalThis.translit("furigana", word)
  })
}
load()

export async function hangulize(text) {
  if(!globalThis.hangulize) await load();
  return await globalThis.hangulize("jpn", text)
}