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
  // The playground quotes the line itself; the code names the word, upper-cased.
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
      label: "NOWHERE",
    });
  });

  it("rejects a label defined twice", () => {
    expectError("loop:\n\nloop:\n", {
      line: 3,
      kind: "label-defined-twice",
      label: "LOOP",
      firstLine: 1,
    });
  });
});
