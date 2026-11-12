// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { definePlayground } from "./z80-playground.ts";

// Under happy-dom, import.meta.url is not a file: URL, so the path is built from the folder.
const wasm = readFileSync(join(import.meta.dirname, "../cpu/cell80.wasm"));

beforeAll(() => {
  definePlayground({ wasm: async () => wasm });
});

/** A playground as the blog writes it: the highlighted code in a <pre>. */
async function mount(source: string, lang = "fr") {
  const page = document.createElement("div");
  page.lang = lang;
  const playground = document.createElement("z80-playground");
  const pre = document.createElement("pre");
  pre.textContent = source;
  playground.append(pre);
  page.append(playground);
  document.body.replaceChildren(page);
  await vi.waitFor(() => expect(button(playground, /./)).toBeTruthy());
  return playground;
}

function button(playground: HTMLElement, label: RegExp | string) {
  const found = [...playground.querySelectorAll("button")].find((b) =>
    typeof label === "string"
      ? b.textContent === label
      : label.test(b.textContent ?? ""),
  );
  if (!found) throw new Error(`No button ${label}`);
  return found;
}

/** The value shown next to a register's name. */
function register(playground: HTMLElement, name: string) {
  const header = [...playground.querySelectorAll("th")].find(
    (th) => th.textContent === name,
  );
  return header?.nextElementSibling?.textContent;
}

function errors(playground: HTMLElement) {
  return [...playground.querySelectorAll("[role=alert] li")].map(
    (li) => li.textContent,
  );
}

describe("<z80-playground>", () => {
  it("runs one instruction per step and shows the registers", async () => {
    const playground = await mount("ld a,5\nhalt");

    button(playground, "Pas à pas").click();

    expect(register(playground, "AF")).toBe("#05FF");
    expect(register(playground, "PC")).toBe("#0002");
  });

  it("lists the errors with their line, in the page's language", async () => {
    const fr = await mount("ld a,5\nmov a,b\nhalt");
    expect(errors(fr)).toEqual([
      "Ligne 2 : MOV n'est pas une instruction du Z80.",
    ]);

    const en = await mount("ld a,300", "en-GB");
    expect(errors(en)).toEqual([
      "Line 1: 300 does not fit in a byte, which holds 0 to 255.",
    ]);
    expect(button(en, "Step")).toBeTruthy();
  });

  it("shows the flags", async () => {
    const playground = await mount("xor a\nhalt");

    button(playground, "Pas à pas").click();

    expect(register(playground, "Z")).toBe("1");
    expect(register(playground, "C")).toBe("0");
  });

  it("lists the program and marks the instruction at PC", async () => {
    const playground = await mount("org #100\nld a,5\nhalt");

    const lines = [...playground.querySelectorAll("ol li")].map(
      (li) => li.textContent,
    );
    expect(lines).toEqual(["#0100 3E 05 LD A,#05", "#0102 76 HALT"]);
    expect(playground.querySelector("[aria-current]")?.textContent).toContain(
      "LD A,#05",
    );

    button(playground, "Pas à pas").click();

    expect(playground.querySelector("[aria-current]")?.textContent).toContain(
      "HALT",
    );
  });

  it("runs until the program halts", async () => {
    const playground = await mount("ld b,250\nloop: djnz loop\nhalt");

    button(playground, "Lancer").click();
    expect(button(playground, "Pause")).toBeTruthy();

    await vi.waitFor(() => expect(button(playground, "Lancer")).toBeTruthy());
    expect(register(playground, "BC")).toBe("#0000");
  });

  it("pauses a running program", async () => {
    const playground = await mount("loop: inc a\njr loop");

    button(playground, "Lancer").click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    button(playground, "Pause").click();
    const paused = register(playground, "AF");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(register(playground, "AF")).toBe(paused);
    expect(button(playground, "Lancer")).toBeTruthy();
  });

  it("starts the program again on reset", async () => {
    const playground = await mount("ld a,5\nld b,6\nhalt");
    button(playground, "Pas à pas").click();
    button(playground, "Pas à pas").click();

    button(playground, "Remise à zéro").click();

    expect(register(playground, "PC")).toBe("#0000");
    expect(register(playground, "AF")).toBe("#FFFF");
  });

  it("gives a key pressed on the screen to port #FF", async () => {
    const playground = await mount("in a,(#FF)\nhalt");
    const screen = playground.querySelector("canvas");
    expect([screen?.width, screen?.height]).toEqual([32, 32]);

    screen?.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    button(playground, "Pas à pas").click();

    expect(register(playground, "AF")).toBe("#41FF");
  });
});
