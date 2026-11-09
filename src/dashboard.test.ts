import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { fixture } from "../preview/fixture.ts";

// cmux's runtime is GPL-licensed, so it is loaded from the installed app rather than vendored.
const RUNTIME =
  process.env.CMUX_SIDEBAR_RUNTIME ??
  "/Applications/cmux.app/Contents/Resources/CmuxSwiftRenderUI_CmuxSwiftRenderUI.bundle/Contents/Resources/SidebarRuntime.js";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DASHBOARD = readFileSync(join(ROOT, "dist", "dashboard.js"), "utf8");

type Op =
  | { op: "create"; id: string; type: string }
  | { op: "update"; id: string; key: string; value: unknown }
  | { op: "children"; id: string; children: string[] }
  | { op: "append"; id: string; child: string }
  | { op: "remove"; id: string }
  | { op: "root"; id: string };

interface SceneNode {
  type: string;
  props: Record<string, unknown>;
  children: string[];
}

interface Action {
  kind: string;
  method?: string;
  params?: Record<string, string>;
}

const mount = (data: typeof fixture) => {
  const nodes = new Map<string, SceneNode>();
  const actions: Action[] = [];
  let root = "";
  const apply = (op: Op) => {
    const node = nodes.get(op.id);
    switch (op.op) {
      case "create":
        nodes.set(op.id, { type: op.type, props: {}, children: [] });
        break;
      case "update":
        if (node) {
          node.props[op.key] = op.value;
        }
        break;
      case "children":
        if (node) {
          node.children = op.children;
        }
        break;
      case "append":
        node?.children.push(op.child);
        break;
      case "remove":
        nodes.delete(op.id);
        break;
      case "root":
        root = op.id;
        break;
    }
  };
  const context = createContext({
    __host_applyOps: (json: string) => (JSON.parse(json) as Op[]).forEach(apply),
    __host_action: (json: string) => actions.push(JSON.parse(json) as Action),
    __host_log: () => {},
    __host_clipboardWrite: () => false,
  });
  runInContext(readFileSync(RUNTIME, "utf8"), context);
  const setData = (key: string, value: unknown) => context.__setData(key, JSON.stringify(value));
  Object.entries(data).forEach(([key, value]) => setData(key, value));
  runInContext(DASHBOARD, context);

  const walk = (id: string): string[] => [id, ...(nodes.get(id)?.children ?? []).flatMap(walk)];
  const visibleTexts = () =>
    walk(root)
      .map((id) => nodes.get(id))
      .filter((node) => node?.type === "text")
      .map((node) => String(node?.props.text ?? ""))
      .filter(Boolean);
  const tappableHolding = (text: string) =>
    walk(root)
      .filter((id) => nodes.get(id)?.props.tappable)
      .findLast((id) => walk(id).some((inner) => nodes.get(inner)?.props.text === text));
  const tap = (text: string) => {
    const id = tappableHolding(text);
    if (!id) {
      throw new Error(`nothing tappable shows "${text}"`);
    }
    context.__dispatch(id, "tap", "");
    return actions.at(-1);
  };
  const type = (text: string) => {
    const field = walk(root).find((id) => nodes.get(id)?.type === "textfield");
    context.__dispatch(field, "edit", JSON.stringify({ text }));
  };
  return { visibleTexts, tap, type };
};

const HEADERS = ["NEEDS YOU", "RUNNING", "RECENT", "IDLE", "ENDED"];
const titles = fixture.workspaces.flatMap((workspace) => workspace.tabs.map((tab) => tab.title));
const subagents = fixture.workspaces.flatMap((workspace) =>
  (workspace.agents ?? []).flatMap((agent) => (agent.children ?? []).map((child) => child.label ?? "")),
);
const outline = (texts: string[]) =>
  texts.filter((text) => HEADERS.includes(text) || titles.includes(text) || subagents.includes(text));

test("dist/dashboard.js is built from the current source", () => {
  const out = mkdtempSync(join(tmpdir(), "dashboard-build-"));
  const { exitCode, stdout } = Bun.spawnSync(
    [join(ROOT, "node_modules", ".bin", "tsc"), "-p", join(ROOT, "tsconfig.build.json"), "--outDir", out],
    { cwd: ROOT },
  );
  expect(stdout.toString()).toBe("");
  expect(exitCode).toBe(0);
  expect(readFileSync(join(out, "dashboard.js"), "utf8"), "dist is stale: run `bun run build`").toBe(DASHBOARD);
});

test("sorts sessions by what needs you, with subagents under their session and Ended collapsed", () => {
  const { visibleTexts } = mount(fixture);
  expect(outline(visibleTexts())).toEqual([
    "NEEDS YOU",
    "Partial refunds design",
    "Dark mode audit",
    "RUNNING",
    "Push notification retries",
    "rate-limit-middleware",
    "Review the limiter for race conditions",
    "Write load-test scenarios",
    "Check Redis key expiry",
    "RECENT",
    "Search indexing",
    "IDLE",
    "Frost date lookup",
    "ENDED",
  ]);
});

test("tapping a session focuses its own tab, not just its workspace", () => {
  const { tap } = mount(fixture);
  expect(tap("Dark mode audit")).toEqual({
    kind: "cmux",
    method: "surface.focus",
    params: { surface_id: "w-mobile-s-darkmode-surface", workspace_id: "w-mobile" },
  });
  expect(tap("Check Redis key expiry")?.params?.surface_id).toBe("w-checkout-s-ratelimit-surface");
});

test("a tab with no focus target yet selects its workspace", () => {
  const pending = structuredClone(fixture);
  pending.workspaces.forEach((workspace) => workspace.tabs.forEach((tab) => delete tab.surfaceId));
  expect(mount(pending).tap("Search indexing")).toEqual({
    kind: "cmux",
    method: "workspace.select",
    params: { workspace_id: "w-docs" },
  });
});

test("search narrows the list to matching sessions", () => {
  const { visibleTexts, type } = mount(fixture);
  type("garden");
  expect(outline(visibleTexts())).toEqual(["IDLE", "Frost date lookup", "ENDED"]);
});
