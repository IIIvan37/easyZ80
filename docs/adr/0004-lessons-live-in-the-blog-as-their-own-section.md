# The lessons live in the blog, as a section of their own

easyZ80 ships a library: the machine, the assembler, and a `<z80-playground>` custom element (editor, 32×32 screen, registers, flags, step by step). The lessons are written in the Astro blog (`IIIvan37/blog`), in French and English like the rest of it, because the blog is the only home of its writing. They form a section of their own, as the productions do: their own content collection, ordered lessons, their own pages with a table of contents and previous and next links, and nothing in the post list, the tags or the RSS feeds.

In a lesson, a ` ```z80 playground ` block becomes a `<z80-playground>`, the way `src/playground.ts` turns a ` ```js playground ` block into a `<js-playground>`. The element takes its labels in the page's language.

## Considered options

- **Lessons as blog posts**: a tutorial read in order would be mixed with the articles, their dates and their feeds.
- **A site of its own, built by easyZ80**: a second layout, a second i18n and a second deployment to keep in step with the blog.

## Consequences

- The tests stay in easyZ80: the blog has none, and the assembler's contract tests need the `fantams` binary.
- The blog depends on a released easyZ80, as a GitHub release tarball like z80-tdd (its ADR 0009). Netlify downloads it during the build, so the easyZ80 repository has to be public. `cell80.wasm` ships inside the package: no separate host, unlike CPCEC.
