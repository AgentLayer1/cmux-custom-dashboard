import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PREVIEW_NAME, writePreview } from "./build.ts";
import { crop, decodePng, encodePng, panelRect } from "./png.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface Step {
  args: string[];
  /**
   * Milliseconds to wait before running it, for cmux to draw what the steps before it changed.
   */
  wait?: number;
}

const cmux = (...args: string[]): string => {
  const result = Bun.spawnSync(["cmux", ...args], { stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`cmux ${args.join(" ")}: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`);
  }
  return result.stdout.toString();
};

const windowIds = (): string[] => {
  const listed: unknown = JSON.parse(cmux("rpc", "window.list", "{}"));
  const windows = typeof listed === "object" && listed !== null && "windows" in listed ? listed.windows : [];
  return Array.isArray(windows)
    ? windows.flatMap((window: unknown) =>
        typeof window === "object" && window !== null && "id" in window && typeof window.id === "string"
          ? [window.id]
          : [],
      )
    : [];
};

const runSteps = async (steps: readonly Step[]): Promise<void> => {
  for (const { args, wait } of steps) {
    if (wait) {
      await Bun.sleep(wait);
    }
    cmux(...args);
  }
};

/**
 * Runs `body` in a window it opens for the purpose and always closes, so nothing it does can reach the windows that
 * were already open: the new window is the one id that wasn't listed before, and every step names it.
 */
const inNewWindow = async <Result>(name: string, body: (window: string) => Promise<Result>): Promise<Result> => {
  const before = new Set(windowIds());
  cmux("new-window", "--name", name);
  const opened = async (tries: number): Promise<string[]> => {
    const fresh = windowIds().filter((id) => !before.has(id));
    if (fresh.length || tries === 0) {
      return fresh;
    }
    await Bun.sleep(200);
    return opened(tries - 1);
  };
  const fresh = await opened(15);
  const [window] = fresh;
  if (fresh.length !== 1 || !window) {
    throw new Error(
      `expected one new window, found ${fresh.length}; no other window was touched, close any new one by hand`,
    );
  }
  try {
    return await body(window);
  } finally {
    cmux("close-window", "--window", window, "--force");
  }
};

/**
 * The steps that turn `window` into the shot: a fixed size, the preview sidebar on its right, then the screenshot.
 */
export const shotSteps = (window: string, sidebar: string, out: string): Step[] => [
  { args: ["resize-window", "--window", window, "--width", "1400", "--height", "900"] },
  { args: ["right-sidebar", "set", "custom", sidebar, "--window", window] },
  { args: ["shot", "--window", window, "--out", out], wait: 1500 },
];

/**
 * Writes the right sidebar of the window shot at `full` to `out`, cropped by panelRect.
 */
const writePanel = (full: string, out: string): void => {
  const image = decodePng(readFileSync(full));
  writeFileSync(out, encodePng(crop(image, panelRect(image))));
};

if (import.meta.main) {
  const out = join(ROOT, "assets", "screenshot.png");
  const full = join(mkdtempSync(join(tmpdir(), "manager-shot-")), "full.png");
  writePreview();
  await inNewWindow("cmux Manager preview", (window) => runSteps(shotSteps(window, PREVIEW_NAME, full)));
  writePanel(full, out);
  console.log(`Wrote ${out} (the panel), from ${full} (the whole window).`);
}
