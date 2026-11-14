import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Bundles a sidebar entry into the one script cmux loads, headed by the entry's leading comment.
 */
export const bundle = async (entry: string) => {
  const path = join(ROOT, entry);
  const header = readFileSync(path, "utf8").match(/^\/\*[\s\S]*?\*\//)?.[0];
  if (!header) {
    throw new Error(`${entry} must open with a /* … */ header comment`);
  }
  const { outputs } = await Bun.build({ entrypoints: [path], root: ROOT, format: "esm", target: "browser", banner: header });
  const [output] = outputs;
  if (!output) {
    throw new Error(`bundling ${entry} produced no output`);
  }
  return output.text();
};

if (import.meta.main) {
  const out = join(ROOT, "dist", "dashboard.js");
  writeFileSync(out, await bundle("src/main.ts"));
  console.log(`Wrote ${out}`);
}
