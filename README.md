<div align="center">

# cmux Dashboard

**Every coding agent running in [cmux](https://cmux.com), sorted by what needs you.**

[![Platform](https://img.shields.io/badge/platform-macOS-22D3EE?style=flat-square&logo=apple&logoColor=white)](#requirements)
[![License](https://img.shields.io/badge/license-MIT-10B981?style=flat-square)](./LICENSE)
[![AgentLayer](https://img.shields.io/badge/by-AgentLayer-0B0B0F?style=flat-square)](https://agentlayer.one)

</div>

---

## What it does

A [custom sidebar](https://cmux.com/docs/custom-sidebars) for cmux that lists every Claude Code and Codex session across all your workspaces as one card per session, grouped by what you should look at next. Click a card to jump straight to that session's tab.

| Section       | A session lands here when                                                |
| ------------- | ------------------------------------------------------------------------ |
| **Needs you** | it is waiting on input, or its turn finished and you haven't looked yet  |
| **Running**   | it is working, or one of its subagents is still running                  |
| **Recent**    | it went idle within the last hour                                        |
| **Idle**      | it has been idle for more than an hour                                   |
| **Ended**     | it ended within the last 24 hours (collapsed by default)                 |

Each card shows the session title, how long it has been in its current state, its workspace, branch and folder, and the last prompt you sent it. Running subagents are listed under their session. A search box filters by title, prompt, workspace, group, folder and branch, and group chips filter by workspace group. On cmux 0.65.2 the chips show in the left sidebar and as a pane tab, but not in the right-hand panel (see [Known limits](#known-limits)).

All state is cmux's own (`workspaces[].agents[]`, their `children[]`, and `tabs[]`). The sidebar only draws it: no files, no network, no background process.

---

## Requirements

- **macOS** with the **cmux** desktop app, version `0.65.2` or newer.
- **Custom Sidebars** turned on in cmux Settings (`customSidebars.beta.enabled`, on by default).
- Agents launched inside cmux terminals with cmux's hooks, so cmux can see them (`cmux hooks setup`).

---

## Install

The whole dashboard is one file, [`dist/dashboard.js`](./dist/dashboard.js). There's nothing to clone or build: download it into cmux's sidebar folder.

```sh
mkdir -p ~/.config/cmux/sidebars && curl -fsSL https://raw.githubusercontent.com/AgentLayer1/cmux-custom-dashboard/main/dist/dashboard.js -o ~/.config/cmux/sidebars/dashboard.js
```

Then open it in one of two places:

```sh
cmux right-sidebar set custom dashboard   # a narrow, resizable panel on the right
cmux sidebar open dashboard               # a regular pane tab
```

cmux reloads the sidebar whenever the file changes, so running the same `curl` again updates it in place.

Working from a clone instead? `bun run install:cmux` checks, builds and installs it (see [Development](#development)).

---

## Bonus: a toolbar button

Open the dashboard with one click from the tab bar. Add an action and a button to `~/.config/cmux/cmux.json` (back the file up first):

```jsonc
{
  "actions": {
    "dashboard": {
      "type": "command",
      "title": "Dashboard",
      "icon": { "type": "symbol", "name": "square.grid.2x2" },
      // The command runs in a new terminal tab; `exit` closes that tab once the panel is open.
      "command": "cmux right-sidebar set custom dashboard && exit",
      "target": "newTabInCurrentPane"
    }
  },
  "ui": {
    "surfaceTabBar": {
      // List every button you want shown, with "dashboard" wherever you want it.
      "buttons": ["cmux.newTerminal", "cmux.splitRight", "cmux.splitDown", "dashboard"]
    }
  }
}
```

Then apply it without restarting:

```sh
cmux reload-config
```

---

## Development

Needs [Bun](https://bun.sh) and cmux installed. Run `bun install` once, then:

| Command | Does |
|---|---|
| `bun run install:cmux` | Runs `check`, validates the build with cmux under a staging name, and only then swaps it in and reloads it. A failure leaves the installed dashboard untouched. |
| `bun run check` | Typecheck, build, tests. |
| `bun run build` | Compiles [`src/dashboard.ts`](./src/dashboard.ts) to `dist/dashboard.js`. |
| `bun run test` | Tests only. |
| `bun run typecheck` | Checks everything against [`src/runtime.d.ts`](./src/runtime.d.ts) and Bun's types. |
| `bun run preview` | Builds `dashboard-preview`, the dashboard drawing made-up sessions (below). |

### Source and build

[`src/dashboard.ts`](./src/dashboard.ts) is the source of truth. The build only erases types: `erasableSyntaxOnly` rejects any TypeScript that would need code generated, and the target matches the source, so `dist/dashboard.js` is the source minus its types, comments kept. It is committed so people can copy it, and a test fails when it's older than the source.

The build sees only [`src/runtime.d.ts`](./src/runtime.d.ts), not Bun's or Node's types, so the dashboard can't reach for an API cmux's runtime doesn't have.

### Versions

The installed copy in `~/.config/cmux/sidebars/` carries the version and build from the source header, such as `v0.1.0 (3)`:

- **Build** goes up by one every time a change is installed.
- **Version** follows [semver](https://semver.org) for changes someone using the dashboard would notice.

To see which build is installed:

```sh
grep -m1 "cmux Dashboard · v" ~/.config/cmux/sidebars/dashboard.js
```

### Tests

[`src/dashboard.test.ts`](./src/dashboard.test.ts) runs the built `dist/dashboard.js`, the file people install, on cmux's own sidebar runtime, rebuilds the scene from the operations the runtime sends to the app, and taps it the way cmux does. The runtime is GPL-licensed, so it isn't copied into this repo: the tests load `SidebarRuntime.js` from the installed app, at `/Applications/cmux.app/Contents/Resources/CmuxSwiftRenderUI_CmuxSwiftRenderUI.bundle/Contents/Resources/`. Set `CMUX_SIDEBAR_RUNTIME` to test against a different copy.

### Preview with mock data

[`preview/fixture.ts`](./preview/fixture.ts) holds invented workspaces and sessions covering every section, with a frozen clock. `bun run preview` wraps the real dashboard so it draws the fixture instead of your sessions, and writes it to `~/.config/cmux/sidebars/dashboard-preview.js` (pass a path to write it elsewhere). Taps do nothing in the preview.

```sh
bun run preview && cmux right-sidebar set custom dashboard-preview
cmux shot --out assets/screenshot-full.png        # then crop the panel into assets/screenshot.png
rm ~/.config/cmux/sidebars/dashboard-preview.js && cmux right-sidebar set custom dashboard
```

### Keeping `runtime.d.ts` current

cmux publishes no types for custom sidebars, so [`src/runtime.d.ts`](./src/runtime.d.ts) is written by hand. Its header names the cmux version it matches and the three cmux sources it follows:

| Part | Source in [cmux](https://github.com/manaflow-ai/cmux) |
|---|---|
| Runtime API: `signal`, `computed`, `sidebar`, `cmux`, views and modifiers | `Packages/macOS/CmuxSwiftRenderUI/Sources/CmuxSwiftRenderUI/Resources/SidebarRuntime.js` (also shipped inside the app) |
| Data shape: `workspaces`, `agents`, `children`, `tabs`, `groups`, `clock` | `Packages/macOS/CmuxSidebar/Sources/CmuxSidebar/Layout/CustomSidebarDataContextBuilder.swift` |
| What each field means and when it's present | `docs/custom-sidebars.md` |

After a cmux release, diff those paths between the release tags in a cmux checkout, mirror any change in `runtime.d.ts`, update the version in its header, and run `bun run check`. The typecheck then points at any dashboard or fixture code the change breaks.

```sh
git -C <cmux checkout> fetch --tags && git -C <cmux checkout> diff v0.65.2.2 v<new> -- Packages/macOS/CmuxSwiftRenderUI/Sources/CmuxSwiftRenderUI/Resources/SidebarRuntime.js Packages/macOS/CmuxSidebar/Sources/CmuxSidebar/Layout/CustomSidebarDataContextBuilder.swift docs/custom-sidebars.md
```

---

## Known limits

These come from the data cmux hands custom sidebars, not from the dashboard. Checked against cmux 0.65.2.

| Limit | cmux issue | Status |
|---|---|---|
| **A session can stay in Running after it finished.** When Claude Code's Stop hook doesn't fire (an Esc interrupt, a hook that timed out), cmux settles the turn from the terminal's own idle report. That updates cmux's built-in sidebar but not `agents[].status`, so the card keeps showing the session as working. | [#39157](https://github.com/manaflow-ai/cmux/issues/39157) | Open |
| **`agents[].surfaceId` can't focus a tab.** It holds an id `surface.focus` rejects, so the dashboard focuses through the hosting tab's `tabs[k].surfaceId` instead, the id cmux's docs give for `surface.*` commands. Clicking a card works today. | [#39154](https://github.com/manaflow-ai/cmux/issues/39154) | Open |
| **No group chips in the right-hand panel.** cmux 0.65.2 passes no workspace groups to custom sidebars there, so the chip row stays hidden. They show in the left sidebar and as a pane tab. | [#20281](https://github.com/manaflow-ai/cmux/issues/20281) | Fixed on cmux `main`, not yet released |
| **Background subagents drop off when the turn ends.** cmux 0.65.2 marks a session's subagents ended when its turn ends, even while they keep running in the background. | [#20283](https://github.com/manaflow-ai/cmux/issues/20283) | Fixed on cmux `main`, not yet released |

---

## License

[MIT](./LICENSE) © AgentLayer
