import { copyFileSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "dashboard";
const STAGED = `${NAME}-next`;
const source = fileURLToPath(new URL("../dist/dashboard.js", import.meta.url));
const sidebars = join(homedir(), ".config", "cmux", "sidebars");
const live = join(sidebars, `${NAME}.js`);
const staged = join(sidebars, `${STAGED}.js`);

const run = (...command: string[]) => {
  console.log(`$ ${command.join(" ")}`);
  const { exitCode } = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
};

try {
  run("bun", "run", "check");
  copyFileSync(source, staged);
  // cmux validates only files already in its sidebar folder, so the candidate is checked under a
  // staging name and swapped in only once it passes; a failure leaves the installed one alone.
  run("cmux", "sidebar", "validate", STAGED);
  renameSync(staged, live);
  run("cmux", "sidebar", "reload", NAME);
  console.log(`Installed ${readFileSync(live, "utf8").match(/cmux Dashboard · v\S+ \(\d+\)/)?.[0]}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rmSync(staged, { force: true });
}
