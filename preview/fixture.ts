/** The frozen "now" every age below is measured from (2026-11-09 10:00:00 UTC). */
export const NOW = 1_794_218_400;

const ago = (seconds: number) => NOW - seconds;
const MINUTE = 60;
const HOUR = 60 * MINUTE;

const groups: Group[] = [
  { id: "g-work", name: "Work", collapsed: false, pinned: true, anchorId: "w-checkout" },
  { id: "g-side", name: "Side projects", collapsed: false, pinned: false, anchorId: "w-garden" },
];

interface SessionSpec {
  id: string;
  kind: "claude" | "codex";
  status: AgentStatus;
  tab: string;
  firstPrompt: string;
  latestPrompt?: string;
  lastActivity: number;
  since?: number;
  unread?: boolean;
  branch?: string;
  directory: string;
  subagents?: { label: string; started: number }[];
}

const session = (workspaceId: string, spec: SessionSpec): { tab: Tab; agent: Agent } => {
  const panelId = `${workspaceId}-${spec.id}-panel`;
  return {
    tab: {
      id: panelId,
      surfaceId: `${workspaceId}-${spec.id}-surface`,
      title: spec.tab,
      focused: false,
      pinned: false,
      hasUnread: spec.unread ?? false,
      directory: spec.directory,
      ...(spec.branch && { branch: spec.branch, dirty: true }),
      ...(spec.latestPrompt && { latestPrompt: spec.latestPrompt, latestAt: ago(spec.lastActivity) }),
    },
    agent: {
      id: spec.id,
      kind: spec.kind,
      name: spec.kind === "claude" ? "Claude" : "Codex",
      status: spec.status,
      lastActivityAt: ago(spec.lastActivity),
      ...(spec.since !== undefined && { sinceEpoch: ago(spec.since) }),
      title: spec.firstPrompt,
      panelId,
      directory: spec.directory,
      ...(spec.subagents && {
        children: spec.subagents.map((child, index) => ({
          id: `${spec.id}-child-${index}`,
          running: true,
          label: child.label,
          startedEpoch: ago(child.started),
        })),
      }),
    },
  };
};

const workspace = (
  id: string,
  title: string,
  color: string,
  group: string,
  directory: string,
  specs: SessionSpec[],
): Workspace => {
  const sessions = specs.map((spec) => session(id, spec));
  const tabs = sessions.map(({ tab }) => tab);
  return {
    id,
    title,
    color,
    group,
    selected: false,
    pinned: false,
    index: 0,
    directory,
    ports: [],
    portCount: 0,
    unread: tabs.filter((tab) => tab.hasUnread).length,
    status: "working",
    tabs,
    tabCount: tabs.length,
    branch: "main",
    agents: sessions.map(({ agent }) => agent).toSorted((first, second) => second.lastActivityAt - first.lastActivityAt),
  };
};

const workspaces: Workspace[] = [
  workspace("w-checkout", "Checkout API", "#1565C0", "g-work", "/Users/dev/code/checkout-api", [
    {
      id: "s-ratelimit",
      kind: "claude",
      status: "working",
      tab: "rate-limit-middleware",
      firstPrompt: "Add per-merchant rate limits to the payments endpoints",
      latestPrompt: "Run the load test again with 500 concurrent merchants",
      lastActivity: 20,
      since: 7 * MINUTE,
      branch: "feat/rate-limits",
      directory: "/Users/dev/code/checkout-api",
      subagents: [
        { label: "Review the limiter for race conditions", started: 3 * MINUTE },
        { label: "Write load-test scenarios", started: 2 * MINUTE },
        { label: "Check Redis key expiry", started: 45 },
      ],
    },
    {
      id: "s-refunds",
      kind: "claude",
      status: "needs_input",
      tab: "Partial refunds design",
      firstPrompt: "Design partial refunds for split payments",
      latestPrompt: "Plan how partial refunds settle across split payments",
      lastActivity: 2 * MINUTE,
      since: 2 * MINUTE,
      directory: "/Users/dev/code/checkout-api",
    },
  ]),
  workspace("w-mobile", "Mobile App", "#6A1B9A", "g-work", "/Users/dev/code/mobile-app", [
    {
      id: "s-darkmode",
      kind: "codex",
      status: "idle",
      tab: "Dark mode audit",
      firstPrompt: "Audit every screen for hard-coded colors",
      latestPrompt: "Fix the contrast issues you found on the settings screen",
      lastActivity: 4 * MINUTE,
      unread: true,
      directory: "/Users/dev/code/mobile-app",
    },
    {
      id: "s-push",
      kind: "claude",
      status: "working",
      tab: "Push notification retries",
      firstPrompt: "Retry failed push notifications with backoff",
      latestPrompt: "Use exponential backoff capped at one hour",
      lastActivity: 8,
      since: 12 * MINUTE,
      branch: "fix/push-retries",
      directory: "/Users/dev/code/mobile-app",
    },
  ]),
  workspace("w-docs", "Docs Site", "#196F3D", "g-work", "/Users/dev/code/docs", [
    {
      id: "s-search",
      kind: "claude",
      status: "idle",
      tab: "Search indexing",
      firstPrompt: "Why does search miss pages under /guides?",
      latestPrompt: "Rebuild the index and confirm the guides show up",
      lastActivity: 25 * MINUTE,
      directory: "/Users/dev/code/docs",
    },
  ]),
  workspace("w-garden", "Garden Planner", "#A04000", "g-side", "/Users/dev/code/garden-planner", [
    {
      id: "s-frost",
      kind: "codex",
      status: "idle",
      tab: "Frost date lookup",
      firstPrompt: "Look up the average last frost date from a postcode",
      latestPrompt: "Cache the frost dates per postcode for a week",
      lastActivity: 5 * HOUR,
      directory: "/Users/dev/code/garden-planner",
    },
    {
      id: "s-export",
      kind: "claude",
      status: "ended",
      tab: "Calendar export",
      firstPrompt: "Export the planting schedule as an .ics calendar",
      lastActivity: 9 * HOUR,
      directory: "/Users/dev/code/garden-planner",
    },
  ]),
];

const clock: Clock = { time: "10:00:00", hour: 10, minute: 0, second: 0, weekday: 2, epoch: NOW };

export const fixture = { workspaces, groups, clock };
