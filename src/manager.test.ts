import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { fixture } from "../preview/fixture.ts";
import { bundle } from "../scripts/build.ts";

// cmux's runtime is GPL-licensed, so it is loaded from the installed app rather than vendored.
const RUNTIME =
  process.env.CMUX_SIDEBAR_RUNTIME ??
  "/Applications/cmux.app/Contents/Resources/CmuxSwiftRenderUI_CmuxSwiftRenderUI.bundle/Contents/Resources/SidebarRuntime.js";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANAGER = readFileSync(join(ROOT, "dist", "manager.js"), "utf8");
const HOST = await bundle("examples/host.ts");

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

const mount = (data: typeof fixture, script = MANAGER) => {
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
  runInContext(script, context);

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
  const images = () =>
    walk(root)
      .map((id) => nodes.get(id))
      .filter((node) => node?.type === "image")
      .map((node) => String(node?.props.systemName ?? ""))
      .filter(Boolean);
  return { visibleTexts, tap, type, images };
};

const HEADERS = ["NEEDS YOU", "RUNNING", "RECENT", "IDLE", "ENDED"];
const titles = fixture.workspaces.flatMap((workspace) => workspace.tabs.map((tab) => tab.title));
const subagents = fixture.workspaces.flatMap((workspace) =>
  (workspace.agents ?? []).flatMap((agent) => (agent.children ?? []).map((child) => child.label ?? "")),
);
const outline = (texts: string[]) =>
  texts.filter((text) => HEADERS.includes(text) || titles.includes(text) || subagents.includes(text));
const FULL_OUTLINE = [
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
];

test("dist/manager.js is built from the current source", async () => {
  expect(await bundle("src/main.ts"), "dist is stale: run `bun run build`").toBe(MANAGER);
});

test("sorts sessions by what needs you, with subagents under their session and Ended collapsed", () => {
  const { visibleTexts } = mount(fixture);
  expect(outline(visibleTexts())).toEqual(FULL_OUTLINE);
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

test("a host sidebar draws its own Needs-you strip from the model, with cards that focus their tab", () => {
  const { visibleTexts, tap } = mount(fixture, HOST);
  expect(outline(visibleTexts())).toEqual(["Partial refunds design", "Dark mode audit"]);
  expect(tap("Dark mode audit")?.method).toBe("surface.focus");
});

test("a host sidebar mounts the whole manager as a page, and again after leaving it", () => {
  const { visibleTexts, tap, type } = mount(fixture, HOST);
  tap("Agents");
  expect(outline(visibleTexts())).toEqual(FULL_OUTLINE);
  type("garden");
  expect(outline(visibleTexts())).toEqual(["IDLE", "Frost date lookup", "ENDED"]);
  tap("Today");
  expect(outline(visibleTexts())).toEqual(["Partial refunds design", "Dark mode audit"]);
  tap("Agents");
  expect(outline(visibleTexts()), "a remounted manager starts with an empty search").toEqual(FULL_OUTLINE);
});

test("the manager draws its own title, and a host's header in its place", () => {
  const own = mount(fixture).visibleTexts();
  expect(own[0]).toBe("Manager");
  const host = mount(fixture, HOST);
  host.tap("Agents");
  const texts = host.visibleTexts();
  expect(texts.slice(0, 2), "the host's tabs lead the manager's header row").toEqual(["Today", "Agents"]);
  expect(texts).not.toContain("Manager");
  expect(
    texts.slice(2).filter((text) => text !== "Reload"),
    "everything after the host's header and button is the manager's own",
  ).toEqual(own.slice(1));
});

test("a host's trailing view ends the header row, after the tallies", () => {
  const host = mount(fixture, HOST);
  host.tap("Agents");
  expect(host.visibleTexts().indexOf("Reload"), "the reload button follows the four tallies").toBe(6);
  expect(host.tap("Reload")).toMatchObject({ method: "sidebar.custom.reload", params: { name: "host" } });
});

test("every section header leads with its icon", () => {
  const { images } = mount(fixture);
  expect(images()).toEqual(expect.arrayContaining(["hand.raised.fill", "play.fill", "clock.fill", "moon.zzz.fill", "stop.fill"]));
});
