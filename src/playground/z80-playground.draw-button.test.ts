// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { mount, wasm } from "./test-page.ts";
import { definePlayground } from "./z80-playground.ts";

// A file of its own: an element is defined once per page, and here with drawButton.

beforeAll(() => {
  definePlayground({
    wasm: async () => wasm,
    // A site's own buttons: the action as a data attribute, the label for screen readers.
    drawButton: (button, action, label) => {
      button.dataset.action = action;
      button.dataset.draws = String(Number(button.dataset.draws ?? 0) + 1);
      button.ariaLabel = label;
      button.textContent = "";
    },
  });
});

const drawn = (playground: HTMLElement) =>
  [...playground.querySelectorAll("button")].map((button) => [
    button.dataset.action,
    button.ariaLabel,
    button.textContent,
  ]);

describe("<z80-playground> with drawButton", () => {
  it("lets the site draw each button, with its action and label", async () => {
    const playground = await mount("halt");

    expect(drawn(playground)).toEqual([
      ["step", "Pas à pas", ""],
      ["run", "Lancer", ""],
      ["reset", "Remise à zéro", ""],
    ]);
  });

  it("draws the run button again as pause while the program runs, and back", async () => {
    const playground = await mount("loop: jr loop");
    const play =
      playground.querySelector<HTMLButtonElement>("[data-action=run]");

    play?.click();
    expect([play?.dataset.action, play?.ariaLabel]).toEqual(["pause", "Pause"]);

    play?.click();
    expect([play?.dataset.action, play?.ariaLabel]).toEqual(["run", "Lancer"]);
  });

  it("leaves the run button alone when nothing swaps", async () => {
    const playground = await mount("halt");
    const button = (action: string) =>
      playground.querySelector<HTMLButtonElement>(`[data-action=${action}]`);

    button("step")?.click();
    button("reset")?.click();

    expect(button("run")?.dataset.draws).toBe("1");
  });
});
