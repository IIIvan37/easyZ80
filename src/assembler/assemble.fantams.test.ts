import { describe, expect, it } from "vitest";
import { assemble } from "./assemble.ts";
import { assembleWithFantams } from "./fantams.ts";

// Seam 1 (ADR 0003): our assembler writes the same bytes as FantAMS.
async function expectSameBytesAsFantams(source: string) {
  const ours = assemble(source);
  expect(ours.errors).toEqual([]);
  expect(ours.blocks).toEqual(await assembleWithFantams(source));
}

describe("assemble, compared with FantAMS", () => {
  it("loads a number into A", async () => {
    await expectSameBytesAsFantams(" ld a,1\n");
  });

  it("stores A at an address written in hexadecimal", async () => {
    await expectSameBytesAsFantams(" ld (#4001),a\n");
  });

  it("halts the CPU", async () => {
    await expectSameBytesAsFantams(" halt\n");
  });

  it("assembles the first program of the tutorial, comments included", async () => {
    await expectSameBytesAsFantams(
      [
        "; Three pixels at the top left of the screen",
        " ld a,1",
        " ld (#4000),a  ; white",
        " ld a,5",
        " ld (#4001),a  ; green",
        " ld a,8",
        " ld (#4002),a  ; orange",
        " halt",
        "",
      ].join("\n"),
    );
  });
});
