/*
 * Example host sidebar · built from the manager's three levels.
 *
 *   Today    a "Needs you" strip: the model (agentCards, bySection) drawn with a component (cardRow)
 *   Agents   the whole manager, mounted as a page, with the host's tabs in its header row
 */

import { cardRow, chip } from "cmux-custom-manager/components";
import { manager } from "cmux-custom-manager/manager";
import { agentCards, bySection } from "cmux-custom-manager/model";

const PAGES = ["Today", "Agents"];
const [page, setPage] = signal("Today");

const needsYou = computed(() => bySection(agentCards()).needs);

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
    pageView("Agents", () => manager({ header: tabs() })),
    Spacer(),
  ]),
);
