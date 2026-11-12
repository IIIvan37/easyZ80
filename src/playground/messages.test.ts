import { describe, expect, it } from "vitest";
import type { AssemblyError } from "../assembler/assemble.ts";
import { explain } from "./messages.ts";

describe("explain", () => {
  it.each<[AssemblyError, string, string]>([
    [
      { line: 1, kind: "number-too-big", value: 300, bits: 8 },
      "300 ne tient pas dans un octet, qui va de 0 à 255.",
      "300 does not fit in a byte, which holds 0 to 255.",
    ],
    [
      { line: 1, kind: "number-too-big", value: 70000, bits: 16 },
      "70000 ne tient pas sur 16 bits, qui vont de 0 à 65535.",
      "70000 does not fit in 16 bits, which hold 0 to 65535.",
    ],
    [
      { line: 1, kind: "unknown-mnemonic", mnemonic: "MOV" },
      "MOV n'est pas une instruction du Z80.",
      "MOV is not a Z80 instruction.",
    ],
    [
      { line: 1, kind: "wrong-operands", mnemonic: "LD" },
      "LD n'accepte pas ces opérandes.",
      "LD does not take these operands.",
    ],
    [
      { line: 1, kind: "ix-and-iy-together" },
      "Une instruction ne peut pas utiliser IX et IY à la fois.",
      "An instruction cannot use IX and IY together.",
    ],
    [
      { line: 1, kind: "jump-too-far", distance: 198 },
      "La cible est à 198 octets : JR et DJNZ vont de -128 à 127. JP va partout.",
      "The target is 198 bytes away: JR and DJNZ reach -128 to 127. JP goes anywhere.",
    ],
    [
      { line: 1, kind: "displacement-out-of-range", displacement: 200 },
      "Le décalage 200 sort de -128 à 127.",
      "The displacement 200 is outside -128 to 127.",
    ],
    [
      { line: 1, kind: "misplaced-org" },
      "org vient une seule fois, avant la première instruction ou donnée.",
      "org comes once, before the first instruction or data.",
    ],
    [
      { line: 1, kind: "unknown-label", label: "loop" },
      "Le label loop n'est défini nulle part.",
      "The label loop is not defined anywhere.",
    ],
    [
      { line: 1, kind: "size-defined-later", label: "size" },
      "defs a besoin de size, défini plus bas : le définir avant.",
      "defs needs size, which is defined further down: define it first.",
    ],
    [
      { line: 1, kind: "reserved-word", label: "IF" },
      "IF est un mot réservé : choisir un autre nom.",
      "IF is a reserved word: pick another name.",
    ],
    [
      { line: 1, kind: "past-end-of-memory" },
      "Cette ligne dépasse la fin de la mémoire, #FFFF.",
      "This line goes past the end of memory, #FFFF.",
    ],
    [
      { line: 1, kind: "unsupported-character", character: "é" },
      "Le caractère é n'est pas accepté : seuls les caractères ASCII le sont.",
      "The character é is not allowed: only ASCII characters are.",
    ],
    [
      { line: 5, kind: "label-defined-twice", label: "loop", firstLine: 2 },
      "Le label loop est déjà défini ligne 2.",
      "The label loop is already defined on line 2.",
    ],
  ])("writes the sentence for %o", (error, fr, en) => {
    expect(explain(error, "fr")).toBe(fr);
    expect(explain(error, "en")).toBe(en);
  });
});
