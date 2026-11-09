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

Each card shows the session title, how long it has been in its current state, its workspace, branch and folder, and the last prompt you sent it. Running subagents are listed under their session. A search box filters by title, prompt, workspace, group, folder and branch, and group chips filter by workspace group. The chips appear in the left sidebar and as a pane tab, but not in the right-hand panel, because cmux doesn't pass workspace groups to it.

All state is cmux's own (`workspaces[].agents[]`, their `children[]`, and `tabs[]`). The sidebar only draws it: no files, no network, no background process.

---

## Requirements

- **macOS** with the **cmux** desktop app, version `0.65.2` or newer.
- **Custom Sidebars** turned on in cmux Settings (`customSidebars.beta.enabled`, on by default).
- Agents launched inside cmux terminals with cmux's hooks, so cmux can see them (`cmux hooks setup`).

---

## Install

Copy the sidebar into cmux's sidebar folder:

```sh
mkdir -p ~/.config/cmux/sidebars && cp dashboard.js ~/.config/cmux/sidebars/dashboard.js
```

Then open it in one of two places:

```sh
cmux right-sidebar set custom dashboard   # a narrow, resizable panel on the right
cmux sidebar open dashboard               # a regular pane tab
```

cmux reloads the sidebar whenever the file changes. To check it before opening:

```sh
cmux sidebar validate dashboard
```

---

## Updating

The copy in this repo is the source of truth; the one in `~/.config/cmux/sidebars/` is an installed copy. The first line of the file's header carries its version and build, such as `v0.1.0 (2)`:

- **Build** goes up by one every time a change is copied over.
- **Version** follows [semver](https://semver.org) for changes someone using the dashboard would notice.

After bumping the header, copy the file again with the install command above. To see which build is installed:

```sh
sed -n 2p ~/.config/cmux/sidebars/dashboard.js
```

---

## Known limits

These come from the data cmux hands custom sidebars, not from the dashboard.

- **A session can stay in Running after it finished.** When Claude Code's Stop hook doesn't fire (an Esc interrupt, a hook that timed out), cmux settles the turn from the terminal's own idle report. That fallback updates cmux's built-in sidebar but not `agents[].status`, so the card keeps showing the session as working.
- **The jump uses the tab's id, not the agent's.** `agents[].surfaceId` holds an id that `surface.focus` rejects, so the dashboard focuses through the hosting tab's `tabs[k].surfaceId`, the id the cmux docs give for `surface.*` commands.

---

## License

[MIT](./LICENSE) © AgentLayer
