/*
 * Types for cmux's custom-sidebar JS runtime and the data it passes to a sidebar.
 * cmux publishes none, so these are written by hand against cmux 0.65.2:
 *
 *   Runtime API   SidebarRuntime.js, shipped in the app at
 *                 cmux.app/Contents/Resources/CmuxSwiftRenderUI_CmuxSwiftRenderUI.bundle/Contents/Resources/
 *   Data shape    Packages/macOS/CmuxSidebar/Sources/CmuxSidebar/Layout/CustomSidebarDataContextBuilder.swift
 *   Guarantees    docs/custom-sidebars.md
 *
 * The README's "Keeping runtime.d.ts current" section says how to update them after a cmux release.
 */

// ── Data ────────────────────────────────────────────────────────────────────────

/** An epoch in whole seconds. */
type Epoch = number;

interface Clock {
  time: string;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  epoch: Epoch;
}

interface Group {
  id: string;
  name: string;
  collapsed: boolean;
  pinned: boolean;
  anchorId: string;
  color?: string;
  icon?: string;
}

interface PullRequest {
  number: number;
  label: string;
  url: string;
  status: "open" | "merged" | "closed";
  stale: boolean;
  branch?: string;
}

/** One surface (tab) in a workspace. */
interface Tab {
  /** The panel behind the tab; `agents[].panelId` points here. Not accepted by `surface.*`. */
  id: string;
  title: string;
  focused: boolean;
  pinned: boolean;
  hasUnread: boolean;
  /** The id `surface.focus` and the other `surface.*` commands accept; absent until a remote tmux pane is ready. */
  surfaceId?: string;
  directory?: string;
  branch?: string;
  dirty?: boolean;
  ports?: number[];
  latestPrompt?: string;
  latestAt?: Epoch;
}

type AgentStatus = "idle" | "working" | "needs_input" | "ended";

interface AgentChild {
  /** Stable for the child's lifetime. */
  id: string;
  running: boolean;
  startedEpoch: Epoch;
  label?: string;
  endedEpoch?: Epoch;
}

/** One coding-agent session hosted by a workspace's terminals. */
interface Agent {
  /** The agent's own session id. */
  id: string;
  /** The runtime's source name, such as `claude` or `codex`. */
  kind: string;
  name: string;
  status: AgentStatus;
  lastActivityAt: Epoch;
  /** When the current working or needs-input state began. */
  sinceEpoch?: Epoch;
  /** The session's first prompt. */
  title?: string;
  /** The hosting tab's `id`. */
  panelId?: string;
  /** In cmux 0.65.2 this is not an id `surface.focus` accepts; use the hosting tab's `surfaceId`. */
  surfaceId?: string;
  directory?: string;
  transcriptPath?: string;
  pid?: number;
  /** Subagent runs, oldest first. */
  children?: AgentChild[];
}

type WorkspaceStatus = "todo" | "working" | "needs-attention" | "review" | "done";

interface Workspace {
  id: string;
  title: string;
  selected: boolean;
  pinned: boolean;
  index: number;
  directory: string;
  ports: number[];
  portCount: number;
  /** Unread notification count. */
  unread: number;
  status: WorkspaceStatus;
  tabs: Tab[];
  tabCount: number;
  /** The id of the workspace's group. */
  group?: string;
  description?: string;
  color?: string;
  branch?: string;
  dirty?: boolean;
  pr?: PullRequest;
  prs?: PullRequest[];
  progress?: { value: number; label?: string };
  latestMessage?: string;
  latestPrompt?: string;
  latestAt?: Epoch;
  remote?: { target: string; state: string; connected: boolean };
  /** Most recent first; omitted when the workspace hosts none. */
  agents?: Agent[];
}

/** Host data as signals; each read subscribes the binding that makes it. Undefined until cmux sends the key. */
interface SidebarData {
  workspaces(): Workspace[] | undefined;
  /** Not passed by the right-sidebar host in cmux 0.65.2. */
  groups(): Group[] | undefined;
  workspaceCount(): number | undefined;
  selectedTitle(): string | undefined;
  selectedId(): string | undefined;
  unreadTotal(): number | undefined;
  clock(): Clock | undefined;
}

// ── Runtime ─────────────────────────────────────────────────────────────────────

/** A prop value, or a function the runtime re-runs as a live binding. */
type Binding<T> = T | (() => T);
type PropValue = string | number | boolean | null | undefined;

type ChainableProp =
  | "font" | "color" | "padding" | "background" | "cornerRadius" | "opacity"
  | "bold" | "italic" | "monospaced" | "lineLimit" | "spacing" | "size"
  | "width" | "height" | "minWidth" | "maxWidth" | "minHeight" | "maxHeight"
  | "alignment" | "fill" | "stroke" | "strokeWidth" | "systemName" | "value"
  | "help" | "truncation" | "weight" | "secondary" | "borderColor" | "borderWidth"
  | "hoverBackground" | "paddingHorizontal" | "paddingVertical" | "destructive"
  | "paddingLeading" | "paddingTrailing" | "paddingTop" | "paddingBottom"
  | "fixed" | "block" | "layoutPriority" | "marginLeading"
  | "showOnHover" | "hideOnHover" | "dragBackground" | "dragSet" | "rotation"
  | "fade" | "marquee" | "fixedSize" | "cursor";

type FrameSpec = Partial<Record<"width" | "height" | "minWidth" | "maxWidth" | "minHeight" | "maxHeight" | "alignment", PropValue>>;

/** A scene node. Every chainable prop returns the same view; a bare call such as `.bold()` sets `true`. */
type View = { readonly __nodeId: string } & { [Prop in ChainableProp]: (value?: Binding<PropValue>) => View } & {
  frame(spec: FrameSpec | (() => FrameSpec)): View;
  onTap(handler: () => void): View;
  onDoubleTap(handler: () => void): View;
  contextMenu(children: Children): View;
};

type Children = ReadonlyArray<View | Children>;
type Props = Record<string, Binding<PropValue> | (() => void)>;

interface Container {
  (children: Children): View;
  (props: Props, children: Children): View;
}

interface ListOptions<Item> {
  items: Item[] | (() => Item[]);
  key?: (item: Item) => string;
  spacing?: number;
}

declare const data: SidebarData;

declare function signal<Value>(initial: Value): [read: () => Value, write: (next: Value) => void];
declare function computed<Value>(fn: () => Value): () => Value;
declare function sidebar(fn: () => View, options?: { surface?: "glass" }): void;

declare function cmux(method: string, params?: Record<string, string | number | boolean>): void;
declare function openURL(url: string): void;
declare function log(message: string): void;
declare const clipboard: { write(text: string): boolean };

declare const VStack: Container;
declare const HStack: Container;
declare const ZStack: Container;
declare const LazyVStack: Container;
declare const Group: Container;

declare function Text(text: Binding<PropValue>, props?: Props): View;
declare function Image(systemName: Binding<string>, props?: Props): View;
declare function Spacer(props?: Props): View;
declare function Divider(props?: Props): View;
declare function Circle(props?: Props): View;
declare function Capsule(props?: Props): View;
declare function Rectangle(props?: Props): View;
declare function RoundedRectangle(props?: Props): View;
declare function ProgressView(props?: Props): View;
declare function Menu(title: Binding<string>, children: Children): View;
declare function Button(label: Binding<string>, action?: () => void, children?: Children): View;
declare function TextField(
  value: Binding<string>,
  options?: {
    placeholder?: string;
    autofocus?: boolean;
    onSubmit?: (text: string) => void;
    onCancel?: () => void;
    onEdit?: (text: string) => void;
  },
): View;

declare function ForEach<Item>(options: ListOptions<Item>, template: (item: () => Item, key: string) => View): View;
declare function Reorderable<Item>(
  options: ListOptions<Item> & {
    onMove?: (id: string, index: number, extra: { side: "above" | "below"; block: boolean }) => void;
    onDragChange?: (state: { id: string; index: number; side: "above" | "below"; block: boolean } | null) => void;
  },
  template: (item: () => Item, key: string) => View,
): View;
