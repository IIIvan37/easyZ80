# Assembler errors are codes with data, not sentences

The assembler reports each mistake as a code and the values that explain it, for example `{ line: 1, kind: "number-too-big", value: 300, bits: 8 }`. `<z80-playground>` writes the sentence the beginner reads, in the language of the lesson.

The lessons come in French first, then in English (ADR 0004). A sentence written by the assembler would tie it to one language, and tie its tests to one wording.

## Considered options

- **A French sentence**: simplest while only French lessons exist; the English lessons would need the assembler changed.
- **An English sentence**, like FantAMS and most assemblers: French lessons would show English errors to beginners.

## Consequences

- The tests check the code and its values; the wording is free to change without touching the assembler.
- Each new kind of error adds a code to the assembler and a sentence per language to the playground.
