# Token Hero

A Figma plugin + macOS menu bar app that bridges design tokens in Figma with their usage in code. Detects unbound properties and drift between Figma token values and code values, then proposes and applies fixes.

## Architecture

Token Hero is a two-part system:

**Figma Plugin** (TypeScript + React) — runs in Figma's sandboxed iframe. Reads `node.boundVariables`, walks layer hierarchy, surfaces unbound and mismatched properties. Four tabs: Styles (file-wide token monitor), Inspector (component bindings), Audit (divergence findings), Settings.

**macOS Menu Bar App** (Swift + SwiftUI) — the "bridge." Native menu bar app with no dock icon. Owns the WebSocket server, executes shell commands (`generateCommand`, `auditCommand`) on behalf of the plugin, manages multiple project roots. Communicates with the plugin over five bidirectional WebSocket message flows.

## Structure

```
plugin/     Figma plugin source (TypeScript + React, esbuild)
macos/      macOS menu bar app (Swift + SwiftUI, Xcode)
docs/       Architecture spec and feature documentation
.github/    CI workflows
```

## How it works

1. The macOS app runs a WebSocket server on `localhost` (default port 7799)
2. The Figma plugin connects and performs a HELLO/HELLO_ACK handshake
3. The plugin reads live Figma styles/variables and compares them against a snapshot of the token source file (read by the bridge)
4. Drifted values can be pushed to code via RFC 6902 JSON patches
5. An external audit command can detect visual divergences between Figma and rendered components

The plugin works in **offline mode** (read-only inspection) when the bridge is not running, and **connected mode** (full read/write) when connected.

## Documentation

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — Full architecture specification
- [`docs/token-hero-deep-features.md`](docs/token-hero-deep-features.md) — Feature prioritization and deep-dive requirements

## Status

Pre-implementation. See the [project board](https://github.com/spendolas/token-hero/projects) for current progress.

## License

MIT
