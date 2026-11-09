/*
 * cmux Dashboard · v0.1.0 (2)
 * Every coding agent in cmux, sorted by what needs you.
 *
 *   NEEDS YOU   waiting on input, or a finished turn you haven't looked at
 *   RUNNING     working, or one of its subagents still is
 *   RECENT      idle for under an hour
 *   IDLE        idle for over an hour
 *   ENDED       ended in the last 24 hours (collapsed)
 *
 * Install   cp dashboard.js ~/.config/cmux/sidebars/dashboard.js
 * Open      cmux right-sidebar set custom dashboard    side panel, resizable
 *           cmux sidebar open dashboard                pane tab
 * Check     cmux sidebar validate dashboard
 *
 * All state is cmux's own (workspaces[].agents[], children[], tabs[]); this file only draws it.
 *
 * https://github.com/AgentLayer1/cmux-custom-dashboard · MIT © 2026 AgentLayer
 */

const [query, setQuery] = signal("");
const [groupFilter, setGroupFilter] = signal("");
const [collapsed, setCollapsed] = signal(["ended"]);

const toggleSection = (section) =>
  setCollapsed(collapsed().includes(section) ? collapsed().filter((name) => name !== section) : [...collapsed(), section]);

const RECENT_SECS = 60 * 60;
const ENDED_SECS = 24 * 60 * 60;
const YOUR_MOVE = "#FFD60A";
const MAIN_BRANCH = /^(main|master)$/;

const SECTIONS = {
  needs: { label: "NEEDS YOU", color: "#FF9F0A" },
  running: { label: "RUNNING", color: "#34C759" },
  recent: { label: "RECENT", color: "#0A84FF" },
  idle: { label: "IDLE", color: "#8E8E93" },
  ended: { label: "ENDED", color: "#8E8E9366" },
};
const ORDER = Object.keys(SECTIONS);

const epoch = () => data.clock()?.epoch ?? 0;
// The sections only move at the 1h and 24h marks, so the card pipeline follows a minute clock: a
// number, which the runtime's signals skip when unchanged, instead of the per-second clock object.
const minute = computed(() => Math.floor(epoch() / 60));

const fmtSpan = (secs) => {
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

const lastSegment = (path) => String(path ?? "").split("/").filter(Boolean).at(-1) ?? "";

// cmux records anything delivered into the prompt as the latest prompt, including subagent
// hand-backs and command wrappers (`<agent-message …>`, `<command-name>`); those aren't summaries.
const isProse = (text) => Boolean(text) && !text.trimStart().startsWith("<");

// cmux reports a finished turn as `idle` even while background subagents run (they show only as
// running children), and a finished turn you haven't looked at only as the tab's unread flag.
const sectionOf = (agent, subagents, unread, now) => {
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

const unfilteredCards = computed(() => {
  const now = minute() * 60;
  const groupNames = new Map((data.groups() ?? []).map((group) => [group.id, group.name]));
  return (data.workspaces() ?? [])
    .flatMap((workspace) =>
      (workspace.agents ?? []).map((agent) => {
        const tab = (workspace.tabs ?? []).find((item) => item.id === agent.panelId);
        const title = tab?.title || agent.title || agent.name;
        const subagents = (agent.children ?? []).filter((child) => child.running);
        // No per-agent "last said" text exists in cmux's data; the tab's last prompt is the
        // closest per-session summary, then the session's first prompt.
        const prompts = [tab?.latestPrompt, agent.title].filter(isProse);
        return {
          key: `${workspace.id}:${agent.id}`,
          section: sectionOf(agent, subagents, Boolean(tab?.hasUnread), now),
          agent,
          subagents,
          workspaceId: workspace.id,
          workspaceTitle: workspace.title ?? "",
          workspaceColor: workspace.color ?? "",
          // cmux 0.65.2 fills agent.surfaceId with the bonsplit tab id, which surface.focus
          // rejects; the hosting tab's surfaceId is the id the surface.* verbs accept.
          focusId: tab?.surfaceId ?? "",
          groupId: workspace.group ?? "",
          group: groupNames.get(workspace.group) ?? "",
          folder: lastSegment(agent.directory ?? tab?.directory ?? workspace.directory),
          branch: tab?.branch ?? workspace.branch ?? "",
          title,
          summary: prompts.find((text) => text !== title) ?? "",
          searchText: prompts.join(" "),
        };
      }),
    )
    .filter((card) => card.section !== null);
});

// cmux's right-sidebar host passes no groups (still true in 0.65.2), so there the chip row disappears.
const groupChips = computed(() => {
  const withAgents = new Set(unfilteredCards().map((card) => card.groupId));
  return (data.groups() ?? []).filter((group) => withAgents.has(group.id));
});
const effectiveGroupFilter = computed(() =>
  groupChips().some((group) => group.id === groupFilter()) ? groupFilter() : "",
);

const cards = computed(() => {
  const tokens = query().trim().toLowerCase().split(/\s+/).filter(Boolean);
  return unfilteredCards()
    .filter((card) => !effectiveGroupFilter() || card.groupId === effectiveGroupFilter())
    .filter((card) => {
      const haystack = [card.title, card.searchText, card.workspaceTitle, card.group, card.folder, card.branch]
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
});

const needsInputThenNewest = (first, second) =>
  Number(second.agent.status === "needs_input") - Number(first.agent.status === "needs_input") ||
  (second.agent.lastActivityAt ?? 0) - (first.agent.lastActivityAt ?? 0);

const bySection = computed(() =>
  Object.fromEntries(
    ORDER.map((section) => [
      section,
      cards()
        .filter((card) => card.section === section)
        .toSorted(needsInputThenNewest),
    ]),
  ),
);

const entries = computed(() =>
  ORDER.flatMap((section) => {
    const list = bySection()[section];
    if (list.length === 0) {
      return [];
    }
    const header = { key: `h:${section}`, kind: "header", section, count: list.length };
    if (collapsed().includes(section)) {
      return [header];
    }
    return [
      header,
      ...list.flatMap((card) => [
        { ...card, kind: "card" },
        ...card.subagents.map((child) => ({
          key: `c:${card.key}:${child.id}`,
          kind: "child",
          child,
          workspaceId: card.workspaceId,
          focusId: card.focusId,
        })),
      ]),
    ];
  }),
);

// surface.focus selects the workspace as well; a tab with no focus target yet (a remote tmux
// pane still connecting) can only take the workspace.
const jump = (workspaceId, focusId) =>
  focusId
    ? cmux("surface.focus", { surface_id: focusId, workspace_id: workspaceId })
    : cmux("workspace.select", { workspace_id: workspaceId });

const dotColor = (card) =>
  card.section === "needs" && card.agent.status !== "needs_input" ? YOUR_MOVE : SECTIONS[card.section].color;

const timeText = (agent) => {
  const live = agent.status === "working" || agent.status === "needs_input";
  const start = (live && agent.sinceEpoch) || agent.lastActivityAt;
  return start ? fmtSpan(epoch() - start) : "";
};

// Badges as data, so a row shows only the ones it has (the runtime has no conditional views).
// A ForEach renders as a group whose own default layoutPriority wraps every row, overriding any
// priority set on a badge, so width is settled by `fixedSize` instead: fixed badges never truncate,
// flexible ones share what is left.
const badgesOf = (card) =>
  [
    card.subagents.length > 0 && {
      key: "subagents",
      text: String(card.subagents.length),
      icon: "person.2.fill",
      fg: SECTIONS.running.color,
      bg: `${SECTIONS.running.color}26`,
      flexible: false,
    },
    card.workspaceTitle && {
      key: "workspace",
      text: card.workspaceTitle,
      icon: "circle.fill",
      fg: card.workspaceColor || "secondary",
      bg: card.workspaceColor ? `${card.workspaceColor}2e` : "#7f7f7f26",
      flexible: false,
    },
    card.branch && !MAIN_BRANCH.test(card.branch) && {
      key: "branch",
      text: card.branch,
      icon: "arrow.triangle.branch",
      fg: "green",
      bg: "#34C7591f",
      flexible: true,
    },
    card.folder && card.folder !== card.workspaceTitle && {
      key: "folder",
      text: card.folder,
      icon: "folder",
      fg: "secondary",
      bg: "#7f7f7f1f",
      flexible: true,
    },
  ].filter(Boolean);

const badge = (item) =>
  HStack({ spacing: 3 }, [
    Image(() => item().icon)
      .font(8)
      .color(() => item().fg),
    Text(() => item().text)
      .font(10)
      .weight("medium")
      .color(() => item().fg)
      .lineLimit(1)
      .truncation("tail"),
  ])
    .paddingHorizontal(6)
    .paddingVertical(2)
    .background(() => item().bg)
    .cornerRadius(5)
    .fixedSize(() => (item().flexible ? null : "horizontal"));

const chip = (label, active, onTap) =>
  Text(label)
    .font(11)
    .weight("semibold")
    .paddingHorizontal(8)
    .paddingVertical(3)
    .cornerRadius(6)
    .color(() => (active() ? "primary" : "tertiary"))
    .background(() => (active() ? "#7f7f7f3d" : null))
    .hoverBackground("#7f7f7f3d")
    .cursor("pointer")
    .fixedSize("horizontal")
    .onTap(onTap);

const headerRow = (entry) => {
  const meta = () => SECTIONS[entry().section];
  return HStack({ spacing: 6 }, [
    Text(() => meta().label)
      .font(10)
      .weight("bold")
      .color(() => meta().color),
    Text(() => String(entry().count))
      .font(10)
      .monospaced()
      .color("tertiary"),
    Spacer(),
    Image(() => (collapsed().includes(entry().section) ? "chevron.right" : "chevron.down"))
      .font(9)
      .weight("semibold")
      .color("tertiary"),
  ])
    .paddingHorizontal(10)
    .paddingTop(10)
    .paddingBottom(2)
    .frame({ maxWidth: "infinity" })
    .cursor("pointer")
    .onTap(() => toggleSection(entry().section));
};

const cardRow = (card) =>
  VStack({ spacing: 4 }, [
    HStack({ spacing: 7 }, [
      Circle({ size: 7 }).fill(() => dotColor(card())),
      Text(() => card().title)
        .font(13)
        .weight("semibold")
        .color(() => (card().section === "idle" || card().section === "ended" ? "secondary" : "primary"))
        .lineLimit(1)
        .truncation("tail"),
      Spacer({ minLength: 4 }),
      Text(() => timeText(card().agent))
        .font(10)
        .monospaced()
        .color("tertiary")
        .fixedSize(),
    ]),
    HStack({ spacing: 4 }, [ForEach({ items: () => badgesOf(card()), key: (item) => item.key }, badge)])
      .paddingLeading(14)
      .frame({ maxWidth: "infinity" }),
    ForEach({ items: () => (card().summary ? [card().summary] : []), key: () => "summary" }, (summary) =>
      Text(() => summary())
        .font(11)
        .color("tertiary")
        .lineLimit(2)
        .truncation("tail")
        .paddingLeading(14),
    ),
  ])
    .paddingHorizontal(10)
    .paddingVertical(8)
    .cornerRadius(10)
    .background(() => (card().agent.status === "needs_input" ? "#FF9F0A1f" : "#7f7f7f0d"))
    .hoverBackground("#7f7f7f26")
    .cursor("pointer")
    .frame({ maxWidth: "infinity" })
    .onTap(() => jump(card().workspaceId, card().focusId));

const childRow = (entry) => {
  const child = () => entry().child;
  return HStack({ spacing: 6 }, [
    Text("└").font(10).monospaced().color("tertiary"),
    Circle({ size: 5 }).fill(SECTIONS.running.color),
    Text(() => child().label || "subagent")
      .font(11)
      .color("secondary")
      .lineLimit(1)
      .truncation("tail"),
    Spacer({ minLength: 0 }),
    Text(() => fmtSpan(epoch() - (child().startedEpoch ?? epoch())))
      .font(10)
      .monospaced()
      .color("tertiary")
      .fixedSize(),
  ])
    .paddingLeading(26)
    .paddingTrailing(10)
    .paddingVertical(2)
    .cornerRadius(6)
    .hoverBackground("#7f7f7f1c")
    .frame({ maxWidth: "infinity" })
    .onTap(() => jump(entry().workspaceId, entry().focusId));
};

const ROWS = { header: headerRow, card: cardRow, child: childRow };

const tally = (section) =>
  HStack({ spacing: 4 }, [
    Circle({ size: 7 }).fill(SECTIONS[section].color),
    Text(() => String(bySection()[section].length))
      .font(11)
      .weight("semibold")
      .monospaced()
      .color(() => (bySection()[section].length ? "secondary" : "quaternary")),
  ]).fixedSize();

sidebar(() =>
  VStack({ spacing: 8 }, [
    HStack({ spacing: 12 }, [
      HStack({ spacing: 6 }, [
        Image("square.grid.2x2").font(12).color("accent"),
        Text("Dashboard").font(13).weight("semibold"),
      ]).fixedSize(),
      Spacer({ minLength: 0 }),
      ...ORDER.filter((section) => section !== "ended").map(tally),
    ]).paddingHorizontal(10),

    ForEach({ items: () => (groupChips().length ? ["chips"] : []), key: (item) => item }, () =>
      HStack({ spacing: 4 }, [
        chip("All", () => !effectiveGroupFilter(), () => setGroupFilter("")),
        ForEach({ items: groupChips, key: (group) => group.id }, (group) =>
          chip(
            () => group().name,
            () => effectiveGroupFilter() === group().id,
            () => setGroupFilter(effectiveGroupFilter() === group().id ? "" : group().id),
          ),
        ),
        Spacer(),
      ]).paddingHorizontal(10),
    ),

    // The runtime's TextField is borderless, so the box comes from this wrapper.
    HStack([
      HStack({ spacing: 6 }, [
        Image("magnifyingglass").font(12).color("secondary"),
        TextField("", {
          placeholder: "Search sessions…",
          autofocus: false,
          onEdit: (text) => setQuery(text ?? ""),
        }),
      ])
        .paddingHorizontal(9)
        .paddingVertical(6)
        .background("#7f7f7f24")
        .cornerRadius(8),
    ]).paddingHorizontal(4),

    Divider(),

    VStack({ spacing: 4 }, [
      ForEach({ items: entries, key: (entry) => entry.key }, (entry) => ROWS[entry().kind](entry)),
    ]),

    Text(() => (entries().length === 0 ? (query().trim() || effectiveGroupFilter() ? "No matches." : "No agents running in cmux.") : ""))
      .font(11)
      .color("tertiary")
      .paddingHorizontal(10),
    Spacer(),
  ]).paddingHorizontal(6),
);
