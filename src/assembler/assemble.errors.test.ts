import { describe, expect, it } from "vitest";
import { assemble } from "./assemble.ts";

// Seam 3 (ADR 0003): a mistake gives no bytes and an error at its line.
function expectErrorAtLine(source: string, line: number) {
  const { blocks, errors } = assemble(source);
  expect(blocks.flatMap((block) => block.bytes)).toEqual([]);
  expect(errors.map((error) => error.line)).toEqual([line]);
}

describe("assemble, mistakes of a beginner", () => {
  it("rejects IX and IY in the same instruction", () => {
    expectErrorAtLine(" add ix,iy\n", 1);
  });

  it("rejects a number too big for an 8-bit register", () => {
    expectErrorAtLine(" ld a,300\n", 1);
  });

  it("rejects a port number above 255", () => {
    expectErrorAtLine(" out (300),a\n", 1);
  });
});
