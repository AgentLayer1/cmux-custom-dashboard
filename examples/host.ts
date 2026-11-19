/*
 * Example host sidebar · built from the manager's three levels.
 *
 *   Today    a "Needs you" strip: the model (agentCards, bySection) drawn with a component (cardRow)
 *   Agents   the whole manager, mounted as a page, with the host's tabs in its header row, a reload button at its end,
 *            two sections of its own above Needs you (a queue of cards, and a folded note), and one session left out
 */

import { cardRow, chip } from "cmux-custom-manager/components";
import { manager } from "cmux-custom-manager/manager";
import { agentCards, bySection } from "cmux-custom-manager/model";
import type { HostSection, SectionCard } from "cmux-custom-manager/sections";

const PAGES = ["Today", "Agents"];
const [page, setPage] = signal("Today");

const needsYou = computed(() => bySection(agentCards()).needs);

// Sessions the host would start, queued above Needs you. Starting one takes it off the queue and opens the next.
const QUEUED: SectionCard[] = [
  { key: "notes", title: "Draft the release notes", span: "~10m", badges: [{ text: "Docs", color: "#0A84FF" }] },
  { key: "flaky", title: "Find the flaky checkout test", span: "~20m", badges: [{ text: "Checkout", color: "#FF453A" }] },
];
const [started, setStarted] = signal<string[]>([]);
const queued = computed(() =>
  QUEUED.filter((item) => !started().includes(item.key)).map((item) => ({
    ...item,
    body: () =>
      Text("Start")
        .font(11)
        .weight("semibold")
        .color("#ffffff")
        .paddingHorizontal(14)
        .paddingVertical(5)
        .background("#BF5AF2")
        .cornerRadius(8)
        .cursor("pointer")
        .onTap(() => setStarted([...started(), item.key])),
  })),
);

const SECTIONS: HostSection[] = [
  { label: "QUEUE", icon: "tray.full.fill", color: "#BF5AF2", cards: queued },
  // Free-form content under a header, starting folded.
  {
    label: "NOTES",
    icon: "note.text",
    color: "#8E8E93",
    folded: true,
    count: () => 1,
    content: () => Text("Ship the beta on Friday").font(11).color("secondary").paddingHorizontal(10),
  },
];

const tabs = () =>
  HStack({ spacing: 4 }, PAGES.map((name) => chip(name, () => page() === name, () => setPage(name)))).fixedSize();

// The runtime has no conditional views: a page is a ForEach of zero or one item, and hiding it
// disposes everything the page built.
const pageView = (name: string, view: () => View) =>
  ForEach({ items: () => (page() === name ? [name] : []), key: (item) => item }, view);

sidebar(() =>
  VStack({ spacing: 8 }, [
    pageView("Today", () =>
      VStack({ spacing: 8 }, [
        HStack([tabs(), Spacer()]).paddingHorizontal(10),
        Divider(),
        VStack({ spacing: 4 }, [
          Text("Needs you").font(13).weight("semibold").paddingHorizontal(10),
          ForEach({ items: needsYou, key: (card) => card.key }, cardRow),
          Text(() => (needsYou().length ? "" : "Nothing needs you."))
            .font(11)
            .color("tertiary")
            .paddingHorizontal(10),
        ]).paddingHorizontal(6),
      ]),
    ),
    pageView("Agents", () =>
      manager({
        header: tabs(),
        sections: SECTIONS,
        exclude: (card) => card.title === "Frost date lookup",
        trailing: Text("Reload")
          .font(11)
          .color("secondary")
          .cursor("pointer")
          .onTap(() => cmux("sidebar.custom.reload", { name: "host" })),
      }),
    ),
    Spacer(),
  ]),
);
