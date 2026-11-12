import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Block } from "./assemble.ts";

const execFileAsync = promisify(execFile);

// fantams reports `<file>: <n> bytes @ 0x<address>` after writing a raw binary.
const WRITTEN = /bytes @ 0x([0-9a-f]+)/i;

/**
 * Assembles `source` with the `fantams` binary on the PATH: the reference the
 * contract tests compare against (ADR 0003). The raw binary holds one block, so
 * a source with several ORGs is out of reach of this helper.
 */
export async function assembleWithFantams(source: string): Promise<Block[]> {
  const dir = await mkdtemp(join(tmpdir(), "easyz80-fantams-"));
  try {
    await writeFile(join(dir, "program.asm"), source);
    const { stdout, stderr } = await execFileAsync(
      "fantams",
      ["program.asm", "-o", "program.bin"],
      { cwd: dir },
    );
    const output = stdout + stderr;
    const address = WRITTEN.exec(output)?.[1];
    if (address === undefined) {
      throw new Error(`Unexpected fantams output: ${output}`);
    }
    const bytes = [...(await readFile(join(dir, "program.bin")))];
    return [{ address: Number.parseInt(address, 16), bytes }];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
