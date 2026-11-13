import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, vi } from "vitest";

// Under happy-dom, import.meta.url is not a file: URL, so the path is built from the folder.
export const wasm = readFileSync(
  join(import.meta.dirname, "../cpu/cell80.wasm"),
);

/** A playground as the blog writes it: the highlighted code in a <pre>. */
export async function mount(source: string, lang = "fr") {
  const page = document.createElement("div");
  page.lang = lang;
  const playground = document.createElement("z80-playground");
  const pre = document.createElement("pre");
  pre.textContent = source;
  playground.append(pre);
  page.append(playground);
  document.body.replaceChildren(page);
  await vi.waitFor(() =>
    expect(playground.querySelector("button")).toBeTruthy(),
  );
  return playground;
}
