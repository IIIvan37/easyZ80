import { describe, expect, it } from "vitest";
import { type AssemblyError, assemble } from "./assemble.ts";

// Seam 3 (ADR 0003): a mistake gives no bytes and an error at its line,
// reported as a code with data (ADR 0005).
function expectErrorAtLine(source: string, line: number) {
  const { blocks, errors } = assemble(source);
  expect(blocks.flatMap((block) => block.bytes)).toEqual([]);
  expect(errors.map((error) => error.line)).toEqual([line]);
}

function expectError(source: string, error: AssemblyError) {
  const { blocks, errors } = assemble(source);
  expect(blocks.flatMap((block) => block.bytes)).toEqual([]);
  expect(errors).toEqual([error]);
}

describe("assemble, mistakes of a beginner", () => {
  it("rejects IX and IY in the same instruction", () => {
    expectErrorAtLine(" add ix,iy\n", 1);
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
    expectErrorAtLine(" out (300),a\n", 1);
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
});
