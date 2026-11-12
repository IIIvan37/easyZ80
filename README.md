# easyZ80

An interactive tutorial that teaches Z80 assembly to complete beginners, in the spirit of [easy6502](https://skilldrick.github.io/easy6502/): short lessons, each with an editor where the reader assembles, runs and steps through a program on a small imaginary machine.

This repository holds the library: the machine, the assembler and the `<z80-playground>` custom element. The lessons live in the blog, in a section of their own ([ADR 0004](docs/adr/0004-lessons-live-in-the-blog-as-their-own-section.md)).

> **Status:** design. The decisions are in [docs/adr/](docs/adr/). A throwaway prototype that runs hand-assembled programs on the Z80 core lives on branch `prototype/wasm-chain`.
