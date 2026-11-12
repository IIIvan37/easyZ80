// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { forEachDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
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

/** The CodeMirror editor, once it has replaced the <pre>. */
function editorOf(playground: HTMLElement) {
  return vi.waitFor(() => {
    const editor = playground.querySelector<HTMLElement>(".cm-editor");
    const view = editor && EditorView.findFromDOM(editor);
    if (!view) throw new Error("No editor yet");
    return view;
  });
}

function underlinedLines(view: EditorView) {
  const lines: number[] = [];
  forEachDiagnostic(view.state, (_, from) =>
    lines.push(view.state.doc.lineAt(from).number),
  );
  return lines;
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

  it("reads the page's language whatever its case", async () => {
    const playground = await mount("halt", "FR-CA");

    expect(button(playground, "Pas à pas")).toBeTruthy();
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

  it("runs 200 instructions a frame, even after a quick pause and run", async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let lastRequest = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++lastRequest, callback);
      return lastRequest;
    });
    vi.stubGlobal("cancelAnimationFrame", (request: number) =>
      frames.delete(request),
    );
    try {
      const playground = await mount("ld hl,0\nloop: inc hl\njr loop");

      button(playground, "Lancer").click();
      button(playground, "Pause").click();
      button(playground, "Lancer").click();
      const nextFrame = [...frames.values()];
      frames.clear();
      for (const callback of nextFrame) callback(0);

      // One LD, then 199 instructions that alternate INC and JR.
      expect(register(playground, "HL")).toBe("#0064");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts the program again on reset", async () => {
    const playground = await mount("ld a,5\nld b,6\nhalt");
    button(playground, "Pas à pas").click();
    button(playground, "Pas à pas").click();

    button(playground, "Remise à zéro").click();

    expect(register(playground, "PC")).toBe("#0000");
    expect(register(playground, "AF")).toBe("#FFFF");
  });

  it("does not run a program until its errors are fixed", async () => {
    const playground = await mount("ld a,5\nmov a,b\nhalt");
    const view = await editorOf(playground);
    const controls = () =>
      ["Pas à pas", "Lancer", "Remise à zéro"].map(
        (label) => button(playground, label).disabled,
      );

    expect(controls()).toEqual([true, true, true]);

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "ld a,5\nhalt" },
    });

    expect(controls()).toEqual([false, false, false]);
  });

  it("keeps its program when the page moves it", async () => {
    const playground = await mount("ld a,5\nhalt");

    document.body.append(playground);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(playground.querySelectorAll("button")).toHaveLength(3);
    button(playground, "Pas à pas").click();
    expect(register(playground, "AF")).toBe("#05FF");
  });

  it("gives a key pressed on the screen to port #FF", async () => {
    const playground = await mount("in a,(#FF)\nhalt");
    const screen = playground.querySelector("canvas");
    expect([screen?.width, screen?.height]).toEqual([32, 32]);

    screen?.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    button(playground, "Pas à pas").click();

    expect(register(playground, "AF")).toBe("#41FF");
  });

  it("gives port #FF only the keys of ASCII", async () => {
    const playground = await mount("in a,(#FF)\nhalt");

    playground
      .querySelector("canvas")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "é" }));
    button(playground, "Pas à pas").click();

    expect(register(playground, "AF")).toBe("#00FF");
  });

  it("underlines the errors of the code it starts with", async () => {
    const view = await editorOf(await mount("ld a,300\nhalt"));

    expect(underlinedLines(view)).toEqual([1]);
  });

  it("assembles the code again on each edit", async () => {
    const playground = await mount("ld a,5\nhalt");
    const view = await editorOf(playground);
    expect(playground.querySelector("pre")).toBeNull();

    const replace = (insert: string) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert },
      });
    replace("ld a,7\nmov a,b\nhalt");

    expect(errors(playground)).toEqual([
      "Ligne 2 : MOV n'est pas une instruction du Z80.",
    ]);
    expect(underlinedLines(view)).toEqual([2]);

    replace("ld a,7\nhalt");
    button(playground, "Pas à pas").click();

    expect(errors(playground)).toEqual([]);
    expect(register(playground, "AF")).toBe("#07FF");
  });
});
