import { assemble } from "../assembler/assemble.ts";
import { createMachine, type Machine } from "../machine/machine.ts";
import { explain, type Lang } from "./messages.ts";
import "./z80-playground.css";

export interface PlaygroundOptions {
  /** The bytes of cell80.wasm; fetched next to this module by default. */
  readonly wasm?: () => Promise<Uint8Array<ArrayBuffer>>;
}

interface Labels {
  readonly step: string;
  readonly run: string;
  readonly pause: string;
  readonly reset: string;
  /** Puts the line number before an error's sentence. */
  readonly atLine: (line: number, sentence: string) => string;
}

const LABELS: Readonly<Record<Lang, Labels>> = {
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
  ["AF", "af"],
  ["BC", "bc"],
  ["DE", "de"],
  ["HL", "hl"],
  ["IX", "ix"],
  ["IY", "iy"],
  ["SP", "sp"],
  ["PC", "pc"],
] as const;

const FLAGS = [
  ["S", "S"],
  ["Z", "Z"],
  ["H", "H"],
  ["P/V", "PV"],
  ["N", "N"],
  ["C", "C"],
] as const;

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
const SCREEN_SIZE = 32;

/** As in the prototype: fast enough to draw, slow enough to watch. */
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

/** Registers `<z80-playground>`, which turns the code of its `<pre>` into a running Z80. */
export function definePlayground({
  wasm = fetchWasm,
}: PlaygroundOptions = {}): void {
  class Z80Playground extends HTMLElement {
    #enhanced = false;

    // The page may move the element, which connects it again: build it once.
    connectedCallback() {
      if (this.#enhanced) return;
      this.#enhanced = true;
      void this.enhance();
    }

    async enhance() {
      const pre = this.querySelector("pre");
      const original = pre?.textContent ?? "";
      const lang = langOf(this);
      const labels = LABELS[lang];
      const machine: Machine = await createMachine(await wasm());

      const errors = document.createElement("ul");
      errors.setAttribute("role", "alert");

      /** A table of names and values; returns the value cells, in order. */
      const table = (names: readonly string[]) => {
        const element = document.createElement("table");
        const cells = names.map((name) => {
          const row = element.insertRow();
          const header = document.createElement("th");
          header.textContent = name;
          row.append(header);
          return row.insertCell();
        });
        return { element, cells };
      };
      const registers = table(REGISTERS.map(([name]) => name));
      const flags = table(FLAGS.map(([name]) => name));

      const listing = document.createElement("ol");
      let lines: { address: number; item: HTMLLIElement }[] = [];

      const screen = document.createElement("canvas");
      screen.width = SCREEN_SIZE;
      screen.height = SCREEN_SIZE;
      screen.tabIndex = 0;
      screen.addEventListener("keydown", (event) => {
        const code = event.key.toUpperCase().charCodeAt(0);
        // Port #FF holds one byte: only ASCII keys reach it (ADR 0002).
        if (
          event.key.length !== 1 ||
          code > 0x7f ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        machine.pressKey(code);
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
        REGISTERS.forEach(([, key], i) => {
          const cell = registers.cells[i];
          if (cell) cell.textContent = hex(snapshot.registers[key], 4);
        });
        FLAGS.forEach(([, key], i) => {
          const cell = flags.cells[i];
          if (cell) cell.textContent = snapshot.flags[key] ? "1" : "0";
        });
        for (const { address, item } of lines) {
          if (address === snapshot.registers.pc)
            item.setAttribute("aria-current", "true");
          else item.removeAttribute("aria-current");
        }
      };

      const button = (label: string, onClick: () => void) => {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.addEventListener("click", onClick);
        return element;
      };

      let running = false;
      const setRunning = (value: boolean) => {
        running = value;
        play.textContent = running ? labels.pause : labels.run;
      };
      // Run, Pause, Run within one frame must not start a second chain of frames.
      let frameRequested = false;
      const requestFrame = () => {
        if (frameRequested) return;
        frameRequested = true;
        requestAnimationFrame(frame);
      };
      const frame = () => {
        frameRequested = false;
        if (!running) return;
        if (machine.run(INSTRUCTIONS_PER_FRAME) < INSTRUCTIONS_PER_FRAME)
          setRunning(false);
        render();
        if (running) requestFrame();
      };

      const step = button(labels.step, () => {
        setRunning(false);
        machine.step();
        render();
      });
      const play = button(labels.run, () => {
        setRunning(!running);
        if (running) requestFrame();
      });

      let assembly = assemble(original);
      /** Assembles the code, loads it and shows its errors and listing. */
      const load = (source: string) => {
        assembly = assemble(source);
        setRunning(false);
        machine.load(assembly.blocks);
        errors.replaceChildren(
          ...assembly.errors.map((error) => {
            const item = document.createElement("li");
            item.textContent = labels.atLine(error.line, explain(error, lang));
            return item;
          }),
        );
        lines = assembly.blocks.flatMap(({ address, bytes }) =>
          machine.listing(address, bytes.length).map((line) => {
            const item = document.createElement("li");
            const column = (className: string, text: string) => {
              const span = document.createElement("span");
              span.className = className;
              span.textContent = text;
              return span;
            };
            item.append(
              column("address", hex(line.address, 4)),
              " ",
              column(
                "bytes",
                line.bytes.map((b) => hex(b, 2).slice(1)).join(" "),
              ),
              " ",
              column("instruction", line.text),
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

      const reset = button(labels.reset, () => {
        setRunning(false);
        machine.load(assembly.blocks);
        render();
      });

      load(original);
      const box = (className: string, ...children: HTMLElement[]) => {
        const element = document.createElement("div");
        element.className = className;
        element.append(...children);
        return element;
      };
      errors.className = "z80-errors";
      listing.className = "z80-listing";
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
      const [{ basicSetup }, { EditorView }, { setDiagnostics }] =
        await Promise.all([
          import("codemirror"),
          import("@codemirror/view"),
          import("@codemirror/lint"),
        ]);
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
