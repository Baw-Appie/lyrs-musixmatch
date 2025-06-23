import "./wasm_exec.js"

import hangulizeB64 from "./hangulize.wasm";
import translitB64 from "./furigana.translit.wasm";

const hangulizeBytes = Buffer.from(hangulizeB64, "base64");
const translitBytes = Buffer.from(translitB64, "base64");


async function load() {
  const hangulizeGo = new globalThis.Go();
  const furiganaGo = new globalThis.Go();
  const result = await WebAssembly.instantiate(new WebAssembly.Module(hangulizeBytes), hangulizeGo.importObject)
  const furigana = await WebAssembly.instantiate(new WebAssembly.Module(translitBytes), furiganaGo.importObject)
  hangulizeGo.run(result.instance)
  furiganaGo.run(furigana.instance)
  await globalThis.hangulize.useTranslit("furigana", async (word) => {
    return await globalThis.translit("furigana", word)
  })
}
load()

export async function hangulize(text) {
  return await globalThis.hangulize("jpn", text)
}