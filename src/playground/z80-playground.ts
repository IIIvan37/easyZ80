import { assemble } from "../assembler/assemble.ts";
import { createMachine, type Machine } from "../machine/machine.ts";
import { explain, type Lang } from "./messages.ts";

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
  element.closest("[lang]")?.getAttribute("lang")?.startsWith("fr")
    ? "fr"
    : "en";

/** Registers `<z80-playground>`, which turns the code of its `<pre>` into a running Z80. */
export function definePlayground({
  wasm = fetchWasm,
}: PlaygroundOptions = {}): void {
  class Z80Playground extends HTMLElement {
    connectedCallback() {
      void this.enhance();
    }

    async enhance() {
      const source = this.querySelector("pre")?.textContent ?? "";
      const lang = langOf(this);
      const labels = LABELS[lang];
      const machine: Machine = await createMachine(await wasm());
      const assembly = assemble(source);
      machine.load(assembly.blocks);

      const errors = document.createElement("ul");
      errors.setAttribute("role", "alert");
      for (const error of assembly.errors) {
        const item = document.createElement("li");
        item.textContent = labels.atLine(error.line, explain(error, lang));
        errors.append(item);
      }

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
      const lines = assembly.blocks.flatMap(({ address, bytes }) =>
        machine.listing(address, bytes.length).map((line) => {
          const item = document.createElement("li");
          item.textContent = [
            hex(line.address, 4),
            ...line.bytes.map((b) => hex(b, 2).slice(1)),
            line.text,
          ].join(" ");
          listing.append(item);
          return { address: line.address, item };
        }),
      );

      const screen = document.createElement("canvas");
      screen.width = SCREEN_SIZE;
      screen.height = SCREEN_SIZE;
      screen.tabIndex = 0;
      screen.addEventListener("keydown", (event) => {
        if (
          event.key.length !== 1 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        machine.pressKey(event.key.toUpperCase().charCodeAt(0));
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
      const frame = () => {
        if (!running) return;
        if (machine.run(INSTRUCTIONS_PER_FRAME) < INSTRUCTIONS_PER_FRAME)
          setRunning(false);
        render();
        if (running) requestAnimationFrame(frame);
      };

      const step = button(labels.step, () => {
        setRunning(false);
        machine.step();
        render();
      });
      const play = button(labels.run, () => {
        setRunning(!running);
        if (running) requestAnimationFrame(frame);
      });
      const reset = button(labels.reset, () => {
        setRunning(false);
        machine.load(assembly.blocks);
        render();
      });

      render();
      this.append(
        step,
        play,
        reset,
        errors,
        screen,
        registers.element,
        flags.element,
        listing,
      );
    }
  }
  customElements.define("z80-playground", Z80Playground);
}
