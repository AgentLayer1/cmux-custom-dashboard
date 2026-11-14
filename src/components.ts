import { type Card, epoch, fmtSpan, jump, type Section, SECTIONS } from "./model.ts";

const YOUR_MOVE = "#FFD60A";
const MAIN_BRANCH = /^(main|master)$/;

interface Badge {
  key: string;
  text: string;
  icon: string;
  fg: string;
  bg: string;
  flexible: boolean;
}

export interface Subagent {
  child: AgentChild;
  workspaceId: string;
  focusId: string;
}

const dotColor = (card: Card) =>
  card.section === "needs" && card.agent.status !== "needs_input" ? YOUR_MOVE : SECTIONS[card.section].color;

const timeText = (agent: Agent) => {
  const live = agent.status === "working" || agent.status === "needs_input";
  const start = (live && agent.sinceEpoch) || agent.lastActivityAt;
  return start ? fmtSpan(epoch() - start) : "";
};

// Badges as data, so a row shows only the ones it has (the runtime has no conditional views).
// A ForEach renders as a group whose own default layoutPriority wraps every row, overriding any
// priority set on a badge, so width is settled by `fixedSize` instead: fixed badges never truncate,
// flexible ones share what is left.
const badgesOf = (card: Card): Badge[] =>
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
  ].filter((item) => typeof item === "object");

const badge = (item: () => Badge) =>
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

export const chip = (label: Binding<string>, active: () => boolean, onTap: () => void) =>
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

export const searchField = (placeholder: string, onEdit: (text: string) => void) =>
  // The runtime's TextField is borderless, so the box comes from this wrapper.
  HStack([
    HStack({ spacing: 6 }, [
      Image("magnifyingglass").font(12).color("secondary"),
      TextField("", { placeholder, autofocus: false, onEdit: (text) => onEdit(text ?? "") }),
    ])
      .paddingHorizontal(9)
      .paddingVertical(6)
      .background("#7f7f7f24")
      .cornerRadius(8),
  ]).paddingHorizontal(4);

export const sectionHeader = (section: Section, count: () => number, folded: () => boolean, onTap: () => void) =>
  HStack({ spacing: 6 }, [
    Text(SECTIONS[section].label).font(10).weight("bold").color(SECTIONS[section].color),
    Text(() => String(count()))
      .font(10)
      .monospaced()
      .color("tertiary"),
    Spacer(),
    Image(() => (folded() ? "chevron.right" : "chevron.down"))
      .font(9)
      .weight("semibold")
      .color("tertiary"),
  ])
    .paddingHorizontal(10)
    .paddingTop(10)
    .paddingBottom(2)
    .frame({ maxWidth: "infinity" })
    .cursor("pointer")
    .onTap(onTap);

/**
 * One session as a card; a tap focuses its tab.
 */
export const cardRow = (card: () => Card) =>
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

export const subagentRow = (row: () => Subagent) => {
  const child = () => row().child;
  return HStack({ spacing: 6 }, [
    Text("└").font(10).monospaced().color("tertiary").fixedSize(),
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
    .onTap(() => jump(row().workspaceId, row().focusId));
};

export const tally = (section: Section, count: () => number) =>
  HStack({ spacing: 4 }, [
    Circle({ size: 7 }).fill(SECTIONS[section].color),
    Text(() => String(count()))
      .font(11)
      .weight("semibold")
      .monospaced()
      .color(() => (count() ? "secondary" : "quaternary")),
  ]).fixedSize();
