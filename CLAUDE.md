# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Token Hero

A Figma plugin + macOS menu bar app that bridges design tokens in Figma with their usage in code. It detects unbound properties in Figma and drift between Figma token values and code values, then proposes and applies fixes.

**Project status:** M1 complete. Plugin scaffold running in Figma, macOS bridge app compiles. `docs/CONTEXT.md` is the authoritative architecture spec (~2800 lines). `docs/token-hero-deep-features.md` covers feature prioritization.

## Repository Structure

- `plugin/` — Figma plugin (TypeScript + React, built with esbuild)
- `macos/` — macOS menu bar app (Swift 6 + SwiftUI, SPM + WebSocketKit)
- `docs/` — Architecture spec and feature documentation
- `plugin/src/shared/protocol.ts` — Canonical bridge protocol type definitions

## Build Commands

### Figma Plugin
```bash
cd plugin && npm install && npm run build    # one-shot build
cd plugin && npm run dev                      # watch mode
cd plugin && npm run lint                     # ESLint
```

### macOS Bridge App
```bash
cd macos && swift build                       # debug build
cd macos && swift build -c release            # release build
cd macos && bash bundle.sh                    # build + assemble .app bundle
cd macos && swift test                        # run tests
```
The `.app` bundle is output to `macos/dist/Token Hero.app`. esbuild target for plugin is `es2015` (Figma sandbox limitation).

## Two-Part Architecture

### Figma Plugin
- Runs in a sandboxed iframe (no filesystem, no process spawning)
- Uses Figma Plugin API only — no REST API calls
- React + TypeScript (standard Figma plugin stack)
- Four tabs: Styles (file-wide token monitor), Inspector (component bindings), Audit (divergence findings), Settings
- Two operating modes: **offline** (read-only inspection, cached findings) and **connected** (full read/write via bridge)

### macOS Menu Bar App (the "bridge")
- Native Swift/SwiftUI, `MenuBarExtra` API (macOS 13+)
- No dock icon (`LSUIElement = true`)
- Owns the WebSocket server (default port 7799)
- Executes shell commands (`generateCommand`, `auditCommand`) on behalf of the plugin
- Manages multiple project roots via `~/Library/Application Support/TokenHero/projects.json`
- Deep link scheme: `tokenhero://`

## Bridge Protocol

WebSocket at `ws://localhost:<port>`. Five message flows over a JSON envelope (`{ id, protocolVersion, type, payload, timestamp }`):

1. **GET_COMPONENT_PROPERTIES** — query resolved property values for a component (audit script → bridge → plugin → bridge → caller)
2. **APPLY_PATCH** — RFC 6902 JSON patch to source files + post-patch command execution (plugin → bridge)
3. **AUDIT_RESULTS** — push audit findings from bridge to plugin (bridge → plugin, push-only)
4. **RUN_SCOPED_AUDIT** — run component-specific audit (plugin → bridge, results via Flow 3)
5. **GET_TOKEN_SNAPSHOT** — read all token values from source file for Style Inspector diffing

Handshake: `HELLO` (plugin → bridge) → `HELLO_ACK` (bridge → plugin) → optional `REGISTER_MAPPING` (bridge → plugin).

## Key Design Decisions

- **Plugin API, not REST API** — no auth, no rate limits, live in-memory access
- **WebSocket over HTTP** — bidirectional channel needed for audit result push
- **Never write to generated files** — source file patches only; generated files are overwritten by `generateCommand`
- **Component mapping on the node** — stored via `setPluginData`, survives renames, travels with the file
- **Two storage tiers** — `setPluginData` (shared with team via .fig file) vs `clientStorage` (machine-local)
- **Config file is source of truth** — `token-hero.config.json` (committed to repo) → synced to `setPluginData` on connect

## Configuration

**`token-hero.config.json`** (project root, committed):
- `pipeline.type`: `json-source` | `style-dictionary` | `tokens-studio` | `custom`
- `pipeline.sourceFile`: relative path to token source
- `pipeline.generateCommand`: e.g. `npm run tokens`
- `pipeline.auditCommand`: optional, e.g. `npm run audit:visual`
- `pipeline.contactSheetUrl`: optional, enables contact sheet awareness
- `pipeline.generated`: paths that must not be patched
- `pipeline.groupMap`: maps Figma collection names to token group names
- `componentMap`: Figma component → code component mappings
- `timeouts`: `componentQuery` (10s default), `scopedAudit` (30s default)

## Plugin Data Model (Three Tiers)

| API | Key | Scope | Shared |
|---|---|---|---|
| `figma.root.setPluginData` | `"config"` | File-level pipeline config | Yes |
| `figma.root.setPluginData` | `"styleTimestamps"` | Per-token push timestamps | Yes |
| `figma.root.setPluginData` | `"excludedTokens"` | Internal/excluded token list | Yes |
| `figma.root.setSharedPluginData` | `"fileKey"` | Cross-plugin file identification | Yes |
| `componentNode.setPluginData` | `"mapping"` | Per-component code mapping | Yes |
| `componentNode.setPluginData` | `"auditFindings"` | Per-component audit results | Yes |
| `figma.clientStorage` | `"uiPreferences"` | UI state (tab, compact mode) | No |

## Feature Build Order

1. macOS app + bridge server (prerequisite)
2. Plugin scaffold — tab shell, offline/connected status pill
3. Flow 5 — token snapshot
4. Style Inspector tab — Figma read + diff display
5. Style Inspector — push to code (Flow 2)
6. Flow 1 — audit script data source
7. Inspector tab — component binding checklist
8. Flow 2 + 3 — batch bind from audit results
9. Audit tab — divergence highlighting
10. Contact sheet awareness + Flow 4 test harness

## Reference Implementation

Built against **Sombra** design system (`json-source` pipeline type). Sombra's token source is `tokens/sombra.ds.json`, with `npm run tokens` generating CSS custom properties, Tailwind aliases, and component class strings. 22 components to audit.

## Divergence Types

| Type | Meaning |
|---|---|
| `CASCADE_LOSS` | Token bound in Figma but overridden in CSS cascade |
| `WRONG_TOKEN` | Layer bound to wrong variable |
| `TOKEN_MISSING` | Layer has raw value, no variable bound |
| `NOT_APPLIED` | Token correct but hardcoded override blocks it in code |
| `UNRECORDED_VARIANT_DELTA` | Valid token but `variants` block doesn't record it |
| `REMOVED_NESTED` | Component in `nested[]` but absent from variant layer tree |
