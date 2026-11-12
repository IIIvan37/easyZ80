import type { AssemblyError } from "../assembler/assemble.ts";

export type Lang = "fr" | "en";

type Kind = AssemblyError["kind"];
type ErrorOf<K extends Kind> = Extract<AssemblyError, { kind: K }>;

/** One sentence per error code: a missing one fails the typecheck (ADR 0005). */
type Sentences = { readonly [K in Kind]: (error: ErrorOf<K>) => string };

const fr: Sentences = {
  "number-too-big": ({ value, bits }) =>
    bits === 8
      ? `${value} ne tient pas dans un octet, qui va de 0 à 255.`
      : `${value} ne tient pas sur 16 bits, qui vont de 0 à 65535.`,
  "unknown-mnemonic": ({ mnemonic }) =>
    `${mnemonic} n'est pas une instruction du Z80.`,
  "wrong-operands": ({ mnemonic }) =>
    `${mnemonic} n'accepte pas ces opérandes.`,
  "ix-and-iy-together": () =>
    "Une instruction ne peut pas utiliser IX et IY à la fois.",
  "jump-too-far": ({ distance }) =>
    `La cible est à ${distance} octets : JR et DJNZ vont de -128 à 127. JP va partout.`,
  "displacement-out-of-range": ({ displacement }) =>
    `Le décalage ${displacement} sort de -128 à 127.`,
  "misplaced-org": () =>
    "org vient une seule fois, avant la première instruction ou donnée.",
  "unknown-label": ({ label }) => `Le label ${label} n'est défini nulle part.`,
  "size-defined-later": ({ label }) =>
    `defs a besoin de ${label}, défini plus bas : le définir avant.`,
  "reserved-word": ({ label }) =>
    `${label} est un mot réservé : choisir un autre nom.`,
  "past-end-of-memory": () =>
    "Cette ligne dépasse la fin de la mémoire, #FFFF.",
  "unsupported-character": ({ character }) =>
    `Le caractère ${character} n'est pas accepté : seuls les caractères ASCII le sont.`,
  "label-defined-twice": ({ label, firstLine }) =>
    `Le label ${label} est déjà défini ligne ${firstLine}.`,
};

const en: Sentences = {
  "number-too-big": ({ value, bits }) =>
    bits === 8
      ? `${value} does not fit in a byte, which holds 0 to 255.`
      : `${value} does not fit in 16 bits, which hold 0 to 65535.`,
  "unknown-mnemonic": ({ mnemonic }) => `${mnemonic} is not a Z80 instruction.`,
  "wrong-operands": ({ mnemonic }) =>
    `${mnemonic} does not take these operands.`,
  "ix-and-iy-together": () => "An instruction cannot use IX and IY together.",
  "jump-too-far": ({ distance }) =>
    `The target is ${distance} bytes away: JR and DJNZ reach -128 to 127. JP goes anywhere.`,
  "displacement-out-of-range": ({ displacement }) =>
    `The displacement ${displacement} is outside -128 to 127.`,
  "misplaced-org": () =>
    "org comes once, before the first instruction or data.",
  "unknown-label": ({ label }) => `The label ${label} is not defined anywhere.`,
  "size-defined-later": ({ label }) =>
    `defs needs ${label}, which is defined further down: define it first.`,
  "reserved-word": ({ label }) =>
    `${label} is a reserved word: pick another name.`,
  "past-end-of-memory": () => "This line goes past the end of memory, #FFFF.",
  "unsupported-character": ({ character }) =>
    `The character ${character} is not allowed: only ASCII characters are.`,
  "label-defined-twice": ({ label, firstLine }) =>
    `The label ${label} is already defined on line ${firstLine}.`,
};

const SENTENCES: Readonly<Record<Lang, Sentences>> = { fr, en };

/** The sentence a beginner reads for an assembler error, without its line. */
export function explain(error: AssemblyError, lang: Lang): string {
  // TypeScript cannot tie error.kind to the narrowed parameter of its sentence.
  const sentence = SENTENCES[lang][error.kind] as (
    error: AssemblyError,
  ) => string;
  return sentence(error);
}
