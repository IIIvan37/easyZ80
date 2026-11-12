import { describe, expect, it } from "vitest";
import { assemble } from "./assemble.ts";
import { disassemble, documentedInstructions } from "./cell80-disassembler.ts";

// Seam 2 (ADR 0003): each documented instruction, assembled, decodes back to
// the same text in cell80, and its bytes make exactly one instruction.
function expectRoundTrip(text: string) {
  const { blocks, errors } = assemble(` ${text}\n`);
  expect(errors).toEqual([]);
  const bytes = blocks.flatMap((block) => block.bytes);
  expect(disassemble(bytes)).toEqual({ text, length: bytes.length });
}

describe("assemble, decoded back by cell80", () => {
  it.each(documentedInstructions([]))("%s", expectRoundTrip);
  it.each(documentedInstructions([0xcb]))("%s", expectRoundTrip);
  it.each(documentedInstructions([0xed]))("%s", expectRoundTrip);
  it.each(documentedInstructions([0xdd]))("%s", expectRoundTrip);
  it.each(documentedInstructions([0xfd]))("%s", expectRoundTrip);
  it.each(documentedInstructions([0xdd, 0xcb]))("%s", expectRoundTrip);
  it.each(documentedInstructions([0xfd, 0xcb]))("%s", expectRoundTrip);
  // The sweeps above only use +52 as the displacement.
  it.each([
    "LD A,(IX-16)",
    "LD (IY-128),#FF",
    "BIT 7,(IX+127)",
    "SET 0,(IY-1)",
  ])("%s", expectRoundTrip);
});
