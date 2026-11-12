import { definePlayground } from "../src/playground/z80-playground.ts";

definePlayground();

// `?autorun` clicks every Run button once loaded, for a screenshot taken without a mouse.
if (new URLSearchParams(location.search).has("autorun")) {
  setTimeout(() => {
    for (const button of document.querySelectorAll("button")) {
      if (button.textContent === "Lancer" || button.textContent === "Run")
        button.click();
    }
  }, 1500);
}
