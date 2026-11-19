import { badge, sectionHeader } from "./components.ts";

export interface CardBadge {
  text: string;
  /**
   * `#RRGGBB`: the text in it, the fill a tint of it.
   */
  color: string;
  /**
   * An SF Symbol before the text; a dot when absent.
   */
  icon?: string;
}

/**
 * One item in a host's section, drawn like a session card.
 */
export interface SectionCard {
  key: string;
  title: string;
  /**
   * Where a session card shows its time, right of the title: an estimate, say.
   */
  span?: string;
  badges?: CardBadge[];
  /**
   * More words the search box matches, beside the title and badges.
   */
  searchText?: string;
  /**
   * Drawn under the badges while the card is expanded: its details, and the host's buttons.
   */
  body?: () => View;
}

interface SectionHead {
  label: string;
  /**
   * An SF Symbol, drawn before the label in the section's colour.
   */
  icon: string;
  color: string;
  /**
   * Whether the section starts folded. It starts open.
   */
  folded?: boolean;
}

interface SectionCards {
  cards: () => SectionCard[];
  /**
   * The count in the header and the tally; the number of cards shown when absent.
   */
  count?: () => number;
  /**
   * Whether the first card starts expanded, with the next one opening when it leaves. True unless set false.
   */
  expandFirst?: boolean;
}

interface SectionContent {
  count: () => number;
  /**
   * The host's own view under the section's header, drawn while the section is open.
   */
  content: () => View;
}

/**
 * A section a host adds above Needs you, headed like the manager's own: cards the manager draws, or the host's own view.
 * It's hidden while its count is 0.
 */
export type HostSection = SectionHead & (SectionCards | SectionContent);

// The runtime has no conditional view, so one is a list of one item or none.
const when = (show: () => boolean, build: () => View) =>
  ForEach({ items: () => (show() ? ["shown"] : []), key: (name) => name }, build);

const tokensOf = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const matches = (card: SectionCard, tokens: string[]) => {
  const haystack = [card.title, card.searchText ?? "", ...(card.badges ?? []).map(({ text }) => text)]
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
};

const sectionCard = (card: () => SectionCard, color: string, expanded: () => boolean, onToggle: () => void) =>
  VStack({ spacing: 4, alignment: "leading" }, [
    VStack({ spacing: 4, alignment: "leading" }, [
      HStack({ spacing: 7 }, [
        Circle({ size: 7 }).fill(color),
        Text(() => card().title)
          .font(13)
          .weight("semibold")
          .lineLimit(1)
          .truncation("tail"),
        Spacer({ minLength: 4 }),
        Text(() => card().span ?? "")
          .font(10)
          .monospaced()
          .color("tertiary")
          .fixedSize(),
      ]),
      HStack({ spacing: 4 }, [
        ForEach(
          {
            items: () =>
              (card().badges ?? []).map(({ text, color: tint, icon }, index) => ({
                key: `${index}:${text}`,
                text,
                icon: icon ?? "circle.fill",
                fg: tint,
                bg: `${tint}26`,
                flexible: false,
              })),
            key: (entry) => entry.key,
          },
          badge,
        ),
      ])
        .paddingLeading(14)
        .frame({ maxWidth: "infinity", alignment: "leading" }),
    ])
      .frame({ maxWidth: "infinity", alignment: "leading" })
      .cursor("pointer")
      .onTap(onToggle),
    when(
      () => expanded() && Boolean(card().body),
      () => (card().body?.() ?? VStack([])).paddingLeading(14).paddingTop(2),
    ),
  ])
    .paddingHorizontal(10)
    .paddingVertical(8)
    .cornerRadius(10)
    .background(() => (expanded() ? `${color}1f` : "#7f7f7f0d"))
    .frame({ maxWidth: "infinity", alignment: "leading" });

// A card the operator closed by hand stays closed until they open another.
const CLOSED = "";

const cardList = (section: SectionHead & SectionCards, query: () => string) => {
  const shown = computed(() => {
    const tokens = tokensOf(query());
    return section.cards().filter((card) => matches(card, tokens));
  });
  // null until the operator picks a card; then the key they picked, or CLOSED.
  const [picked, setPicked] = signal<string | null>(null);
  const openKey = computed(() => {
    const list = shown();
    const choice = picked();
    if (choice !== null && list.some((card) => card.key === choice)) {
      return choice;
    }
    if (choice === CLOSED || section.expandFirst === false) {
      return CLOSED;
    }
    return list[0]?.key ?? CLOSED;
  });
  const view = () =>
    VStack({ spacing: 4 }, [
      ForEach({ items: shown, key: (card) => card.key }, (card) =>
        sectionCard(
          card,
          section.color,
          () => openKey() === card().key,
          () => setPicked(openKey() === card().key ? CLOSED : card().key),
        ),
      ),
    ]);
  return { shown, count: section.count ?? (() => shown().length), view };
};

/**
 * A host's section as the manager draws it: its look and count for the header row's tally, the cards the search left
 * in it, and its view.
 */
export const hostSection = (section: HostSection, query: () => string) => {
  const [folded, setFolded] = signal(section.folded ?? false);
  const { shown, count, view: body } =
    "content" in section ? { shown: () => [], count: section.count, view: section.content } : cardList(section, query);
  const view = when(
    () => count() > 0,
    () =>
      VStack({ spacing: 4 }, [
        sectionHeader(section, count, folded, () => setFolded(!folded())),
        when(() => !folded(), body),
      ]),
  );
  return { look: section, count, cards: shown, view };
};
