# Token Hero — Project Context

## What it is

A Figma plugin (+ macOS menu bar app) that bridges the gap between design tokens in
Figma and their usage in code. Works with any project that has a token pipeline. Inspired
by Figma's Code Connect, but one level deeper — it operates on **values**, not just
component links. The core question it answers: *is the token bound to this layer in Figma
the same token actually driving that property in the codebase?*

---

## The problem it solves

Design token pipelines have two failure modes:

1. **Unbound properties in Figma** — a layer has a raw hard-coded value (`2px`, `#6366f1`)
   instead of a bound variable. Looks fine visually, but the token system can't see it.
   Downstream code generation misses it or exports a raw value instead of a token reference.

2. **Drift between Figma and code** — a token is correctly bound in Figma, but someone
   edited a component class string directly in code (e.g. the `ds.ts` entry for a
   component), added a one-off utility class, or the component config wasn't updated after
   a Figma change. The values diverge silently.

Token Hero addresses both — inside Figma for the first, and via the Figma↔code mapping
for the second.

---

## Plugin operating modes

The Figma Plugin API runs in a sandboxed iframe with no filesystem access and no ability
to spawn processes. The plugin cannot start the bridge itself.

This means Token Hero has two operating modes:

**Offline mode** (bridge not running):
- Full inspection works — reads `node.boundVariables`, walks hierarchy, shows unbound
  properties, displays cached audit findings from plugin data (stored in `auditFindings`
  plugin data from a previous connected session)
- Write operations disabled — no patches, no generate commands, no new audit triggers
- Plugin shows a persistent `○ offline — inspection only` status pill
- "Open Token Hero" button with deep link `tokenhero://connect` to launch the menu bar app

Note: cached audit *findings* are visible in offline mode; running a new audit *requires*
connected mode.

**Connected mode** (bridge running, plugin connected):
- Full capability — all five flows active, patches, commands, audits
- Plugin shows `● connected` status pill with active project name
- All write actions enabled

This is not an error state — offline mode is a fully functional read-only experience.
The mode distinction must be surfaced clearly and permanently in the plugin UI.
The status pill appears in the top-right corner of the plugin panel header, adjacent
to the tab row, always visible regardless of which tab is active.

---

## How Token Hero works across projects

Token Hero is project-agnostic. It adapts to whatever token pipeline a project uses.
Configuration is done once via the Settings page when first opening a new file — no
hard-coded assumptions about file paths, commands, or pipeline shape.

### Supported pipeline types

| Type | Description | Example |
|---|---|---|
| `json-source` | A JSON token file + a generate command | Sombra: `sombra.ds.json` + `npm run tokens` |
| `style-dictionary` | Style Dictionary config + build command | `sd build` |
| `tokens-studio` | Tokens Studio sync with a push/pull command | `npx token-transformer ...` |
| `custom` | Any shell command that generates code from tokens | Anything else |

### Project-level config (stored in Figma file + config file)

```typescript
{
  schemaVersion: number,          // current value: 1. On load, if the plugin encounters a
                                  // schemaVersion it doesn't recognize (> 1), it shows an
                                  // inline banner: "This file was configured with a newer
                                  // version of Token Hero. Update the plugin to continue."
                                  // All write actions are disabled. Read-only inspection
                                  // still works — the plugin can walk node.boundVariables
                                  // and display unbound properties, but cached audit findings
                                  // are NOT shown (unlike true offline mode — config is
                                  // unreadable so findings may be unreliable). No crash, no
                                  // data loss — the plugin won't apply config it can't parse.
  pipeline: {
    type: "json-source" | "style-dictionary" | "tokens-studio" | "custom",
    sourceFile: string,           // relative path to the token source file
    generateCommand: string,      // e.g. "npm run tokens", "sd build"
    auditCommand?: string,        // optional — Token Hero passes --component <key> and reads
                                  // findings JSON from stdout.
                                  // Exit code semantics: 0 = ran successfully (findings may
                                  // or may not be empty). Any non-zero exit = command failed
                                  // (bridge treats as AUDIT_FAILED, does not parse stdout).
                                  // Audit tools that use exit codes to signal finding counts
                                  // (e.g. exit 1 = warnings found) must be wrapped in a
                                  // shell script that exits 0 regardless.
    contactSheetUrl?: string,     // optional — enables contact sheet awareness.
                                  // Must be an http:// or https:// URL. file:// URLs are
                                  // not supported. Query parameters are allowed and
                                  // preserved; the bridge appends the fragment (#jsonKey)
                                  // when opening: "http://localhost:5173/ds?mode=dev#nodeCard"
    generated?: string[],         // paths that must not be patched (relative to projectRoot)
                                  // supplements hardcoded defaults. If omitted, only the
                                  // pipeline-type defaults are protected.
    groupMap?: {                  // maps Figma collection names to token snapshot groups
      [figmaCollectionName: string]: "textStyles" | "colors" | "effects" |
                                     "spacing" | "radius" | "sizes"
      // e.g. { "UI Colors": "colors", "Radius": "radius", "Port Types": "colors" }
      // Multiple collections can map to the same group — they are merged in display.
      // Fallback if omitted: normalised match algorithm — lowercase the Figma collection
      // name, strip all spaces, then check if the result is an exact match for one of
      // the six valid group names: "textstyles", "colors", "effects", "spacing",
      // "radius", "sizes". If it matches, use that group. If it doesn't match any,
      // the collection is ignored. Example: "UI Colors" → "uicolors" → no match →
      // ignored. "Radius" → "radius" → match. This means collections with non-obvious
      // names (e.g. "Port Types" → "porttypes") MUST use explicit groupMap entries.
    }
  },
  bridgePort: number              // default: 7799
}
```

### Machine-local config (stored in clientStorage, never shared)

```typescript
{
  uiPreferences: { ... }
}
```

Project roots are NOT stored in clientStorage — they live in the macOS app's
`~/Library/Application Support/TokenHero/projects.json`. The plugin reads the active
project root from the HELLO_ACK payload at connection time.

---

## Reference implementation: Sombra

Token Hero is being built against the **Sombra** design system as its first real-world use
case. Sombra uses the `json-source` pipeline type.

### Sombra's token pipeline

Single source of truth: `tokens/sombra.ds.json`

Generated from it via `npm run tokens` / `scripts/generate-tokens.ts`:

- **CSS custom properties** — `:root` block in `src/index.css`
- **Tailwind theme aliases** — `@theme inline` block in `src/index.css`
- **Component class strings** — `src/generated/ds.ts`
- **Port color constants** — `src/utils/port-colors.ts` (generated)
- **Text style composites** — `@utility` blocks in `index.css`

### Sombra's specific gap

`sombra.ds.json` has two sections:

**Automated (tokens)** — synced from Figma variable collections via `scripts/figma-pull.ts`.

**Manual (components)** — 22 component entries with parts like `fill`, `stroke`, `radius`,
`padding`, `textStyle`, `hover` states. Maintained by hand (prior to Token Hero).
`scripts/figma-audit.ts` detects drift but doesn't fix it.

Token Hero automates this gap: plugin inspects live component → detects delta → proposes
patch → user approves → bridge writes update → `npm run tokens` runs.

**Sombra config values:**
```json
{
  "pipeline": {
    "type": "json-source",
    "sourceFile": "tokens/sombra.ds.json",
    "generateCommand": "npm run tokens",
    "auditCommand": "npm run audit:visual",
    "contactSheetUrl": "http://localhost:5173/ds-preview"
  }
}
```

---

## Architecture: the components

### 1. The Figma Plugin
Reads `node.boundVariables`, walks the full layer hierarchy, surfaces unbound and
mismatched properties. Plugin API only — no REST calls. Two operating modes (see above).

### 2. Token Hero for macOS (menu bar app)
The bridge lives here. A native Swift/SwiftUI menu bar app — no dock icon, always running,
zero chrome. Owns the WebSocket server, executes shell commands on behalf of the plugin,
manages multiple project roots. See macOS App Spec below.

### 3. Token source file — the mapping registry
Whatever the project's token source file is. The `components` section (or equivalent) is
where the Figma↔code link lives. Token Hero reads it to know `Node Card` in Figma =
`nodeCard` in the source.

### 4. Local message bridge
The WebSocket server run by the macOS app. Five message flows, bidirectional. See Bridge
Spec below.

---

## Key decisions

**Plugin API, not REST API** — direct, live, in-memory access, no auth, no rate limits.

**macOS app, not a CLI daemon** — the bridge needs to be always-available without a
terminal. A menu bar app is the native macOS pattern for exactly this. The CLI still
exists for scripts and CI but is not the day-to-day runtime.

**WebSocket over HTTP** — bidirectional channel required for audit results flowing back.

**Never write to generated files** — source file patches only. Generated files are
overwritten on every token run.

**Mapping lives on the component node** — stored via `setPluginData`, survives renames,
travels with the file.

**Two storage tiers** — file-level in `setPluginData` (shared with team), machine-local
in `clientStorage` (this machine only). Settings page makes this explicit.

---

## macOS App Spec

**Technology:** Swift + SwiftUI, `MenuBarExtra` API (macOS 13+)
**Distribution:** Standard `.app` bundle, installed to `/Applications`
**Dock icon:** None — `LSUIElement = true` in `Info.plist`
**Auto-launch:** Optional, via `SMAppService` (modern login item API)

---

### Menu bar icon

The icon is the primary and usually only UI. It communicates everything needed at a glance.

| State | Icon | Colour | Condition |
|---|---|---|---|
| Connected | `⬡` filled | Indigo `#6366f1` | Plugin connected, bridge active |
| Idle | `⬡` outline | Gray `#64748b` | Bridge running, plugin not connected |
| Running | `⬡` pulsing | Indigo | Command executing |
| Error | `⬡` filled | Red `#ef4444` | Last command exited non-zero |
| Off | — | — | App not running |

Use SF Symbols `hexagon.fill` / `hexagon` with tint color. Pulse animation during
command execution: linear opacity oscillation between 1.0 and 0.3, 1s per full cycle
(0.5s fade out, 0.5s fade in), repeating indefinitely until the command completes.

---

### Menu structure

Shown on click. Entire UI fits here — no separate windows except log viewer and settings.

```
● Token Hero                          [state label]
──────────────────────────────────────
  Project: Sombra                   ›
  Plugin: Connected
  Last run: tokens — 12s ago ✓
──────────────────────────────────────
  Run tokens now
  Run audit
──────────────────────────────────────
  Show log…
  Settings…
──────────────────────────────────────
  Launch at login              [✓ / ]
  Quit
```

**State label** — one of: `Connected`, `Idle`, `Running…`, `Error`, `Not configured`

**Project submenu** — lists all registered projects by folder name. Checkmark on active.
Selecting a project switches the bridge to that project's root and config. "Add project…"
opens a folder picker.

```
  Project: Sombra                   ›
    ✓ Sombra
      DesignSystem-V2
      ClientProject
      ──────────────
      Add project…
      Remove Sombra
```

**Run tokens now** — disabled in offline/idle state. Runs `generateCommand` from the
active project config. Icon pulses during execution.

**Run audit** — disabled if no `auditCommand` configured. Runs full audit, pushes results
to plugin via Flow 3 if connected.

**Show log** — opens a minimal floating window (not a full app window). Fixed size,
monospace font, last 200 lines of `token-hero.log`, auto-scrolls to bottom. No editing.
Cmd+W closes. The window auto-closes when the app quits.

**Settings** — opens the Settings window (see below).

**Launch at login** — toggles `SMAppService` registration. Checkmark reflects current
state. No confirmation dialog.

---

### Settings window

Small, single-panel window. Opens centered. Not resizable.

```
┌─ Token Hero Settings ──────────────────────┐
│                                             │
│  Bridge port          [7799          ]      │
│                                             │
│  ─── Active project: Sombra ─────────────  │
│                                             │
│  Project root         [/Users/… /sombra  ]  │
│  Pipeline type        [json-source      ▾]  │
│  Source file          [tokens/sombra.ds… ]  │
│  Generate command     [npm run tokens    ]  │
│  Audit command        [npm run audit:vis…]  │
│  Contact sheet URL    [http://localhost:…]  │
│                                             │
│  [Test connection]           [Save]         │
└─────────────────────────────────────────────┘
```

- All fields except Project root write to `token-hero.config.json` in the project root
  and sync to `figma.root.setPluginData` via the bridge next time the plugin connects
- Project root writes to a local plist (`~/Library/Application Support/TokenHero/projects.json`)
- Port change requires bridge restart — on Save, if the port changed, the app shows
  a confirmation prompt: "Port changed. Restart bridge now? [Restart now] [Later]"
  Restart closes active plugin connections with a `BRIDGE_CLOSING { reason: 'shutdown' }`
  before restarting. "Later" saves the config but keeps the bridge on the old port until
  the next manual restart or app relaunch.
- "Test connection" validates that the source file path resolves on disk and is readable.
  It does NOT attempt to run `generateCommand` — a dry-run would require knowing which
  tools support `--dry-run`, which is not reliably detectable. A successful test shows
  ✓ "Source file found" and the first 3 keys from the file as a sanity check.

---

### Multi-project management

Projects are stored in `~/Library/Application Support/TokenHero/projects.json`:

```json
{
  "activeProject": "sombra",
  "projects": [
    {
      "id": "sombra",
      "name": "Sombra",
      "root": "/Users/spendolas/sombra",
      "figmaFileKey": "abc123",
      "port": 7799
    },
    {
      "id": "client-v2",
      "name": "ClientProject",
      "root": "/Users/spendolas/projects/client-v2",
      "figmaFileKey": "def456",
      "port": 7800
    }
  ]
}
```

Each project can optionally run on a different port — useful if you need two bridges
active simultaneously. The plugin reads the port from `figma.root.setPluginData` and
connects to the correct one.

**Port conflict resolution:** on bridge start or project switch, if the configured port
is already in use, the app shows an error in the menu: `"Port 7799 is in use — change
the port in Settings or quit the conflicting process."` The bridge does not start and
the icon shows Error state. The app does not auto-increment ports — the conflict must be
resolved explicitly to avoid silent routing mistakes across projects.

When switching projects via the menu, the app:
1. Sends `BRIDGE_CLOSING` to any connected plugin instances on the current project
2. Stops the current WS server
3. Loads config from the new project root
4. Starts WS server on the new project's port
5. Updates menu bar icon

---

### Deep link handling

The app registers the `tokenhero://` URL scheme. Used by the plugin to launch or focus
the app when the bridge is not running.

`tokenhero://connect` — if the app is not running, launch it (bridge starts automatically);
  if already running, open the menu (pop open the macOS menu bar dropdown)
`tokenhero://connect?project=sombra` — connect and switch to named project

When the plugin shows the "offline" banner, the "Open Token Hero" button fires this
deep link. If the app is already running, it responds via `NSWorkspace` open URL handling,
starts the bridge if not already running, and the plugin's connection retry loop reconnects
normally via `HELLO` / `HELLO_ACK`. There is no separate `BRIDGE_READY` message — the
`HELLO_ACK` response to the plugin's next connection attempt serves as the ready signal.

---

### Bridge lifecycle (app-managed)

Replaces the `token-hero start` CLI command for day-to-day use. The CLI still exists
for scripts and CI.

```
App launches
  → reads projects.json
  → starts WS server on active project's port
  → sets icon: Idle (outline, gray)
  → registers deep link handler
  → registers for login item if configured

Plugin connects
  → app receives HELLO
  → validates protocol version
  → sends HELLO_ACK with projectName field added:
    { ..., projectName: "Sombra", projectRoot: "/Users/…" }
  → sets icon: Connected (filled, indigo)

Plugin disconnects
  → sets icon: Idle

Command executes (any flow that triggers generateCommand or auditCommand)
  → sets icon: Running (pulsing)
  → streams stdout/stderr to token-hero.log
  → on exitCode 0: sets icon back to previous state, updates "Last run" menu item
  → on exitCode non-0: sets icon: Error (red), last run shows "tokens — ✗ 8s ago"
  → format is always "<commandName> — <✓|✗> <elapsed>", where commandName is the
     first word of the command string (e.g. "npm", "sd", "npx")
  → error detail available in Show log…

App quits
  → sends BRIDGE_CLOSING to all connected plugins
  → stops WS server
```

---

### Log file

`token-hero.log` written to the active project root. Append-only. Rotated at 5MB
(rename existing `token-hero.log` to `token-hero.log.1`, overwriting any prior
`token-hero.log.1` — only one backup is kept). Format:

```
[2026-03-09T14:32:01Z] [INFO]  Bridge started on ws://localhost:7799
[2026-03-09T14:32:04Z] [INFO]  Plugin connected — "Sombra — Components" (figmaFileKey: abc123)
[2026-03-09T14:32:18Z] [INFO]  APPLY_PATCH received — /components/nodeCard/padding
[2026-03-09T14:32:18Z] [RUN]   npm run tokens
[2026-03-09T14:32:21Z] [OK]    npm run tokens — exit 0 (2.8s)
[2026-03-09T14:33:01Z] [RUN]   npm run audit:visual -- --component nodeCard
[2026-03-09T14:33:04Z] [OK]    audit — 0 findings (3.1s)
[2026-03-09T14:33:04Z] [INFO]  AUDIT_RESULTS sent to plugin (0 findings)
```

---

## Plugin Data Model

Token Hero uses three Figma storage APIs with distinct scopes.

| API | Scope | Limit | Shared with team |
|---|---|---|---|
| `figma.root.setPluginData` | File-level config | 100KB | ✅ Yes |
| `componentNode.setPluginData` | Per-component mapping | 100KB | ✅ Yes |
| `figma.clientStorage` | Machine-local only | 5MB | ❌ No |

### `figma.root.setPluginData` (key: `"config"`)

```typescript
{
  schemaVersion: number,        // current value: 1
  pipeline: {
    type: "json-source" | "style-dictionary" | "tokens-studio" | "custom",
    sourceFile: string,
    generateCommand: string,
    auditCommand?: string,
    contactSheetUrl?: string,
    generated?: string[],         // protected output paths (relative to projectRoot)
    groupMap?: {                // maps Figma collection names → snapshot group names
      [figmaCollectionName: string]: "textStyles" | "colors" | "effects" |
                                     "spacing" | "radius" | "sizes"
    }
  },
  bridgePort: number,
  protocolVersion: number       // current value: 1
}
```

This is the canonical stored form. It exactly mirrors the `pipeline` block in
`token-hero.config.json` (the file on disk), plus `schemaVersion`, `bridgePort`, and
`protocolVersion`. When the plugin connects, the bridge syncs any changes to this key
from the config file.

**Source of truth and sync direction:** `token-hero.config.json` on disk is the
authoritative source. The bridge reads it on startup and on each project switch.
On `HELLO_ACK`, the bridge sends the current config values so the plugin can update
its `setPluginData` if they differ — flow is always config file → `setPluginData`,
never the reverse. If a team member edits the config file directly (e.g. adds an
`auditCommand`), the change takes effect on next bridge connection. The plugin's
Settings page also writes to `setPluginData` first, then notifies the bridge to
write through to the config file — so plugin edits flow: `setPluginData` → bridge
→ config file on disk.

Travels with the `.fig` file. Every team member gets this automatically on open.

### `componentNode.setPluginData`

```typescript
// Key: "mapping"
{
  jsonKey: string,
  sourcePath: string,
  variantPropMap?: {             // only present for ComponentSetNode mappings
    [figmaPropName: string]: string  // figma variant property → code prop name
    // Figma capitalises property names; code uses lowercase. Always record the
    // transformation even when names appear similar.
    // e.g. { "State": "state", "Size": "variant" }
  },
  lastAuditAt: number | null,
  lastAuditStatus: "clean" | "dirty" | "unknown"
}

// Key: "auditFindings"
{
  generatedAt: number,
  findingCount: number,         // total findings from the audit run — may exceed
                                // findings.length if the array was truncated at 100KB
  findings: AuditFinding[]      // truncated array if total findings exceed 100KB limit
                                // Truncation strategy: sort by severity (CASCADE_LOSS >
                                // NOT_APPLIED > WRONG_TOKEN > TOKEN_MISSING >
                                // UNRECORDED_VARIANT_DELTA > REMOVED_NESTED), keep the
                                // highest-severity findings up to the 100KB limit.
                                // Truncated findings are NOT actionable — the plugin
                                // shows a note: "N more findings not shown — run a scoped
                                // audit to reload." The "reconnect" path for full findings
                                // is Flow 4 (RUN_SCOPED_AUDIT): it re-runs the audit for
                                // this component and replaces the stored findings with a
                                // fresh (non-truncated if under 100KB) result. If findings
                                // genuinely exceed 100KB (>~200 findings), the truncation
                                // note persists and the user must investigate via logs.
}
```

`AuditFinding` is the same type as the `findings[]` entries in Flow 3's `AUDIT_RESULTS`
payload — no separate storage type. The full shape is defined in the Flow 3 section.

**Finding storage scope:** `auditFindings` is stored on the `ComponentSetNode` or
`ComponentNode`, not on individual layer nodes. Findings targeting specific layers
(via `layerId`) are stored on the parent component node and keyed by `layerId` within
the findings array. This means a component with 50 drifted layers has all 50 findings
in its component node's `auditFindings`, not distributed across 50 layer nodes.

Link lives on the component — survives renames, travels with the file. For component sets,
the mapping is stored on the `ComponentSetNode`, not on individual variant nodes.

### `figma.root.setPluginData` (key: `"styleTimestamps"`)

```typescript
{ [styleOrVariableId: string]: number }  // unix timestamps of last successful push per token
                                          // Written by [Push to code →] on success.
                                          // Used for direction detection (amber vs red dot).
                                          // Key is Figma style ID or variable ID.
```

### `figma.root.setPluginData` (key: `"excludedTokens"`)

```typescript
string[]   // list of Figma-side variable/style names (as returned by the Figma Plugin API:
           // variable.name or style.name). NOT the camelCase code-side name.
           // e.g. ["surface/overlay", "proto/scrim"] (Figma slash-separated format)
           // These are compared against variable.name / style.name at display time.
```

Variables in this list are shown in the Style Inspector with an `[internal]` badge — never
counted as drift, never shown as unmapped errors. Managed via the Style Inspector row action
[Mark as internal]. Can be cleared per item or in bulk from the Settings tab.

### `figma.root.setSharedPluginData` (namespace: `tokenHero`, key: `"fileKey"`)

```typescript
{ figmaFileKey: string, sourceFile: string }
```

Uses `setSharedPluginData` (readable by any plugin) rather than `setPluginData` (Token
Hero only) intentionally. This enables multi-machine workflows: when a new team member
opens the Figma file and runs "Add project…" in the macOS app, the app can read the file
key and source file path via the Figma REST API before the plugin is ever connected —
allowing it to pre-populate setup without requiring the bridge to be running first.

### `figma.clientStorage` (key: `"uiPreferences"`)

```typescript
{
  panelTab: "styles" | "inspector" | "audit" | "settings",
  showAnnotations: boolean,
  compactMode: boolean
}
```

Note: project roots are stored in the macOS app's `projects.json`, not in clientStorage.
This avoids duplication with the app's own project management.

**100KB limit on `figma.root.setPluginData`:** The config key stores the full `componentMap`,
which grows with each mapped component (~200 bytes/entry). At 500 components this hits the
limit. Mitigation: `componentMap` is also stored in `token-hero.config.json` on disk (the
bridge is the source of truth). If the `setPluginData` write fails due to size, the plugin
falls back gracefully — it reads the mapping from `REGISTER_MAPPING` on each connection
rather than from `setPluginData`. The plugin should not block on a `setPluginData` write
failure; it should log a warning and continue.

---

## Plugin Tab Structure

```
[Styles] [Inspector] [Audit] [Settings]
```

| Tab | Scope | Selection dependency | Bridge required |
|---|---|---|---|
| Styles | File-wide token/style monitor | None | For code column only |
| Inspector | Component binding checklist | Yes — selected component | For write actions only |
| Audit | Visual audit findings from Flow 3 | Optional | Yes — for triggering audits |
| Settings | Pipeline config, project root link | None | For sync on connect |

Styles is first because it gives the broadest picture and is always useful. Inspector
and Audit are contextual. Last active tab is persisted in `uiPreferences.panelTab`.

---

## Settings Page (Plugin)

A dedicated Settings tab in the plugin panel.

### "Shared with team" (writes to `figma.root.setPluginData`, synced to config file):
- Pipeline type
- Token source file (relative path)
- Generate command
- Audit command (optional)
- Contact sheet URL (optional)
- Bridge port

`groupMap` and `generated` are **not editable in the plugin Settings UI** — they are
configuration-heavy fields that must be set by editing `token-hero.config.json` directly.
The Settings page shows a read-only note: "Advanced fields (groupMap, generated) are
configured in token-hero.config.json — see docs." The bridge syncs these to `setPluginData`
on next connection.

### "This machine only" (read-only in plugin — managed by macOS app):
- Project root — shown as non-editable text in a disabled input field, followed by a
  link: `"Open Token Hero Settings →"`. Clicking this fires the deep link
  `tokenhero://settings` which brings the macOS app to the foreground and opens its
  Settings window. This field is not editable in the plugin; it's owned by the app's
  `projects.json`.

### Save behavior and validation

The Settings tab has a **Save** button at the bottom. On click:
1. Plugin writes all "Shared with team" fields to `figma.root.setPluginData("config")`
2. Plugin sends a `SAVE_CONFIG` message to the bridge (if connected) — bridge writes
   the updated values through to `token-hero.config.json` on disk
3. If bridge is offline, the `setPluginData` write still completes; the config file
   will be synced the next time the bridge connects (bridge reads `setPluginData` on
   `HELLO_ACK`)

**Validation rules:**
- `sourceFile` must be a non-empty string (no path validation — validation happens at
  bridge connection time when the file is actually resolved on disk)
- `generateCommand` must be non-empty
- `bridgePort` must be an integer between 1024 and 65535
- All other fields are optional and accept any non-empty string

**Validation errors** are shown inline below the offending field in red (11px, `#ef4444`).
The Save button is disabled while any validation error is present. No modal dialogs.

**Save success:** the Save button text changes to "Saved ✓" for 2 seconds, then reverts
to "Save". No banner, no toast — the button itself is the feedback.

### Migration story

New machine or new team member:
1. Install Token Hero for macOS
2. Open the app, "Add project…" — pick local repo folder
3. App reads `token-hero.config.json` from the folder (already committed to repo)
4. Open the Figma file — plugin data already loaded, all shared config pre-populated
5. Done. Bridge connects automatically.

New project:
1. Open any Figma file Token Hero hasn't seen
2. Plugin detects no config → opens Settings tab automatically
3. Fill in pipeline type, source file, generate command
4. Run `token-hero map` (or use the plugin's inline mapping flow) to link components
5. Done.

---

## Component Mapping Setup

Mapping stored on each component node via `setPluginData`, mirrored to
`token-hero.config.json` as a readable backup and for CI use.

### Ownership — what Token Hero does and does not own

**Token Hero owns:**
- Suggesting the JSON key (camelCase derived from Figma component name — user must confirm)
- Patching the token source file (`sombra.ds.json`) to add the component entry — the only
  source file it writes to
- Recording the `sourcePath` pointer in the node mapping

**Token Hero does NOT own:**
- Creating the actual component source file (`ToolbarButton.tsx` etc.) — that is the
  developer's responsibility
- Modifying any generated file (`index.css`, `ds.ts`, `port-colors.ts`) — those are
  overwritten on every `npm run tokens` run

The `sourcePath` field in the mapping is a pointer to a file that already exists or will
be created by the developer. Token Hero validates that the path resolves on disk and
shows a warning (not a block) if it does not yet exist — at mapping time when the user
first sets the path, and again on each bridge connection. The check runs once per
connection (not per component) — the bridge validates all `sourcePath` values in the
`componentMap` at `HELLO_ACK` time by doing a batch `fs.access()` check on each path.
Paths that don't resolve are returned in `HELLO_ACK` as `unresolvedPaths: string[]`
(an array of `jsonKey` values whose `sourcePath` is missing). The plugin shows a
warning banner listing the unresolved component keys.
This lets the designer complete the mapping before the developer has created the file,
with a clear signal of what still needs to be built.

### Workflow

**Step 1 — Designer:** maps the component in Token Hero, confirms the JSON key, types the
source path. Token Hero patches `sombra.ds.json` and runs `npm run tokens`. CSS vars and
the `ds.ts` class string are now generated for this component.

**Step 2 — Developer:** creates `ToolbarButton.tsx`, imports `ds.toolbarButton.root` from
the generated `ds.ts`, builds the component using the CSS custom properties. The source
path Token Hero recorded is now valid.

**Step 3 — Verification:** if `contactSheetUrl` is configured, a scoped audit (Flow 4)
confirms the rendered component matches Figma values. Loop closed.

### Setup via CLI (bulk mapping):
```bash
token-hero map   # run from project root
```

**Note:** The CLI (`token-hero map`, `token-hero start`, etc.) is a separate deliverable
not specced in this document. For this implementation pass, assume the CLI does not exist
and all mapping is done through the plugin UI or by editing `token-hero.config.json`
directly.

### Setup via plugin (individual components):
Unmapped component selected → inline prompt → user assigns key and confirms source path →
plugin writes mapping to node (`setPluginData`) → plugin sends `SAVE_MAPPING` to bridge →
bridge writes entry to `token-hero.config.json` → bridge responds with `PATCH_RESULT`.

For component sets, the set node is the mapping unit. Variant structure is recorded in
`variantPropMap` (see Plugin Data Model).

**Config file mirror timing:** the `componentMap` in `token-hero.config.json` is written
by the bridge synchronously when it receives a `SAVE_MAPPING` message. This means the
config file is updated at the moment the user confirms a mapping in the plugin (connected
mode only). Mappings made via CLI `token-hero map` are written directly by the CLI tool.
Offline mapping changes cannot be mirrored — `setPluginData` is written immediately but
the config file sync is deferred until the next bridge connection (via `REGISTER_MAPPING`
round-trip on `HELLO_ACK`).

---

## Local Bridge Spec

WebSocket server at `ws://localhost:7799` (default, configurable per project).
Owned and managed by the macOS app. Current protocol version: `1`.

### Message envelope

```typescript
interface BridgeMessage {
  id: string
  protocolVersion: number
  type: MessageType
  payload: unknown
  timestamp: number
}
```

### Handshake

**HELLO** (plugin → bridge):
```typescript
{
  type: "HELLO",
  payload: {
    pluginVersion: string,
    figmaFileKey: string,
    figmaFileName: string    // human-readable name for log entries and the macOS app's
                             // "Plugin: Connected" menu item (e.g. "Sombra — Components")
                             // not used for routing or validation
  }
}
```

**HELLO_ACK** (bridge → plugin):
```typescript
{
  type: "HELLO_ACK",
  payload: {
    appVersion: string,        // e.g. "1.2.0" — Token Hero macOS app version
    projectName: string,       // e.g. "Sombra" — shown in plugin connected status
    projectRoot: string,       // absolute path on this machine
    sourceFile: string,        // relative to projectRoot (e.g. "tokens/sombra.ds.json")
    componentMapCount: number, // number of component mappings in config — displayed in
                               // the plugin status area as "N components mapped"
    configWrittenAt: number,   // unix timestamp: mtime of token-hero.config.json at
                               // connection time. Used for direction detection in Style Inspector.
    unresolvedPaths: string[]  // jsonKey values whose sourcePath doesn't resolve on disk.
                               // Empty array if all paths resolve. Plugin shows a warning
                               // banner for each: "sourcePath for <jsonKey> not found on disk" 
  }
}
```

If the plugin's `protocolVersion` doesn't match the bridge's, the bridge returns
`VERSION_MISMATCH` and closes the connection. The plugin shows an inline error:
`"Update Token Hero app to continue"` (if bridge is newer) or `"Update plugin to
continue"` (if plugin is newer). No session is established.

**WebSocket unexpected disconnect** (network drop, bridge crash — no `BRIDGE_CLOSING`
received): plugin detects the closed socket, immediately falls back to offline mode,
starts a reconnect retry loop (1s → 2s → 5s → 10s intervals, max 5 attempts), shows
`○ reconnecting…` pill. During the retry window, the plugin behaves identically to
offline mode: full inspection enabled, write actions disabled, cached findings shown. If all retries fail, shows `○ offline — inspection only` with
the "Open Token Hero" button.

**Successful reconnect:** on successful socket re-open, the plugin sends a fresh `HELLO`
as if it were a new session. The bridge responds with `HELLO_ACK` and (if mappings exist)
a `REGISTER_MAPPING`. The plugin re-requests a token snapshot (cache is invalidated on
`HELLO_ACK`). Any in-flight `APPLY_PATCH` from before the disconnect is considered
failed and its row shows the inline error — the patch queue is NOT resumed automatically
since the source file state is unknown after a crash.

**BRIDGE_CLOSING** (bridge → plugin):
```typescript
{ type: "BRIDGE_CLOSING", payload: { reason: "shutdown" | "error" | "project_switch" } }
```

Added `"project_switch"` reason — plugin can show "Reconnecting…" instead of "Offline"
when the app is switching projects.

**SAVE_CONFIG** (plugin → bridge, when user saves Settings page):
```typescript
{
  type: "SAVE_CONFIG",
  payload: {
    pipeline: {
      type: string,
      sourceFile: string,
      generateCommand: string,
      auditCommand?: string,
      contactSheetUrl?: string,
      generated?: string[],
      groupMap?: { [figmaCollectionName: string]: string }
    },
    bridgePort: number
  }
}
```

Bridge receives this and writes the values to `token-hero.config.json`. Responds with
`{ type: "SAVE_CONFIG_RESULT", payload: { success: boolean } }` (standard envelope).
The macOS app detects a port change in `SAVE_CONFIG_RESULT` and shows the restart prompt
(see macOS Settings window spec above).

**OPEN_CONTACT_SHEET** (plugin → bridge, on Feature 2 trigger):
```typescript
{
  type: "OPEN_CONTACT_SHEET",
  payload: { jsonKey: string }   // bridge appends as fragment to contactSheetUrl
}
```
Bridge responds with no message — it fires `open "<contactSheetUrl>#<jsonKey>"` and returns
to idle. No `OPEN_CONTACT_SHEET_RESULT` is needed; failures (missing contactSheetUrl,
`open` error) are logged to `token-hero.log` only.

**SAVE_MAPPING** (plugin → bridge, during plugin-initiated mapping setup):
```typescript
{
  type: "SAVE_MAPPING",
  payload: {
    figmaNodeId: string,
    jsonKey: string,
    sourcePath: string,
    variantPropMap?: { [figmaPropName: string]: string }  // only for component sets
  }
}
```

Bridge receives this, writes the entry to `token-hero.config.json`, and responds with
a standard `PATCH_RESULT`. The plugin has already written to node `setPluginData` before
sending this — `SAVE_MAPPING` is the bridge-sync step only.

**REGISTER_MAPPING** (bridge → plugin, on reconnect or after CLI mapping):
```typescript
{
  type: "REGISTER_MAPPING",
  payload: {
    mappings: Array<{
      figmaNodeId: string,
      jsonKey: string,
      sourcePath: string,
      variantPropMap?: { [figmaPropName: string]: string }  // only for component sets
    }>
  }
}
```

Bridge sends this to push the full mapping set to the plugin — sent as a separate message
in the same event loop tick as `HELLO_ACK` (back-to-back, no async gap) if mappings exist
in config, or asynchronously after a CLI `token-hero map` run completes. The plugin must
handle `REGISTER_MAPPING` arriving either immediately after `HELLO_ACK` or at any later
point in a session. The plugin does not need to wait for `REGISTER_MAPPING` before
considering itself connected — `HELLO_ACK` alone establishes connected mode. The plugin
uses `REGISTER_MAPPING` to populate `setPluginData` on each mapped node (idempotent write).

---

### Flow 1 — Component property query

```typescript
// Request (CLI/audit script → bridge → plugin)
{ type: "GET_COMPONENT_PROPERTIES", payload: { figmaNodeId: string, timeoutMs?: number } }

// Response (plugin → bridge → caller)
{
  type: "COMPONENT_PROPERTIES_RESULT",
  payload: {
    nodeId: string,
    componentName: string,
    figmaFileKey: string,
    isComponentSet: boolean,

    // For single ComponentNode (isComponentSet: false):
    layers?: Layer[],

    // For ComponentSetNode (isComponentSet: true):
    variants?: {
      [variantKey: string]: {    // e.g. "State=Default,Size=Md" — from variantProperties
        variantNodeId: string,
        layers: Layer[]
      }
    }
  }
}

type Layer = {
  layerId: string,
  layerName: string,
  properties: {
    [property: string]: {
      value: string | number,       // raw value (e.g. "#6366f1", 12)
      tokenId: string | null,       // Figma variable/style ID if bound
      tokenName: string | null,     // human-readable name (e.g. "fg/default")
      isBound: boolean,
      isOverridden: boolean         // true if a variant has overridden the base value
    }
  }
}
```

When called on a `ComponentSetNode`, all variants are returned in one response — the
plugin constructs `variantKey` from `componentNode.variantProperties`. Algorithm:
1. Take the entries from `variantProperties` (e.g. `{ State: "Default", Size: "Md" }`)
2. Sort entries alphabetically by property name (ascending, case-sensitive)
3. Format each as `Name=Value`
4. Join with `,` (no spaces)

Example: `{ State: "Default", Size: "Md" }` → sorted: `Size`, `State` →
`"Size=Md,State=Default"`.

Property names or values containing `=` or `,` must be percent-encoded before joining:
`=` → `%3D`, `,` → `%2C`. In practice Figma variant property names don't contain these
characters, but the encoder must handle them defensively.

Collisions are not possible: Figma enforces that no two variants within a component set
can have identical property combinations, so sorted+encoded keys are guaranteed unique.

Timeout: 10s default (or `timeouts.componentQuery` from config if set). Per-request
`timeoutMs` in the payload overrides the config value — per-request always wins.
`PLUGIN_NOT_AVAILABLE` if plugin not connected. Callers fall back to REST API in that case.

---

### Flow 2 — Source file patch

```typescript
// Request (plugin → bridge)
{
  type: "APPLY_PATCH",
  payload: {
    targetFile: string,
    patch: Array<{ op: "replace" | "add" | "remove", path: string, value?: unknown }>,
    runAfter: string[]
  }
}

// Response (bridge → plugin)
{
  type: "PATCH_RESULT",
  payload: {
    success: boolean,
    projectRoot: string,
    projectName: string,
    patchedPaths: string[],
    commandResults: Array<{
      command: string,
      exitCode: number,
      stdout?: string,
      stderr?: string,
      durationMs: number
    }>
  }
}
```

RFC 6902 JSON Patch format. `targetFile` is a path relative to `projectRoot` (e.g.
`"tokens/sombra.ds.json"`). The bridge resolves it against the active project root before
writing. Bridge validates the resolved absolute path is not a generated output before
writing. Generated outputs are identified by checking:
1. Any path listed in the `generated` array in `token-hero.config.json` (user-configured)
2. The `sourceFile` itself (the token source file is never a patch target)
3. Pipeline-type hardcoded defaults:
   - `json-source`: `src/generated/ds.ts`, `src/index.css`, `src/utils/port-colors.ts`
   - `style-dictionary`: any file under `build/` (the default Style Dictionary output dir)
   - `tokens-studio`: no hardcoded defaults — relies entirely on the `generated` array
   - `custom`: no hardcoded defaults — relies entirely on the `generated` array

Returns `PATCH_TARGET_INVALID` if the resolved path matches any of the above.

`runAfter` is an array of shell command strings to execute after the patch is written,
in order (e.g. `["npm run tokens"]`). These are the same strings as `generateCommand` /
`auditCommand` in the pipeline config — arbitrary shell commands run in `projectRoot`.
Each produces one entry in `commandResults`. An empty array is valid (patch without
running any command).

**Command execution environment:**
- Shell: `/bin/sh -c "<command>"` — POSIX sh, not bash, not the user's login shell
- Working directory: `projectRoot` (absolute path from `projects.json`)
- Environment variables: the macOS app's inherited environment from launch, augmented
  with `PATH` extended to include `/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/opt/node/bin`
  to ensure `npm`, `node`, and Homebrew-installed tools are reachable regardless of
  the user's shell profile. If a project's toolchain requires additional PATH entries,
  document that the user must launch Token Hero from a terminal with their full PATH,
  or add a `PATH` override field to the project config in a future version.
- No pseudo-terminal (non-interactive). Commands must not require TTY input.
- `stdout` and `stderr` are captured separately and written to `token-hero.log`.
  Both are also included in `commandResults` (capped at 10KB each per command to
  avoid response bloat; truncated with a `[truncated]` suffix).

**Concurrency:** the plugin queues patches serially. Only one `APPLY_PATCH` is in flight
at a time. Items waiting in the queue show a `pending…` state in their row. This prevents
concurrent writes to the source file.

**Failure handling:** if `success: false` or any `commandResults[].exitCode !== 0`, the
plugin shows an inline error on the row that triggered the patch: `"Patch failed — see
log"`. The patch is NOT retried automatically. The source file may be in a partially
written state — the bridge must either write atomically (write to a temp file, then
rename). Atomic write is mandatory — write to `<targetFile>.tmp`, validate the patched
  JSON parses cleanly, then `fs.rename()` to the final path. Rolled-back state is indicated in
`PATCH_RESULT.success: false` with `detail` containing the error. The plugin's patch
queue continues processing remaining queued items regardless of the failure.

---

### Flow 3 — Audit result ingestion

**Direction: bridge → plugin only (push, not request/response).** Flow 3 has no request
message. The bridge pushes `AUDIT_RESULTS` to the plugin after an audit command completes.
This happens in two cases:
1. **Full audit** — user clicks "Run audit" in the macOS menu bar. Bridge runs
   `auditCommand` with no additional arguments (e.g. `npm run audit:visual`), captures
   stdout as findings JSON, and pushes results with `replaceExisting: false` (appends to
   existing findings).
2. **Scoped audit** — Flow 4 (`RUN_SCOPED_AUDIT`) completes. Bridge runs
   `<auditCommand> --component <jsonKey>` (same command string as `auditCommand`, with
   `--component <jsonKey>` appended), and pushes the scoped results with
   `replaceExisting: true` (replaces findings for that component only).

These are the same bridge push mechanism — the difference is the command arguments and
the `replaceExisting` flag. The bridge does not use a different code path for the two cases.

```typescript
{
  type: "AUDIT_RESULTS",
  payload: {
    source: "visual" | "binding",
    generatedAt: number,
    replaceExisting: boolean,
    findings: Array<{
      figmaNodeId: string, layerId: string, layerName: string, componentName: string,
      divergenceType: "CASCADE_LOSS" | "WRONG_TOKEN" | "TOKEN_MISSING" | "NOT_APPLIED" |
                     "UNRECORDED_VARIANT_DELTA" | "REMOVED_NESTED",
      figmaValue: string | number,
      browserValue: string | number | null,  // null for binding-only types (WRONG_TOKEN,
                                             // TOKEN_MISSING, UNRECORDED_VARIANT_DELTA,
                                             // REMOVED_NESTED) — no browser involved
      expectedToken: string | null, actualToken: string | null,
      suggestedFix?: SuggestedFix
    }>
  }
}

type SuggestedFix =
  | { op: "rebind", targetTokenName: string, targetTokenId: string, property: string }
  | { op: "create_token", suggestedName: string, suggestedValue: string | number, collection: string }
  | { op: "patch_json", patch: Array<{ op: "replace" | "add" | "remove", path: string, value?: unknown }> }
```

Plugin receipt sequence on `AUDIT_RESULTS`:
1. Parse findings, group by `figmaNodeId` (parent component node)
2. For each component: write `auditFindings` to `componentNode.setPluginData` — this is
   the persistence step that makes findings available in offline mode
3. Update `lastAuditStatus` on each component's `mapping` key
4. If `replaceExisting: true`: clear all existing canvas annotations for those components
   before placing new ones
5. Place canvas annotations on drifted layers (see Feature 3)

**Annotations cleared by "user action"** means: clicking `[Fix →]` or `[Fix all →]` on
a finding, or explicitly dismissing an annotation via a close button on the annotation
itself. Switching tabs, closing the plugin, or deselecting a component does NOT clear
annotations — they persist on the canvas until resolved or replaced.

**`SuggestedFix` execution semantics:**
- `op: "rebind"` — plugin executes directly via Figma Plugin API:
  `node.setBoundVariable(property, figma.variables.getVariableById(targetTokenId))`
- `op: "create_token"` — plugin calls `figma.variables.createVariable(...)` in the
  appropriate collection, then performs a rebind
- `op: "patch_json"` — plugin sends a Flow 2 `APPLY_PATCH` to the bridge with the
  provided patch array; bridge executes it and runs `runAfter` commands

**Divergence type definitions:**

| Type | Meaning | Source |
|---|---|---|
| `CASCADE_LOSS` | Token bound in Figma but overridden in CSS cascade | Visual audit |
| `WRONG_TOKEN` | Layer bound to a variable, but wrong one | Binding audit |
| `TOKEN_MISSING` | Layer has no variable bound (raw value) | Binding audit |
| `NOT_APPLIED` | Token correct but a hardcoded override blocks it in code | Visual audit |
| `UNRECORDED_VARIANT_DELTA` | Bound to a valid token, but `variants` block in component JSON doesn't record it | Binding audit (component sets) |
| `REMOVED_NESTED` | Component listed in `JSON.nested[]` but absent from the variant's layer tree | Binding audit (component sets) |

---

### Flow 4 — Scoped audit trigger

```typescript
// Request (plugin → bridge)
{ type: "RUN_SCOPED_AUDIT", payload: { jsonKey: string, figmaNodeId: string, timeoutMs?: number } }
```

Bridge runs `<auditCommand> --component <jsonKey>`, sends back scoped `AUDIT_RESULTS` with
`replaceExisting: true`. Plugin shows ✅ Clean or ❌ remaining diff. Timeout 30s default.

---

### Flow 5 — Token snapshot

```typescript
// Request (plugin → bridge)
{
  type: "GET_TOKEN_SNAPSHOT",
  payload: {
    groups?: Array<"textStyles" | "colors" | "effects" | "spacing" | "radius" | "sizes">
    // omit to request all groups
  }
}

// Response (bridge → plugin)
{
  type: "TOKEN_SNAPSHOT_RESULT",
  payload: {
    sourceFile: string,             // absolute path that was read
    readAt: number,                 // unix timestamp
    tokens: {
      textStyles?: {
        [name: string]: {
          fontSize: number,
          lineHeight: string | number,  // "150%" (percent string) or number (px)
          fontWeight: number,
          letterSpacing?: string,
          textCase?: string,
          fontFamily?: string
        }
      },
      colors?: {
        [name: string]: string       // hex or rgba
      },
      effects?: {
        [name: string]: {
          type: string,
          color: string,
          opacity: number,
          x: number, y: number,
          blur: number, spread: number
        }
      },
      spacing?: { [name: string]: number },
      radius?:  { [name: string]: number },
      sizes?:   { [name: string]: number }
    }
  }
}
```

Bridge reads the source file at request time — no caching on the bridge side. The plugin
caches the result with a TTL (default 2 minutes) and re-requests on explicit Refresh or
when TTL expires. If the file doesn't exist, returns `SOURCE_FILE_NOT_FOUND`. If it
exists but can't be parsed, returns `SOURCE_FILE_PARSE_ERROR` with `detail` containing
`{ line: number | null, message: string }` — the JSON.parse error message and line number
where available (Node.js does not always provide line numbers; `null` is valid).

**groupMap transform (applied by the bridge before sending):** The bridge reads raw token
groups from the source file, then remaps them according to the project's `groupMap`
config before constructing `TOKEN_SNAPSHOT_RESULT`. Multiple Figma collections that map
to the same group (e.g. both `"UI Colors"` and `"Port Types"` → `"colors"`) are merged
using `Object.assign` — keys from later collections in config order overwrite earlier ones
on conflict. The plugin receives pre-merged groups and does not need to apply `groupMap`
itself.

---

### Error handling

```typescript
{
  type: "ERROR",
  payload: {
    correlationId: string,
    code: "NODE_NOT_FOUND" | "PLUGIN_NOT_AVAILABLE" | "PATCH_FAILED" |
          "PATCH_TARGET_INVALID" | "AUDIT_FAILED" | "SOURCE_FILE_NOT_FOUND" |
          "SOURCE_FILE_PARSE_ERROR" | "BRIDGE_TIMEOUT" |
          "VERSION_MISMATCH" | "UNKNOWN",
    // BRIDGE_TIMEOUT: sent by the bridge when the plugin does not respond to a
    // GET_COMPONENT_PROPERTIES request within the configured timeout
    // (timeouts.componentQuery). The bridge sends this error to the caller
    // (CLI or audit script) and does not forward it to the plugin.
    // The plugin uses its own timeout guard for RUN_SCOPED_AUDIT — if
    // AUDIT_RESULTS is not received within timeouts.scopedAudit, the plugin
    // shows an inline "Audit timed out" error and re-enables the audit button.
    message: string,
    detail?: unknown
  }
}
```

Errors surfaced inline in plugin, never blocking modals. All messages logged to
`token-hero.log` in project root.

---

### Config file

`token-hero.config.json` at project root — committed to the repo. Human-readable backup
of file-level plugin data. Read by CLI for scripts and CI. Read by the macOS app on
"Add project…" to pre-populate settings. `projectRoot` intentionally absent (it's in
the app's `projects.json`).

```json
{
  "port": 7799,
  "pipeline": {
    "type": "json-source",
    "sourceFile": "tokens/sombra.ds.json",
    "generateCommand": "npm run tokens",
    "auditCommand": "npm run audit:visual",
    "contactSheetUrl": "http://localhost:5173/ds-preview",
    "generated": [
      "src/generated/ds.ts",
      "src/index.css",
      "src/utils/port-colors.ts"
    ]
  },
  "timeouts": { "componentQuery": 10000, "scopedAudit": 30000 },
  "componentMap": {
    "Node Card": {
      "jsonKey": "nodeCard",
      "sourcePath": "src/components/NodeCard.tsx",
      "figmaNodeId": "123:456"
    },
    "Node Header": {
      "jsonKey": "nodeHeader",
      "sourcePath": "src/components/NodeHeader.tsx",
      "figmaNodeId": "234:567",
      "variantPropMap": { "State": "state" }
    }
  }
}
```

The `variantPropMap` field is only present for component set entries. Single-component
entries omit it. The `figmaNodeId` for a component set is the set node's ID, not any
individual variant's ID.

---

## Deep features

### Feature 1 — Audit script as Figma data source (Flow 1)
Replaces REST + cache fragility. Falls back to REST if plugin offline. ~40% simplification
of Sombra's `figma-audit.ts`.

### Feature 2 — Contact sheet awareness
Select component → browser tab scrolls to matching `data-ds-component` element.
Requires `contactSheetUrl` in pipeline config.

**Protocol:** The plugin constructs a URL with a fragment: `<contactSheetUrl>#<jsonKey>`
(e.g. `http://localhost:5173/ds-preview#nodeCard`) and sends a `OPEN_CONTACT_SHEET`
message to the bridge. The bridge opens or focuses the URL in the system's default browser
using the macOS `open` command: `open "<contactSheetUrl>#<jsonKey>"`. If the contact sheet
is already open in a browser tab, most browsers will scroll to the fragment without
reloading. The contact sheet page must use `data-ds-component="<jsonKey>"` attributes
on its component wrappers; no additional JS listener is required on the page side — the
browser handles fragment navigation natively.

### Feature 3 — Divergence highlighting in Figma (Flow 3)
`CASCADE_LOSS` red / `WRONG_TOKEN` amber / `TOKEN_MISSING` yellow / `NOT_APPLIED` blue.
Selecting annotated layer opens panel pre-filtered with one-click fix.

### Feature 4 — Batch bind from audit results
```
Token Hero → "Audit findings" tab
├── CASCADE_LOSS (8)    [Fix all →]
├── WRONG_TOKEN (12)    [Fix all →]
├── TOKEN_MISSING (24)  [Fix all →]
└── NOT_APPLIED (6)     [Fix all →]
```
`suggestedFix` discriminated union — machine-readable, preview before apply.

### Feature 5 — Contact sheet as test harness (Flow 4)
After any fix → scoped audit → ✅ Clean or ❌ remaining diff. Requires `auditCommand`.

### Feature build order

| Priority | Feature |
|---|---|
| 1 | macOS app + bridge server (prerequisite for everything) |
| 2 | Plugin scaffold — tab shell, offline/connected status pill |
| 3 | Flow 5 — token snapshot (prerequisite for Style Inspector) |
| 4 | Style Inspector tab — Figma read + diff display |
| 5 | Style Inspector — push to code (Flow 2 integration) |
| 6 | Flow 1 — audit script data source |
| 7 | Inspector tab — component binding checklist |
| 8 | Flow 2 + 3 — batch bind from audit results |
| 9 | Audit tab — divergence highlighting in Figma |
| 10 | Contact sheet awareness + Flow 4 test harness |

---

## Relationship to Sombra

Sombra is the reference implementation. Token Hero is independent.

Sombra-specific integration:
- `figma-audit.ts` calls Flow 1 for Figma data (REST fallback)
- Batch bind writes via Flow 2
- Test harness triggers via Flow 4

`token-hero.config.json` is committed to the Sombra repo. The macOS app reads it on
setup. The plugin data in the Figma file stays in sync with it.

Sombra's context should note: *"Component section of sombra.ds.json is maintained via
Token Hero. See Token Hero project for tooling details."*

---

## Style Inspector Tab

A dedicated first tab in the plugin. File-wide, not selection-scoped. Always visible.
Gives a continuous read on the sync state of every style and token in the Figma file
against the token source file — without needing to select a component or run an audit.

---

### Concept

The Style Inspector is a **monitoring surface**, not an action surface. Its job is to
show the current truth: what Figma has, what the code has, where they agree, where they
don't. Actions (push, patch) are available inline but secondary. The list itself is the
primary output.

This is distinct from the Audit tab, which is component-scoped and requires the bridge
to run an external audit command. The Style Inspector runs entirely from:
- Figma Plugin API (live style and variable values — always current)
- A snapshot of the token source file read via the bridge (Flow 5)

In offline mode the code column is empty but Figma values are still shown — useful for
inspecting binding completeness without the bridge.

---

### Data sources for Sombra

**From Figma Plugin API:**

| API call | Returns | Count |
|---|---|---|
| `figma.getLocalTextStyles()` | All named text styles | 11 |
| `figma.getLocalEffectStyles()` | All named effect styles | 1 group (shadow) |
| `figma.getLocalVariableCollections()` | All variable collections | 6 collections |
| → Port Types | Port color variables | 8 |
| → Radius | Corner radius tokens | 5 |
| → Sizes | Size tokens | 11 |
| → Spacing | Spacing tokens | 8 |
| → UI Colors | Surface, fg, and accent colors | 17 |

**From token source file (via Flow 5 snapshot):**

The bridge reads `tokens/sombra.ds.json` and returns current values for all token groups.
The plugin diffs Figma live values against these snapshot values to produce drift status.

---

### Tab layout

```
┌─ Token Hero ─────────────────────────────────── ● connected · Sombra ─┐
│  [Styles] [Inspector] [Audit] [Settings]                               │
│  ──────────────────────────────────────────────────────────────────── │
│  [All ▾]                                     ↻ refreshed 2 min ago    │
│                                                                        │
│  ▾ Text Styles                          11 styles · 2 drifted          │
│  ▾ Colors                               17 vars · clean                │
│  ▾ Effects                              1 style · clean                │
│  ▾ Spacing                              8 vars · clean                 │
│  ▾ Radius                               5 vars · clean                 │
│  ▾ Sizes                                11 vars · clean                │
└────────────────────────────────────────────────────────────────────────┘
```

**Filter control** (segmented, top-left): `All` / `Drifted` / `Clean` / `Unmapped`

When `Drifted` is selected, all clean groups collapse and only drifted rows show. This
is the fast-path for finding work to do.

**Refresh** (top-right): timestamp of last source file read. Click to re-read snapshot
and re-diff. Refresh also runs automatically when the Style Inspector tab is opened.

---

### Section rows — collapsed

Each group is a collapsible section header showing a summary badge:

```
▾ Text Styles                          11 styles · 2 drifted
```

Badge states (rightmost):
- `· clean` — all items in group match code
- `· N drifted` — N items have Figma ≠ code
- `· N unmapped` — N items are used on a component but have no code entry
- `· N drifted · N unmapped` — both
- `· N orphaned` — N items are in code but removed from Figma

**Badge count rule:** the badge count only includes items that require action —
drifted, used-unmapped, and orphaned items. A new unused item does NOT increment the badge.

"Used" definition by type:
- **Variables:** `variable.consumers` returns a non-empty array (Figma Plugin API)
- **Text styles:** walk all text layers on all pages; style is "used" if any layer has
  `textStyleId === style.id`. This walk is done lazily on tab open and cached for the session.
- **Effect styles:** walk all layers; style is "used" if any has `effectStyleId === style.id`.
  Same lazy walk + cache pattern.

"Unused unmapped" items appear in the list with `○` but without contributing to the count.

Click header to expand/collapse. Groups default to expanded when there are actionable items,
collapsed when clean.

---

### Section rows — expanded (individual token rows)

**Clean row:**
```
  ● heading/section          12px Semi Bold · LH150%     12px · LH150%
```

**Drifted row (Figma newer than code):**
```
  ● heading/node-title       15px Semi Bold · LH140%  ≠  14px · LH150%
```

**Unmapped row (exists in Figma, no code entry):**
```
  ○ heading/new-style        13px Regular · LH150%        —
```

**Column layout per row:**

| Column | Content | Width |
|---|---|---|
| Status dot | ● colored / ○ empty | 12px |
| Name | Token/style name | flex |
| Figma value | Live value from Plugin API | fixed |
| Separator | `≠` if drifted, nothing if clean | 8px |
| Code value | Value from JSON snapshot | fixed |

---

### Status dot colours

| State | Dot | Meaning |
|---|---|---|
| Clean | ● `#4ade80` green | Figma = code |
| Drifted (Figma→code) | ● `#fb923c` amber | Figma changed, code behind — push available |
| Drifted (code→Figma) | ● `#f87171` red | Code is newer — push will overwrite manual change, warn first |
| Unmapped | ○ empty outline | In Figma, no code entry |
| Orphaned | ○ empty outline, italic | In code, removed from Figma |
| Internal | ○ dim `[internal]` | Excluded via `[Mark as internal]` — not counted, not flagged |

**Direction detection:** The Figma Plugin API does not expose per-style or per-variable
modification timestamps. Direction is determined as follows:

- The plugin stores a `lastPushedAt` unix timestamp per token in `figma.root.setPluginData("styleTimestamps")`
  as a `{ [styleOrVariableId: string]: number }` map. This is written on every successful
  `[Push to code →]` execution for a given token.
- The bridge includes `configWrittenAt: number` (unix timestamp, the `mtime` of
  `token-hero.config.json`) in `HELLO_ACK`.

**Direction rule:**
- No `lastPushedAt` entry for this token → direction unknown → show amber (assume Figma is newer)
- `lastPushedAt >= configWrittenAt` → Figma changed since last push → amber
- `configWrittenAt > lastPushedAt` → config was written after the last push (direct code edit) → red, warn before push

**`[Mark as internal]`** — available as a row action in the expanded detail for any
unmapped item. Adds the variable/style name to `figma.root.setPluginData("excludedTokens")`.
Row immediately switches to the dim `[internal]` state (`opacity: 0.4` on the entire row)
and is excluded from badge counts. Clearable per item (same row action becomes
`[Unmark internal]`) or in bulk from the Settings tab.

---

### Expanded drift detail

Clicking a drifted or unmapped row expands it inline:

```
  ● heading/node-title       15px Semi Bold · LH140%  ≠  14px · LH150%
  ┌───────────────────────────────────────────────────────────────────┐
  │  Figma    Inter Semi Bold · 15px · LH 140%                       │
  │  Code     Inter Semi Bold · 14px · LH 150%                       │
  │  Used by  nodeCard (title), floatingPreview (title), +2 more     │
  │                                              [Push to code →]    │
  └───────────────────────────────────────────────────────────────────┘
```

**"Used by"** — computed lazily on expand. For text styles: walk all component nodes on
all pages, find layers with `textStyleId === style.id`. For variables: use `variable.consumers` (Figma Plugin API) — this is always available
in plugin API v1+. Do not walk nodes as a fallback; if `variable.consumers` returns an
empty array, the variable is genuinely unused. Cache result per style/variable ID for
the session; invalidate on Refresh click or `documentchange` event.

**[Push to code →]** — sends Flow 2 `APPLY_PATCH` for this specific token. Shows a diff
preview of the patch before confirming. Disabled if bridge offline. If direction is
code→Figma (red dot), the expanded detail shows a warning before the push button:
`"Code is newer — pushing Figma values will overwrite a manual code change."` The button
is still available (not disabled) since the designer may have intentionally changed
the Figma value after a developer edited the code. They must confirm past the warning.

---

### Batch push

When a section has multiple drifted items, a batch action appears at the section header
level when expanded:

```
  ▾ Text Styles                 11 styles · 2 drifted   [Push all drifted →]
```

`[Push all drifted →]` sends a single `APPLY_PATCH` with all pending changes in that
group combined into one RFC 6902 patch array. One `npm run tokens` call after.

A global `[Push all →]` appears at the top of the panel only when there are drifted items
across multiple groups — never shown when everything is clean.

**Token snapshot cache invalidation** — the plugin caches the Flow 5 snapshot with a
TTL (default 2 minutes). The cache is also invalidated immediately on:
1. Any successful `PATCH_RESULT` — the source file just changed
2. `HELLO_ACK` received — fresh connection, source file may have changed while disconnected
3. `[Push all drifted →]` completion — same as case 1 but for batch pushes

Manual Refresh always busts the cache regardless of TTL.

---

### Two-gap model for new styles and variables

When a new style or variable is created in Figma and applied to a component, there are
two separate gaps that must be closed independently:

**Gap 1 — Source file gap:** the token or style has no entry in `sombra.ds.json`.
This gap is visible in the Style Inspector: the row shows `○ unmapped`. Action: the
row's expanded detail shows `[Add to source →]`, which sends a Flow 2 patch to add
the entry and runs `npm run tokens`.

**Gap 2 — Component JSON gap:** the component's JSON entry in `sombra.ds.json` doesn't
reference the token/style, even if the source file now has an entry for it. This gap is
visible in the Inspector tab when the component is selected: the binding is shown as
`✅ bound · ○ not recorded in component entry`. Action: `[Record →]` adds the reference
to the component's JSON block.

Closing Gap 1 does NOT close Gap 2. They are architecturally separate: the source file's
token entries have no awareness of which components reference which tokens — that
relationship is recorded only in the component JSON block. Both patches are required for
full tracking. The Style Inspector and Inspector tab are separate surfaces addressing
separate gaps.

---

### Value formatting per type

The display value in each row must be human-readable, not raw JSON:

| Type | Figma format | Code format |
|---|---|---|
| Text style | `15px Semi Bold · LH 140%` | `15px · LH140%` |
| Text style (with tracking) | `12px Semi Bold · LS 0.6px · UPPER · LH150%` | same |
| Color variable | `#6366f1` or `rgba(99,102,241,0.4)` | `#6366f1` |
| Effect style | `drop-shadow 0 8px 24px #000 50%` | `0 8px 24px #000000 50%` |
| Spacing | `12px` | `12px` |
| Radius | `4px` | `4px` |
| Size | `160px` | `160px` |

For color variables with opacity: show `#6366f1 @ 40%` rather than full rgba.

---

### Offline mode behaviour

When bridge is not connected:
- Code column shows `—` for all rows
- Drift status shows `○` (unmapped/unknown) for all — no false "clean" state
- Section badges show `N styles · no code data`
- Refresh button disabled, shows `○ offline`
- "Used by" computation still works (Plugin API only)
- Rows are still useful: you can see all Figma values and audit for binding completeness

---

### Refresh behaviour and live detection

The Style Inspector is not a real-time stream — it is a snapshot diff. Two things
control its freshness:

**1. Tab-open refresh (automatic)**

Whenever the user switches to the Styles tab, the plugin calls:
```typescript
figma.getLocalTextStyles()
figma.getLocalEffectStyles()
figma.getLocalVariableCollections()  // + variables per collection
```
These are live Plugin API calls and always return current Figma state. Any style or
variable created since the last view will appear immediately on tab open.

The code-side snapshot (Flow 5 from the bridge) is NOT re-fetched on every tab open —
only if it is older than a configurable TTL (default: 2 minutes) or the user clicks
Refresh. This avoids re-reading the source file on every glance at the tab.

**2. `documentchange` listener (passive nudge)**

The plugin registers:
```typescript
figma.on("documentchange", (event) => {
  const relevant = event.documentChanges.some(c =>
    c.type === "STYLE_CREATE" || c.type === "STYLE_DELETE" ||
    c.type === "STYLE_PROPERTY_CHANGE" ||
    c.type === "VARIABLE_CREATE" || c.type === "VARIABLE_DELETE" ||
    c.type === "VARIABLE_SET_VALUE"
  )
  if (relevant) markStylesTabStale()
})
```

When a relevant change fires, the Styles tab header shows a passive nudge — the Unicode
character ⟳ is appended to the tab label text:
```
[Styles ⟳]
```
This is a literal UI label change, not a button or badge. No banner, no interruption. If
the user is currently on the Styles tab, the row updates in place — calling the live API
is cheap and can happen immediately.

**3. Inspector tab — selection-change rescan**

```typescript
figma.on("selectionchange", () => {
  if (currentTab === "inspector") runBindingAudit(figma.currentPage.selection[0])
})
```

When selection changes, the Inspector tab reruns the binding walk automatically. This
means: if you create a new style, apply it to the selected component's layer, and then
click elsewhere and back — the Inspector tab updates immediately.

Within a single selection without deselecting, changes to the component while the
Inspector tab is open are NOT automatically reflected. A **Re-scan** button in the
Inspector tab header triggers a manual re-walk. This is the right tradeoff — constant
polling is expensive; a visible manual trigger is cheap and intentional.

**Variant node selection:** if the user selects a variant node (`ComponentNode`) rather
than the component set itself, the plugin walks up to the parent `ComponentSetNode`,
shows the set's mapping, and displays a note: `"Mapping is on the parent set"`. Binding
audit still runs on the selected variant's layer tree.

**Example flow (mid-session variable creation):**

You are auditing Node Card. You create a new variable `surface/overlay` in the Variables
panel and apply it to the `compact` variant's `bg` layer — without leaving the Inspector tab.

- `documentchange` fires → Styles tab gets a stale ⟳ nudge
- Inspector tab: the audit results on screen are stale for this component
- You click **Re-scan** → binding walk reruns → `bg [compact] surface/overlay ✅ bound · ○ unrecorded variant delta` appears
- You switch to Styles tab → `surface/overlay` shows as `○ unmapped · used (Node Card)` immediately

No data is lost. The nudge model keeps the UI calm during active design work while
ensuring nothing is silently missed.

---

### Token snapshot data (Flow 5)

See **Flow 5 — Token snapshot** in the Local Bridge Spec. The Style Inspector uses
Flow 5 as its code-side data source. The Figma side comes from live Plugin API calls.
The diff between the two produces drift status for every row.

---

## Plugin UI Style Guide

Token Hero's plugin UI follows the same design language as the Teleport Figma plugin
(`github.com/spendolas/teleport-figma`). All rules below are derived from that codebase
and must be applied consistently.

### Typography

| Property | Value |
|---|---|
| Font family | `Inter, sans-serif` |
| Font size | `11px` |
| Font weight | `400` |
| Line height | `16px` |
| Label size | `11px`, `opacity: 0.5`, `margin-bottom: 4px` |

### Palette

| Token | Light | Dark |
|---|---|---|
| Text | `#242424` | `#afafaf` |
| Background | `#ffffff` | `#242424` |
| Surface (inputs, secondary buttons, segmented bg) | `rgba(36,36,36,0.2)` | `#383838` |
| Primary action | `#242424` | `#3c8ae8` |
| Primary action text | `#ffffff` | `#ffffff` |
| Active segment | `#242424` | `#3c8ae8` |
| Checkbox checked bg | `rgba(36,36,36,0.2)` | `#383838` |
| Checkbox checked mark | `#242424` | `#afafaf` |

Accent color (`#3c8ae8`) **only appears in dark mode** — for primary buttons and active
segmented control state. Light mode uses `#242424` for all active/primary states.

### Spacing & sizing

| Property | Value |
|---|---|
| Body padding | `10px 12px` |
| Control height (inputs, buttons, segmented) | `32px` |
| Border radius (all controls) | `4px` |
| Gap between field groups | `12px` |
| Gap between paired action buttons | `4px` |
| Split row gap | `8px` |
| Checkbox size | `20×20px` |
| Checkbox border | `1px solid #242424` (light) / `1px solid #808080` (dark) |

### Controls

**Inputs & selects** — no border, `background` defines the boundary, `outline: none`,
`-webkit-appearance: none`. Placeholder text at 50% opacity. Spin buttons hidden on
number inputs.

**Segmented control** — flex container, full border-radius, segments are flex children
with `flex: 1`. Active segment gets the primary color fill; inactive is transparent on
the surface background. No gaps between segments.

**Checkbox** — fully custom. Native input hidden. Visible `.checkmark` div is 20×20 with
border. Checked state: background fill + a centered 10×8px solid square (not a tick icon).
Paired with a label text via `.checkbox-label` flex row, `gap: 8px`.

**Primary button** — filled, primary color, white text.

**Secondary button** — surface background, primary text color.

**Hover** — `opacity: 0.8` (segmented inactive), `opacity: 0.9` (buttons). No transforms,
no box-shadows, no focus rings.

**Disabled** — `opacity: 0.3`, `cursor: default`.

### Layout patterns

```
.field          flex column, gap between label and control
.split-row      flex row, gap: 8px — used for side-by-side half-width fields
.half           flex: 1, flex column — child of .split-row
.button-group   flex column, gap: 4px — stacked primary + secondary CTAs
.hidden         display: none — used for conditional visibility
```

Fields stack vertically in `#content-wrapper` with `gap: 12px`.

### Sizing / resize behaviour

Plugin window height is dynamic. After any layout change, measure
`elWrapper.offsetHeight + 20 + 8` (body padding + buffer) and post a `resize` message
to the plugin:
```javascript
parent.postMessage({ pluginMessage: { type: 'resize', height } }, '*');
```
Use double `requestAnimationFrame` to let CSS settle before measuring.

### Dark mode

Implemented via `@media (prefers-color-scheme: dark)`. All color values in the dark block
override only what changes — structure and sizing are shared. No JS involvement.

### What NOT to do

- No box shadows anywhere
- No focus ring styles
- No animations except the macOS app icon pulse (that's native, not plugin)
- No color other than `#242424`/`#afafaf` and `#3c8ae8` (dark only)
- No font weights other than `400`
- No font sizes other than `11px`
- No border on inputs — surface background only
- No custom scrollbars
- No icons (text labels only, matching Teleport's pattern)

---

## Status

Architecture defined. macOS app fully specced. Plugin data model and Settings page
defined. Bridge fully specced (Flows 1–5). Style Inspector tab fully specced. Both
operating modes defined. All known weak spots resolved.

**Build order:**
1. macOS menu bar app + WebSocket bridge server
2. Plugin scaffold — tab shell, offline/connected indicator
3. Flow 5 (token snapshot) + Style Inspector tab — file-wide drift view
4. Style Inspector push actions (Flow 2 integration)
5. Settings page + plugin data read/write
6. Component mapping setup + Inspector tab (Flow 1)
7. Remaining flows in priority order
