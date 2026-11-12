// Copies what tsc does not emit next to the compiled modules that load it.
import { cpSync } from "node:fs";

cpSync("src", "dist", {
  recursive: true,
  filter: (path) => !path.endsWith(".ts"),
});
