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

  it("reads IX and IY with a displacement, in lower case", async () => {
    await expectSameBytesAsFantams(
      " ld a,(ix-16)\n ld (iy+5),#ff\n bit 7,(ix+127)\n jp (ix)\n",
    );
  });

  it("places the program at the address given by org", async () => {
    await expectSameBytesAsFantams(" org #8000\n ld a,1\n halt\n");
  });

  it("reads the address of org in lower case", async () => {
    await expectSameBytesAsFantams(" org #c000\n halt\n");
  });

  // #7F82 is 128 bytes back from #8002, the address after the JR.
  it("jumps back as far as a relative jump reaches, after org", async () => {
    await expectSameBytesAsFantams(" org #8000\n jr #7F82\n");
  });

  it("jumps back to a label", async () => {
    await expectSameBytesAsFantams(" org #8000\nstart:\n ld a,1\n jp start\n");
  });

  it("jumps to a label whose address has hexadecimal letters", async () => {
    await expectSameBytesAsFantams(" org #C0DE\nloop: halt\n jp loop\n");
  });

  it("jumps forward to a label defined further down", async () => {
    await expectSameBytesAsFantams(
      " org #8000\n jr nz,skip\n call done\nskip: ld a,1\ndone: halt\n",
    );
  });

  it("reads and writes memory at a label", async () => {
    await expectSameBytesAsFantams(
      " org #8000\n ld a,(data)\n ld (data),a\n halt\ndata: nop\n",
    );
  });

  it("uses a constant named with equ", async () => {
    await expectSameBytesAsFantams(
      " org #8000\nscreen equ #4000\nwhite equ 1\n ld a,white\n ld (screen),a\n ld hl,screen\n",
    );
  });

  // In the first pass, a name not defined yet must not change the size.
  it("uses a constant before its equ, labels after it unmoved", async () => {
    await expectSameBytesAsFantams(
      " org #8000\n ld a,white\n jp done\ndone: halt\nwhite equ 1\n",
    );
  });

  it("stores bytes with defb", async () => {
    await expectSameBytesAsFantams(" org #8000\ncolors: defb 1,5,#FF\n");
  });

  it("stores text with defb, in either quotes", async () => {
    await expectSameBytesAsFantams(
      " org #8000\n defb \"Hi, you\",0\n defb 'ok;',13\n",
    );
  });

  it("stores 16-bit words with defw, low byte first", async () => {
    await expectSameBytesAsFantams(
      " org #8000\ntable: defw table,#1234,next\nnext: nop\n",
    );
  });

  it("reserves bytes with defs, filled with 0 or a given byte", async () => {
    await expectSameBytesAsFantams(
      " org #8000\nbuffer: defs 3\n defs 2,#AA\n ld hl,buffer\n",
    );
  });
});
