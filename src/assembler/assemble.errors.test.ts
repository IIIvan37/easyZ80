import { describe, expect, it } from "vitest";
import { type AssemblyError, assemble } from "./assemble.ts";

// Seam 3 (ADR 0003): a mistake gives no bytes and an error at its line,
// reported as a code with data (ADR 0005).
function expectError(source: string, error: AssemblyError) {
  const { blocks, errors } = assemble(source);
  expect(blocks.flatMap((block) => block.bytes)).toEqual([]);
  expect(errors).toEqual([error]);
}

describe("assemble, mistakes of a beginner", () => {
  // The playground quotes the line itself; the code names a mnemonic upper-cased, a name as written.
  it("rejects a mnemonic the Z80 does not have", () => {
    expectError(" mov a,1\n", {
      line: 1,
      kind: "unknown-mnemonic",
      mnemonic: "MOV",
    });
  });

  it.each([
    [" ld a,bc\n", "LD"],
    [" ld bc\n", "LD"],
    [" add ix,hl\n", "ADD"],
    [" ex de,ix\n", "EX"],
  ])("rejects operands the mnemonic does not take: %s", (source, mnemonic) => {
    expectError(source, { line: 1, kind: "wrong-operands", mnemonic });
  });

  it("rejects IX and IY in the same instruction", () => {
    expectError(" add ix,iy\n", { line: 1, kind: "ix-and-iy-together" });
  });

  it("rejects a number too big for an 8-bit register", () => {
    expectError(" ld a,300\n", {
      line: 1,
      kind: "number-too-big",
      value: 300,
      bits: 8,
    });
  });

  it("rejects a port number above 255", () => {
    expectError(" out (300),a\n", {
      line: 1,
      kind: "number-too-big",
      value: 300,
      bits: 8,
    });
  });

  it.each([
    " ld bc,70000\n",
    " ld a,(70000)\n",
    " jp 70000\n",
    " call z,70000\n",
  ])("rejects a number above 65535: %s", (source) => {
    expectError(source, {
      line: 1,
      kind: "number-too-big",
      value: 70000,
      bits: 16,
    });
  });

  // JR and DJNZ reach from 128 bytes back to 127 forward, after their 2 bytes.
  it.each([" jr 200\n", " jr nz,200\n", " djnz 200\n"])(
    "rejects a relative jump too far: %s",
    (source) => {
      expectError(source, { line: 1, kind: "jump-too-far", distance: 198 });
    },
  );

  // (IX+d) and (IY+d) reach from 128 bytes back to 127 forward.
  it.each([
    [" ld a,(ix+128)\n", 128],
    [" ld (iy-129),a\n", -129],
  ])("rejects a displacement out of range: %s", (source, displacement) => {
    expectError(source, {
      line: 1,
      kind: "displacement-out-of-range",
      displacement,
    });
  });

  it("rejects an org without an address", () => {
    expectError(" org hello\n", {
      line: 1,
      kind: "wrong-operands",
      mnemonic: "ORG",
    });
  });

  it("rejects an org above 65535", () => {
    expectError(" org 70000\n", {
      line: 1,
      kind: "number-too-big",
      value: 70000,
      bits: 16,
    });
  });

  // One block per program: org comes once, before any instruction.
  it("rejects a second org", () => {
    expectError(" org #8000\n org #9000\n", {
      line: 2,
      kind: "misplaced-org",
    });
  });

  it("rejects an org after an instruction", () => {
    expect(assemble(" halt\n org #8000\n").errors).toEqual([
      { line: 2, kind: "misplaced-org" },
    ]);
  });

  it("rejects a label defined nowhere", () => {
    expectError(" jp nowhere\n", {
      line: 1,
      kind: "unknown-label",
      label: "nowhere",
    });
  });

  it("rejects a label defined twice", () => {
    expectError("loop:\n\nloop:\n", {
      line: 3,
      kind: "label-defined-twice",
      label: "loop",
      firstLine: 1,
    });
  });

  it("rejects a constant defined twice", () => {
    expectError("white equ 1\nwhite equ 2\n", {
      line: 2,
      kind: "label-defined-twice",
      label: "white",
      firstLine: 1,
    });
  });

  it("rejects an equ without a number", () => {
    expectError("white equ a\n", {
      line: 1,
      kind: "wrong-operands",
      mnemonic: "EQU",
    });
  });

  it("rejects an equ above 65535", () => {
    expectError("white equ 70000\n", {
      line: 1,
      kind: "number-too-big",
      value: 70000,
      bits: 16,
    });
  });

  // FantAMS writes such a character in UTF-8, several bytes: ASCII only.
  it.each([
    ['"5 €"', "€"],
    ['"café"', "é"],
  ])("rejects a character outside ASCII: %s", (text, character) => {
    expectError(` defb ${text}\n`, {
      line: 1,
      kind: "unsupported-character",
      character,
    });
  });

  it.each<[string, AssemblyError]>([
    [" defb 300\n", { line: 1, kind: "number-too-big", value: 300, bits: 8 }],
    [
      " defw 70000\n",
      { line: 1, kind: "number-too-big", value: 70000, bits: 16 },
    ],
    [" defs 2,300\n", { line: 1, kind: "number-too-big", value: 300, bits: 8 }],
    [" defb a\n", { line: 1, kind: "wrong-operands", mnemonic: "DEFB" }],
    [" defw 'ab'\n", { line: 1, kind: "wrong-operands", mnemonic: "DEFW" }],
    [" defs\n", { line: 1, kind: "wrong-operands", mnemonic: "DEFS" }],
    [" defs 1,2,3\n", { line: 1, kind: "wrong-operands", mnemonic: "DEFS" }],
    [" defb nowhere\n", { line: 1, kind: "unknown-label", label: "nowhere" }],
  ])("rejects data that does not fit: %s", (source, error) => {
    expectError(source, error);
  });

  // FantAMS sizes the program in its first pass: a DEFS count must be known by then.
  it.each([
    [" defs size\nsize equ 2\n", "size"],
    [" defs here\nhere:\n", "here"],
  ])("rejects a defs count defined further down: %s", (source, label) => {
    expectError(source, { line: 1, kind: "size-defined-later", label });
  });

  // FantAMS reads these names as an instruction, a register or one of its own
  // keywords, and starts its own names with `__`.
  it.each([
    ["halt: nop\n", "halt"],
    ["c:\n", "c"],
    ["end:\n", "end"],
    ["org:\n", "org"],
    ["defb:\n", "defb"],
    ["__start:\n", "__start"],
    ["if equ 1\n", "if"],
  ])("rejects a reserved word as a name: %s", (source, label) => {
    expectError(source, { line: 1, kind: "reserved-word", label });
  });

  // FantAMS would go on silently from address 0.
  it.each([" org #FFFF\n ld a,1\n", " org #FFFE\n defs 4\n"])(
    "rejects bytes past the end of memory: %s",
    (source) => {
      expectError(source, { line: 2, kind: "past-end-of-memory" });
    },
  );

  it("rejects a label past the end of memory", () => {
    expect(assemble(" org #FFFF\n nop\nafter:\n").errors).toEqual([
      { line: 3, kind: "past-end-of-memory" },
    ]);
  });

  it("keeps the last byte of memory", () => {
    expect(assemble(" org #FFFF\n nop\n")).toEqual({
      blocks: [{ address: 0xffff, bytes: [0] }],
      errors: [],
    });
  });
});

describe("assemble, names in errors", () => {
  // Names match whatever their case; the error keeps the spelling of its line,
  // so the sentence quotes what the beginner typed.
  it.each<[string, AssemblyError]>([
    [" jr far\n", { line: 1, kind: "unknown-label", label: "far" }],
    [
      "Loop:\nloop:\n",
      { line: 2, kind: "label-defined-twice", label: "loop", firstLine: 1 },
    ],
    ["Halt:\n", { line: 1, kind: "reserved-word", label: "Halt" }],
    [
      " defs Size\nsize equ 2\n",
      { line: 1, kind: "size-defined-later", label: "Size" },
    ],
  ])("keeps the name as written: %j", (source, error) => {
    expect(assemble(source).errors).toEqual([error]);
  });
});
