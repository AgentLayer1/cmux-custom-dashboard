/// <reference path="./runtime.d.ts" />

const RECENT_SECS = 60 * 60;
const ENDED_SECS = 24 * 60 * 60;

export const SECTIONS = {
  needs: { label: "NEEDS YOU", color: "#FF9F0A" },
  running: { label: "RUNNING", color: "#34C759" },
  recent: { label: "RECENT", color: "#0A84FF" },
  idle: { label: "IDLE", color: "#8E8E93" },
  ended: { label: "ENDED", color: "#8E8E9366" },
};
export type Section = keyof typeof SECTIONS;
// Object.keys widens the keys to string.
export const ORDER = Object.keys(SECTIONS) as Section[];

export interface Card {
  key: string;
  section: Section;
  agent: Agent;
  subagents: AgentChild[];
  workspaceId: string;
  workspaceTitle: string;
  workspaceColor: string;
  focusId: string;
  groupId: string;
  group: string;
  folder: string;
  branch: string;
  title: string;
  summary: string;
  searchText: string;
}

export const epoch = () => data.clock()?.epoch ?? 0;
// The sections only move at the 1h and 24h marks, so the card pipeline follows a minute clock: a
// number, which the runtime's signals skip when unchanged, instead of the per-second clock object.
const minute = computed(() => Math.floor(epoch() / 60));

export const fmtSpan = (secs: number) => {
  const total = Math.max(0, Math.floor(secs));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${Math.floor(hours / 24)}d`;
};

const lastSegment = (path: string) => path.split("/").filter(Boolean).at(-1) ?? "";

// cmux records anything delivered into the prompt as the latest prompt, including subagent
// hand-backs and command wrappers (`<agent-message …>`, `<command-name>`); those aren't summaries.
const isProse = (text: string | undefined): text is string => !!text && !text.trimStart().startsWith("<");

// cmux reports a finished turn as `idle` even while background subagents run (they show only as
// running children), and a finished turn you haven't looked at only as the tab's unread flag.
const sectionOf = (agent: Agent, subagents: AgentChild[], unread: boolean, now: number): Section | null => {
  if (agent.status === "needs_input") {
    return "needs";
  }
  if (agent.status === "working" || subagents.length > 0) {
    return "running";
  }
  if (agent.status === "ended") {
    return now - (agent.lastActivityAt ?? 0) <= ENDED_SECS ? "ended" : null;
  }
  if (unread) {
    return "needs";
  }
  return now - (agent.lastActivityAt ?? 0) <= RECENT_SECS ? "recent" : "idle";
};

/**
 * Every agent session across cmux's workspaces, one card each, unfiltered and unsorted.
 * Shared by everything in the sidebar that reads it.
 */
export const agentCards = computed((): Card[] => {
  const now = minute() * 60;
  const groupNames = new Map((data.groups() ?? []).map((group) => [group.id, group.name]));
  return (data.workspaces() ?? []).flatMap((workspace) =>
    (workspace.agents ?? []).flatMap((agent) => {
      const tab = (workspace.tabs ?? []).find((item) => item.id === agent.panelId);
      const subagents = (agent.children ?? []).filter((child) => child.running);
      const section = sectionOf(agent, subagents, Boolean(tab?.hasUnread), now);
      if (section === null) {
        return [];
      }
      const title = tab?.title || agent.title || agent.name;
      // No per-agent "last said" text exists in cmux's data; the tab's last prompt is the
      // closest per-session summary, then the session's first prompt.
      const prompts = [tab?.latestPrompt, agent.title].filter(isProse);
      const groupId = workspace.group ?? "";
      return [
        {
          key: `${workspace.id}:${agent.id}`,
          section,
          agent,
          subagents,
          workspaceId: workspace.id,
          workspaceTitle: workspace.title ?? "",
          workspaceColor: workspace.color ?? "",
          // cmux 0.65.2 fills agent.surfaceId with the bonsplit tab id, which surface.focus
          // rejects; the hosting tab's surfaceId is the id the surface.* verbs accept.
          focusId: tab?.surfaceId ?? "",
          groupId,
          group: groupNames.get(groupId) ?? "",
          folder: lastSegment(agent.directory ?? tab?.directory ?? workspace.directory),
          branch: tab?.branch ?? workspace.branch ?? "",
          title,
          summary: prompts.find((text) => text !== title) ?? "",
          searchText: prompts.join(" "),
        },
      ];
    }),
  );
});

const needsInputThenNewest = (first: Card, second: Card) =>
  Number(second.agent.status === "needs_input") - Number(first.agent.status === "needs_input") ||
  (second.agent.lastActivityAt ?? 0) - (first.agent.lastActivityAt ?? 0);

/**
 * Cards split by section, each list with sessions waiting on input first, then newest.
 */
export const bySection = (cards: Card[]) =>
  // Object.fromEntries widens the keys to string.
  Object.fromEntries(
    ORDER.map((section) => [section, cards.filter((card) => card.section === section).toSorted(needsInputThenNewest)]),
  ) as Record<Section, Card[]>;

/**
 * Focuses a session's tab, which selects its workspace too; a tab with no focus target yet
 * (a remote tmux pane still connecting) can only take the workspace.
 */
export const jump = (workspaceId: string, focusId: string) =>
  focusId
    ? cmux("surface.focus", { surface_id: focusId, workspace_id: workspaceId })
    : cmux("workspace.select", { workspace_id: workspaceId });
