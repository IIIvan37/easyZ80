import { type Assembly, assemble } from "../assembler/assemble.ts";
import {
  createMachine,
  type Flags,
  type Registers,
  SCREEN_SIZE,
} from "../machine/machine.ts";
import { explain, type Lang } from "./messages.ts";
import "./z80-playground.css";

/** What a toolbar button does; the run button turns into pause while the program runs. */
export type PlaygroundAction = "step" | "run" | "pause" | "reset";

export interface PlaygroundOptions {
  /** The bytes of cell80.wasm; fetched next to this module by default. */
  readonly wasm?: () => Promise<Uint8Array<ArrayBuffer>>;
  /** Gives the toolbar buttons the site's own look; they show their label as text by default. */
  readonly drawButton?: DrawButton;
}

/**
 * Draws a toolbar button: called when the button is made, and again each time
 * run and pause swap. `label` is in the page's language; a button without text
 * needs it as its accessible name.
 */
export type DrawButton = (
  button: HTMLButtonElement,
  action: PlaygroundAction,
  label: string,
) => void;

const drawLabel: DrawButton = (button, _action, label) => {
  button.textContent = label;
};

/** The words the playground shows, in one language. */
interface Texts {
  readonly step: string;
  readonly run: string;
  readonly pause: string;
  readonly reset: string;
  /** Puts the line number before an error's sentence. */
  readonly atLine: (line: number, sentence: string) => string;
}

const TEXTS: Readonly<Record<Lang, Texts>> = {
  fr: {
    step: "Pas à pas",
    run: "Lancer",
    pause: "Pause",
    reset: "Remise à zéro",
    atLine: (line, sentence) => `Ligne ${line} : ${sentence}`,
  },
  en: {
    step: "Step",
    run: "Run",
    pause: "Pause",
    reset: "Reset",
    atLine: (line, sentence) => `Line ${line}: ${sentence}`,
  },
};

const REGISTERS = [
  "af",
  "bc",
  "de",
  "hl",
  "ix",
  "iy",
  "sp",
  "pc",
] as const satisfies readonly (keyof Registers)[];

const FLAGS = [
  "S",
  "Z",
  "H",
  "PV",
  "N",
  "C",
] as const satisfies readonly (keyof Flags)[];

// easy6502's palette, so the colours match its tutorial.
const PALETTE = [
  "#000000",
  "#ffffff",
  "#880000",
  "#aaffee",
  "#cc44cc",
  "#00cc55",
  "#0000aa",
  "#eeee77",
  "#dd8855",
  "#664400",
  "#ff7777",
  "#333333",
  "#777777",
  "#aaff66",
  "#0088ff",
  "#bbbbbb",
];

/** Fast enough to draw, slow enough to watch. */
const INSTRUCTIONS_PER_FRAME = 200;

const hex = (value: number, digits: number) =>
  `#${value.toString(16).toUpperCase().padStart(digits, "0")}`;

const fetchWasm = async () =>
  new Uint8Array(
    await (
      await fetch(new URL("../cpu/cell80.wasm", import.meta.url))
    ).arrayBuffer(),
  );

/** The page's language as the playground speaks it: French or English. */
const langOf = (element: Element): Lang =>
  element
    .closest("[lang]")
    ?.getAttribute("lang")
    ?.toLowerCase()
    .startsWith("fr")
    ? "fr"
    : "en";

/** A table of names; `show` puts a value next to each name, in order. */
function table(names: readonly string[]) {
  const element = document.createElement("table");
  const cells = names.map((name) => {
    const row = element.insertRow();
    const header = document.createElement("th");
    header.textContent = name;
    row.append(header);
    return row.insertCell();
  });
  const show = (values: readonly string[]) =>
    cells.forEach((cell, i) => {
      cell.textContent = values[i] ?? "";
    });
  return { element, show };
}

function box(className: string, ...children: HTMLElement[]) {
  const element = document.createElement("div");
  element.className = className;
  element.append(...children);
  return element;
}

function span(className: string, text: string) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

/** Registers `<z80-playground>`, which turns the code of its `<pre>` into a running Z80. */
export function definePlayground({
  wasm = fetchWasm,
  drawButton = drawLabel,
}: PlaygroundOptions = {}): void {
  // Every playground of the page runs the same cell80: fetch it once.
  let wasmBytes: Promise<Uint8Array<ArrayBuffer>> | undefined;

  class Z80Playground extends HTMLElement {
    #enhanced = false;

    // The page may move the element, which connects it again: build it once.
    connectedCallback() {
      if (this.#enhanced) return;
      this.#enhanced = true;
      void this.enhance();
    }

    async enhance() {
      const editor = Promise.all([
        import("codemirror"),
        import("@codemirror/view"),
        import("@codemirror/lint"),
      ]);
      const pre = this.querySelector("pre");
      const original = pre?.textContent ?? "";
      const lang = langOf(this);
      const texts = TEXTS[lang];
      const drawAs = (element: HTMLButtonElement, action: PlaygroundAction) =>
        drawButton(element, action, texts[action]);
      const button = (action: PlaygroundAction, onClick: () => void) => {
        const element = document.createElement("button");
        element.type = "button";
        drawAs(element, action);
        element.addEventListener("click", onClick);
        return element;
      };
      wasmBytes ??= wasm();
      const machine = await createMachine(await wasmBytes);

      const errors = document.createElement("ul");
      errors.setAttribute("role", "alert");
      errors.className = "z80-errors";
      const registers = table(REGISTERS.map((name) => name.toUpperCase()));
      const flags = table(FLAGS.map((flag) => (flag === "PV" ? "P/V" : flag)));

      const listing = document.createElement("ol");
      listing.className = "z80-listing";
      let lines: { address: number; item: HTMLLIElement }[] = [];

      const screen = document.createElement("canvas");
      screen.width = SCREEN_SIZE;
      screen.height = SCREEN_SIZE;
      screen.tabIndex = 0;
      screen.addEventListener("keydown", (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (machine.pressKey(event.key)) event.preventDefault();
      });
      // happy-dom has no 2D context: the screen is then left blank.
      const context = screen.getContext("2d");
      const draw = () => {
        if (!context) return;
        machine.screen.forEach((pixel, i) => {
          context.fillStyle = PALETTE[pixel & 0x0f] ?? PALETTE[0] ?? "";
          context.fillRect(i % SCREEN_SIZE, Math.floor(i / SCREEN_SIZE), 1, 1);
        });
      };

      const render = () => {
        draw();
        const snapshot = machine.snapshot();
        registers.show(
          REGISTERS.map((name) => hex(snapshot.registers[name], 4)),
        );
        flags.show(FLAGS.map((flag) => (snapshot.flags[flag] ? "1" : "0")));
        for (const { address, item } of lines) {
          if (address === snapshot.registers.pc)
            item.setAttribute("aria-current", "true");
          else item.removeAttribute("aria-current");
        }
      };

      // The program runs while a frame is requested.
      let frameRequest: number | undefined;
      const stop = () => {
        if (frameRequest === undefined) return;
        cancelAnimationFrame(frameRequest);
        frameRequest = undefined;
        drawAs(play, "run");
      };
      const frame = () => {
        if (machine.run(INSTRUCTIONS_PER_FRAME) < INSTRUCTIONS_PER_FRAME)
          stop();
        else frameRequest = requestAnimationFrame(frame);
        render();
      };

      const step = button("step", () => {
        stop();
        machine.step();
        render();
      });
      const play = button("run", () => {
        if (frameRequest !== undefined) return stop();
        frameRequest = requestAnimationFrame(frame);
        drawAs(play, "pause");
        // Clicking the button focused it: the keys of a running program go to the screen.
        screen.focus();
      });
      const reset = button("reset", () => {
        stop();
        machine.load(assembly.blocks);
        render();
      });

      let assembly: Assembly;
      /** Assembles the code, loads it and shows its errors and listing. */
      const load = (source: string) => {
        assembly = assemble(source);
        stop();
        machine.load(assembly.blocks);
        errors.replaceChildren(
          ...assembly.errors.map((error) => {
            const item = document.createElement("li");
            item.textContent = texts.atLine(error.line, explain(error, lang));
            return item;
          }),
        );
        lines = assembly.blocks.flatMap(({ address, bytes }) =>
          machine.listing(address, bytes.length).map((line) => {
            const item = document.createElement("li");
            item.append(
              span("address", hex(line.address, 4)),
              " ",
              span(
                "bytes",
                line.bytes.map((b) => hex(b, 2).slice(1)).join(" "),
              ),
              " ",
              span("instruction", line.text),
            );
            return { address: line.address, item };
          }),
        );
        listing.replaceChildren(...lines.map(({ item }) => item));
        // A program missing its faulty lines would mislead a beginner: it runs once fixed.
        for (const control of [step, play, reset])
          control.disabled = assembly.errors.length > 0;
        render();
      };

      load(original);
      this.append(
        errors,
        box("z80-toolbar", step, play, reset),
        box(
          "z80-machine",
          screen,
          box("z80-cpu", registers.element, flags.element),
          listing,
        ),
      );

      // Until CodeMirror loads, the <pre> shows the code the buttons run.
      const [{ basicSetup }, { EditorView }, { setDiagnostics }] = await editor;
      /** Underlines the line of each error of the code last loaded. */
      const underline = (view: InstanceType<typeof EditorView>) => {
        const { doc } = view.state;
        const diagnostics = assembly.errors.map((error) => {
          const line = doc.line(Math.min(error.line, doc.lines));
          return {
            from: line.from,
            to: line.to,
            severity: "error" as const,
            message: explain(error, lang),
          };
        });
        view.update([
          view.state.update(setDiagnostics(view.state, diagnostics)),
        ]);
      };
      const view = new EditorView({
        doc: original,
        extensions: [basicSetup],
        // Synchronous, so the errors are underlined in the same update as the edit.
        dispatchTransactions(transactions, view) {
          view.update(transactions);
          if (!transactions.some((transaction) => transaction.docChanged))
            return;
          load(view.state.doc.toString());
          underline(view);
        },
      });
      underline(view);
      if (pre) pre.replaceWith(view.dom);
      else this.prepend(view.dom);
    }
  }
  customElements.define("z80-playground", Z80Playground);
}
