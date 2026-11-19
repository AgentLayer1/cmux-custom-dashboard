/*
 * cmux Manager · v0.4.0 (1)
 * Every coding agent in cmux, sorted by what needs you.
 *
 *   NEEDS YOU   waiting on input, or a finished turn you haven't looked at
 *   RUNNING     working, or one of its subagents still is
 *   RECENT      idle for under an hour
 *   IDLE        idle for over an hour
 *   ENDED       ended in the last 24 hours (collapsed)
 *
 * Install   bun run install:cmux                       from a clone: checks, validates, installs
 *           cp dist/manager.js ~/.config/cmux/sidebars/manager.js
 * Open      cmux right-sidebar set custom manager      side panel, resizable
 *           cmux sidebar open manager                  pane tab
 * Check     cmux sidebar validate manager
 *
 * All state is cmux's own (workspaces[].agents[], children[], tabs[]); this file only draws it.
 * Built from src/, where the comments explaining the code live.
 *
 * https://github.com/AgentLayer1/cmux-custom-manager · MIT © 2026 AgentLayer
 */

import { manager } from "./manager.ts";

sidebar(() => manager());
