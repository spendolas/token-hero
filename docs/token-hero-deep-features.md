# Token Hero — Deep Feature Suggestions
*Context: Sombra visual audit system as the forcing function*

---

## Background

The Sombra visual audit system revealed concrete requirements that sharpen Token Hero's 
feature set from theoretical to precise. The contact sheet + visual audit pipeline makes 
Token Hero's role unambiguous: it is the authoritative Figma data source and the 
action layer for closing visual divergences between Figma and code.

---

## 1. Token Hero as the Audit Script's Figma Data Source

**The problem it solves:**
The visual audit script currently juggles three data sources in parallel — REST API for 
node structure, REST API for variable collections, Plugin API cache for resolved values. 
This creates fragility: 403s on variable endpoints, cache staleness, variable ID resolution 
gymnastics, and a hybrid fetch pattern that breaks whenever Figma's plan limits change.

**The suggestion:**
Token Hero exposes a single clean interface: *"give me all resolved property values for 
this component."* The audit script calls Token Hero. Token Hero handles all Figma complexity 
internally via Plugin API — no auth issues, no rate limits, no stale cache.

**Interface contract:**
```typescript
// Token Hero exposes this via its local websocket/HTTP bridge
GET /component/:figmaNodeId/properties

// Returns
{
  nodeId: string,
  componentName: string,
  layers: [
    {
      layerId: string,
      layerName: string,
      properties: {
        fill: { value: "#1a1a2e", tokenId: "surface/elevated", tokenName: "surface-elevated" },
        fontSize: { value: 14, tokenId: "text/body", tokenName: "text-body" },
        paddingLeft: { value: 12, tokenId: "spacing/md", tokenName: "sp-md" },
        // ...
      }
    }
  ]
}
```

**Impact:** Visual audit script becomes ~40% simpler. Cache staleness problem disappears. 
Any future Figma API changes are absorbed by Token Hero, not the audit script.

---

## 2. Contact Sheet Awareness

**The problem it solves:**
Visual comparison between Figma and the live app is currently manual — switch windows, 
find the same component in both, compare. This friction compounds across 29 components × 
multiple states.

**The suggestion:**
Token Hero knows about the DS contact sheet URL and structure. When you select a component 
in Figma, Token Hero shows a "preview in contact sheet" action that:
1. Opens (or focuses) the browser tab at `/ds-preview`
2. Scrolls to and highlights `[data-ds-component="nodeCard"][data-ds-variant="default"]`
3. Keeps both views in sync — select a variant in Token Hero, contact sheet scrolls to it

This makes the visual comparison workflow a single click rather than a manual hunt.

**Implementation note:**
The `data-ds-component` and `data-ds-variant` attributes on every contact sheet element 
are specifically designed for this — they're the stable anchor Token Hero navigates to. 
The contact sheet spec already includes these attributes for exactly this reason.

---

## 3. Divergence Highlighting Directly in Figma

**The problem it solves:**
When the visual audit produces a report with 40 divergences across 12 components, 
acting on it requires cross-referencing the report against the Figma file manually — 
finding the right layer, understanding what's wrong, making the fix. High cognitive load.

**The suggestion:**
Token Hero can receive audit findings and visualize them directly on the Figma canvas:
- `CASCADE_LOSS` — red overlay on the affected layer
- `WRONG_TOKEN` — amber overlay
- `TOKEN_MISSING` — yellow overlay
- `NOT_APPLIED` — blue overlay

Selecting an annotated layer opens Token Hero's panel pre-filtered to that divergence, 
showing exactly what Figma has vs what the browser is rendering, with a one-click fix.

**Data flow:**
```
audit:visual runs → writes report.md + report.json
→ Token Hero CLI receives report.json
→ Token Hero plugin reads it and annotates the canvas
→ Designer clicks annotated layers to fix
```

**Impact:** The audit report becomes actionable inside Figma without context switching. 
Closes the full loop: detect in browser → surface in Figma → fix in Figma → verify in browser.

---

## 4. Batch Bind from Audit Results

**The problem it solves:**
The Sombra binding cleanup required 7 manual passes and an external agent script to apply 
138 bindings. Every binding pass is the same pattern: audit finds unbound property → 
identify correct token → apply binding. This is mechanical work that should be automated.

**The suggestion:**
Token Hero can consume the audit report and execute bindings directly from the plugin 
without any agent pass:

- "Fix all TOKEN_MISSING in Node Templates" → Token Hero applies the correct variable 
  binding to all 23 templates in one operation
- "Fix all WRONG_TOKEN in this component" → Token Hero rebinds each property to its 
  correct token
- "Fix all CASCADE_LOSS" → Token Hero generates the CSS override block and writes it 
  to index.css via the CLI bridge

**Batch operations surface:**
```
Token Hero panel → "Audit findings" tab
├── CASCADE_LOSS (8) [Fix all →]
├── WRONG_TOKEN (12) [Fix all →]  
├── TOKEN_MISSING (24) [Fix all →]
└── NOT_APPLIED (6) [Fix all →]
```

Each "Fix all" previews the changes before applying. Individual fixes available per layer.

**Impact:** Eliminates the binding cleanup pass as a separate workflow entirely. 
What previously required an external audit script + agent pass + manual verification 
becomes a single action inside Figma.

---

## 5. Contact Sheet as Token Hero's Test Harness

**The problem it solves:**
After applying a token change or binding fix in Figma, there's no immediate feedback on 
whether the change propagated correctly to the browser. You have to manually: run 
tokens:sync, reload the app, navigate to the component, visually check. No pass/fail signal.

**The suggestion:**
After any Token Hero action that modifies Figma (binding applied, token value changed, 
new token created):

1. Token Hero CLI automatically triggers tokens:sync
2. Visual audit script runs on just the affected component (not the full DS)
3. Result posted back to Token Hero plugin: ✅ match / ❌ still diverged
4. If still diverged, Token Hero shows the remaining gap inline

**Component-scoped audit command:**
```bash
npm run audit:visual -- --component nodeCard
```
Runs in seconds instead of minutes. Fast enough for an interactive feedback loop.

**Impact:** Token Hero becomes self-verifying. The fix → verify loop that currently 
takes minutes of manual steps collapses to a few seconds of automated feedback. 
Token changes feel immediate and trustworthy.

---

## Implementation Priority

Based on Sombra's current needs, suggested build order:

| Priority | Feature | Why now |
|---|---|---|
| 1 | Audit script data source | Unblocks visual audit from REST/cache fragility |
| 2 | Batch bind from audit results | Eliminates the most painful recurring manual work |
| 3 | Divergence highlighting in Figma | Makes audit reports immediately actionable |
| 4 | Contact sheet awareness | Speeds up visual comparison workflow |
| 5 | Contact sheet as test harness | Closes the full fix → verify loop |

---

## Relationship to Sombra

Token Hero and Sombra share the `sombra.ds.json` contract as their integration point:
- Sombra's visual audit script calls Token Hero's local bridge for Figma data
- Token Hero's batch bind operations write patches to `sombra.ds.json`
- Token Hero's test harness calls Sombra's `audit:visual` script

When Token Hero's JSON patch format stabilises, both projects lock to that contract. 
Changes to `sombra.ds.json` structure go through Token Hero's patch format first.

---

## Status

Concept and architecture defined. 
Deep feature suggestions added based on Sombra visual audit system requirements.
Next step: scaffold the plugin, define JSON patch format, implement local bridge.
