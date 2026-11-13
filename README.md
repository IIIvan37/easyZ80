# easyZ80

An interactive tutorial that teaches Z80 assembly to complete beginners, in the spirit of [easy6502](https://skilldrick.github.io/easy6502/): short lessons, each with an editor where the reader assembles, runs and steps through a program on a small imaginary machine.

This repository holds the library: the machine, the assembler and the `<z80-playground>` custom element. The lessons live in the blog, in a section of their own ([ADR 0004](docs/adr/0004-lessons-live-in-the-blog-as-their-own-section.md)).

> **Status:** first release, v0.1.0. The decisions are in [docs/adr/](docs/adr/).

## Installation

easyZ80 runs in the browser, through a bundler that handles CSS imports and `new URL(..., import.meta.url)`, such as Vite or Astro.

1. Add easyZ80 to the site. It comes from the tarball of [its GitHub release](https://github.com/IIIvan37/easyZ80/releases/tag/v0.1.0):

   ```sh
   pnpm add https://github.com/IIIvan37/easyZ80/releases/download/v0.1.0/easyz80-0.1.0.tgz
   ```

2. Register the element once, in a script of the page:

   ```ts
   import { definePlayground } from "easyz80";

   definePlayground();
   ```

3. Put the program in a `<pre>` inside the element. The labels are in French when the closest `lang` attribute starts with `fr`, in English otherwise:

   ```html
   <z80-playground><pre>
   start:
     ld a, 1
     ld (#4000), a
     halt
   </pre></z80-playground>
   ```

## Buttons

By default the toolbar buttons show their label as text. To give them the site's own look, pass `drawButton` to `definePlayground`. easyZ80 calls it when it makes each button, and again each time run and pause swap. `action` is a `PlaygroundAction`: `"step"`, `"run"`, `"pause"` or `"reset"`. `label` is in the page's language; a button without text needs it as its accessible name:

```ts
definePlayground({
  drawButton: (button, action, label) => {
    button.replaceChildren(iconOf(action));
    button.ariaLabel = label;
  },
});
```

## Release

From `main`: `pnpm pack`, which builds first, then `gh release create vX.Y.Z` with the tarball. Each release updates the version in the installation step.
