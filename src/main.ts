/*
 * cmux Dashboard · v0.2.0 (6)
 * Every coding agent in cmux, sorted by what needs you.
 *
 *   NEEDS YOU   waiting on input, or a finished turn you haven't looked at
 *   RUNNING     working, or one of its subagents still is
 *   RECENT      idle for under an hour
 *   IDLE        idle for over an hour
 *   ENDED       ended in the last 24 hours (collapsed)
 *
 * Install   bun run install:cmux                       from a clone: checks, validates, installs
 *           cp dist/dashboard.js ~/.config/cmux/sidebars/dashboard.js
 * Open      cmux right-sidebar set custom dashboard    side panel, resizable
 *           cmux sidebar open dashboard                pane tab
 * Check     cmux sidebar validate dashboard
 *
 * All state is cmux's own (workspaces[].agents[], children[], tabs[]); this file only draws it.
 * Built from src/, where the comments explaining the code live.
 *
 * https://github.com/AgentLayer1/cmux-custom-dashboard · MIT © 2026 AgentLayer
 */

import { dashboard } from "./dashboard.ts";

sidebar(dashboard);
