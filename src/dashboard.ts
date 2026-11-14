import { cardRow, chip, searchField, sectionHeader, type Subagent, subagentRow, tally } from "./components.ts";
import { agentCards, bySection, type Card, ORDER, type Section } from "./model.ts";

interface HeaderEntry {
  key: string;
  kind: "header";
  section: Section;
  count: number;
}

interface CardEntry extends Card {
  kind: "card";
}

interface SubagentEntry extends Subagent {
  key: string;
  kind: "child";
}

type Entry = HeaderEntry | CardEntry | SubagentEntry;

/**
 * The whole dashboard panel. Each call owns its search, group filter and folded sections.
 */
export const dashboard = () => {
  const [query, setQuery] = signal("");
  const [groupFilter, setGroupFilter] = signal("");
  const [collapsed, setCollapsed] = signal<Section[]>(["ended"]);

  const toggleSection = (section: Section) =>
    setCollapsed(collapsed().includes(section) ? collapsed().filter((name) => name !== section) : [...collapsed(), section]);

  // cmux's right-sidebar host passes no groups (still true in 0.65.2), so there the chip row disappears.
  const groupChips = computed(() => {
    const withAgents = new Set(agentCards().map((card) => card.groupId));
    return (data.groups() ?? []).filter((group) => withAgents.has(group.id));
  });
  const effectiveGroupFilter = computed(() =>
    groupChips().some((group) => group.id === groupFilter()) ? groupFilter() : "",
  );

  const cards = computed(() => {
    const tokens = query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return agentCards()
      .filter((card) => !effectiveGroupFilter() || card.groupId === effectiveGroupFilter())
      .filter((card) => {
        const haystack = [card.title, card.searchText, card.workspaceTitle, card.group, card.folder, card.branch]
          .join(" ")
          .toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
  });

  const sections = computed(() => bySection(cards()));

  const entries = computed((): Entry[] =>
    ORDER.flatMap((section): Entry[] => {
      const list = sections()[section];
      if (list.length === 0) {
        return [];
      }
      const header: HeaderEntry = { key: `h:${section}`, kind: "header", section, count: list.length };
      if (collapsed().includes(section)) {
        return [header];
      }
      return [
        header,
        ...list.flatMap((card): Entry[] => [
          { ...card, kind: "card" },
          ...card.subagents.map(
            (child): SubagentEntry => ({
              key: `c:${card.key}:${child.id}`,
              kind: "child",
              child,
              workspaceId: card.workspaceId,
              focusId: card.focusId,
            }),
          ),
        ]),
      ];
    }),
  );

  // ForEach builds a row once per key, and every key starts with its kind, so a row's entry never
  // changes kind and the narrowed accessor stays true.
  const row = (entry: () => Entry) => {
    switch (entry().kind) {
      case "header": {
        const header = entry as () => HeaderEntry;
        const { section } = header();
        return sectionHeader(
          section,
          () => header().count,
          () => collapsed().includes(section),
          () => toggleSection(section),
        );
      }
      case "card":
        return cardRow(entry as () => CardEntry);
      case "child":
        return subagentRow(entry as () => SubagentEntry);
    }
  };

  return VStack({ spacing: 8 }, [
    HStack({ spacing: 12 }, [
      HStack({ spacing: 6 }, [
        Image("square.grid.2x2").font(12).color("accent"),
        Text("Dashboard").font(13).weight("semibold"),
      ]).fixedSize(),
      Spacer({ minLength: 0 }),
      ...ORDER.filter((section) => section !== "ended").map((section) => tally(section, () => sections()[section].length)),
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

    searchField("Search sessions…", setQuery),

    Divider(),

    VStack({ spacing: 4 }, [ForEach({ items: entries, key: (entry) => entry.key }, row)]),

    Text(() => (entries().length === 0 ? (query().trim() || effectiveGroupFilter() ? "No matches." : "No agents running in cmux.") : ""))
      .font(11)
      .color("tertiary")
      .paddingHorizontal(10),
    Spacer(),
  ]).paddingHorizontal(6);
};
