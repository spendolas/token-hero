/**
 * InspectorTab — component binding checklist.
 *
 * Shows layer-by-layer property bindings for the selected component.
 * Auto-scans on selection change, manual Re-scan for in-session updates.
 */

import { useEffect, useState, useCallback } from 'react';
import { usePlugin } from '../state/PluginContext';
import type { Layer, LayerProperty } from '@shared/protocol';

export function InspectorTab() {
  const { state, dispatch, scanComponent } = usePlugin();
  const selection = state.selection;

  // ── Auto-scan on selection change ──────────────────────────
  useEffect(function () {
    if (selection.nodeIds.length === 1) {
      const nodeType = selection.nodeTypes[0];
      if (nodeType === 'COMPONENT' || nodeType === 'COMPONENT_SET') {
        scanComponent(selection.nodeIds[0]);
        return;
      }
    }
    dispatch({ type: 'CLEAR_INSPECTOR' });
  }, [selection, scanComponent, dispatch]);

  // ── Re-scan handler ────────────────────────────────────────
  const handleRescan = useCallback(function () {
    if (selection.nodeIds.length === 1) {
      scanComponent(selection.nodeIds[0]);
    }
  }, [selection, scanComponent]);

  // ── Empty states ───────────────────────────────────────────
  if (!state.inspectorData && !state.inspectorLoading && !state.inspectorError) {
    return renderEmptyState(selection);
  }

  // ── Loading ────────────────────────────────────────────────
  if (state.inspectorLoading) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-text">Scanning component\u2026</span>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────
  if (state.inspectorError) {
    return (
      <div className="inspector-empty">
        <span className="inspector-empty-text">{state.inspectorError}</span>
        <button className="btn-secondary" onClick={handleRescan} style={{ marginTop: 8 }}>
          Retry
        </button>
      </div>
    );
  }

  // ── Content ────────────────────────────────────────────────
  const data = state.inspectorData;
  if (!data) return null;

  // Parse mapping JSON if available
  let mappingLabel = 'No mapping';
  if (state.inspectorMapping) {
    try {
      const mapping = JSON.parse(state.inspectorMapping);
      mappingLabel = mapping.jsonKey || 'Mapped';
      if (mapping.sourcePath) {
        mappingLabel = mappingLabel + ' \u2192 ' + mapping.sourcePath;
      }
    } catch (e) {
      mappingLabel = 'Mapped';
    }
  }

  // Decide which layers to render
  const layerSections: Array<{ label: string; layers: Layer[] }> = [];

  if (data.isComponentSet && data.variants) {
    const variantKeys = Object.keys(data.variants).sort();
    for (let i = 0; i < variantKeys.length; i++) {
      const key = variantKeys[i];
      layerSections.push({
        label: key,
        layers: data.variants[key].layers,
      });
    }
  } else if (data.layers) {
    layerSections.push({ label: '', layers: data.layers });
  }

  // Count totals
  let totalBound = 0;
  let totalUnbound = 0;
  for (let s = 0; s < layerSections.length; s++) {
    const sectionLayers = layerSections[s].layers;
    for (let l = 0; l < sectionLayers.length; l++) {
      const props = sectionLayers[l].properties;
      const propKeys = Object.keys(props);
      for (let p = 0; p < propKeys.length; p++) {
        if (props[propKeys[p]].isBound) {
          totalBound++;
        } else {
          totalUnbound++;
        }
      }
    }
  }

  return (
    <div className="inspector-tab">
      {/* Header */}
      <div className="inspector-header">
        <span className="inspector-component-name">{data.componentName}</span>
        <button className="btn-secondary inspector-rescan" onClick={handleRescan}>
          Re-scan
        </button>
      </div>

      {/* Mapping bar */}
      <div className="inspector-mapping-bar">{mappingLabel}</div>

      {/* Variant child note */}
      {state.inspectorIsVariantChild && state.inspectorParentSetName && (
        <div className="inspector-variant-note">
          Mapping is on the parent set: {state.inspectorParentSetName}
        </div>
      )}

      {/* Summary */}
      <div className="inspector-summary">
        <span className="inspector-badge-bound">{'\u2705'} {totalBound} bound</span>
        {totalUnbound > 0 && (
          <span className="inspector-badge-unbound">{'\u25CB'} {totalUnbound} unbound</span>
        )}
      </div>

      {/* Layer sections */}
      {layerSections.map(function (section, si) {
        return (
          <div key={si}>
            {section.label && (
              <div className="inspector-variant-header">{section.label}</div>
            )}
            {section.layers.map(function (layer) {
              return <LayerSection key={layer.layerId} layer={layer} />;
            })}
            {section.layers.length === 0 && (
              <div className="inspector-empty-text" style={{ padding: '8px 0', opacity: 0.4 }}>
                No properties found
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── LayerSection ──────────────────────────────────────────────

function LayerSection({ layer }: { layer: Layer }) {
  const _expanded = useState(true);
  const expanded = _expanded[0];
  const setExpanded = _expanded[1];

  const propKeys = Object.keys(layer.properties);
  let boundCount = 0;
  for (let i = 0; i < propKeys.length; i++) {
    if (layer.properties[propKeys[i]].isBound) boundCount++;
  }

  return (
    <div className="inspector-layer">
      <button
        className="inspector-layer-header"
        onClick={function () { setExpanded(!expanded); }}
      >
        <span className="inspector-layer-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
        <span className="inspector-layer-name">{layer.layerName}</span>
        <span className="inspector-layer-count">
          {boundCount}/{propKeys.length}
        </span>
      </button>
      {expanded && (
        <div className="inspector-layer-body">
          {propKeys.map(function (propName) {
            return (
              <PropertyRow
                key={propName}
                name={propName}
                prop={layer.properties[propName]}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PropertyRow ───────────────────────────────────────────────

function PropertyRow({ name, prop }: { name: string; prop: LayerProperty }) {
  const valueStr = typeof prop.value === 'number'
    ? String(prop.value)
    : String(prop.value || '');

  return (
    <div className="inspector-prop-row">
      <span className="inspector-prop-name">{name}</span>
      <span className="inspector-prop-value" title={valueStr}>{valueStr}</span>
      {prop.isBound ? (
        <span className="inspector-badge-bound" title={prop.tokenId || ''}>
          {'\u2705'} {prop.tokenName}
        </span>
      ) : (
        <span className="inspector-badge-unbound">{'\u25CB'} unbound</span>
      )}
    </div>
  );
}

// ── Empty state helper ────────────────────────────────────────

function renderEmptyState(selection: { nodeIds: string[]; nodeNames: string[]; nodeTypes: string[] }) {
  let message = 'Select a component to inspect bindings.';

  if (selection.nodeIds.length === 0) {
    message = 'Select a component to inspect bindings.';
  } else if (selection.nodeIds.length > 1) {
    message = 'Select a single component to inspect.';
  } else {
    const nodeType = selection.nodeTypes[0];
    if (nodeType === 'INSTANCE') {
      message = 'This is an instance. Select the main component to inspect bindings.';
    } else {
      message = 'Not a component \u2014 select a Component or Component Set.';
    }
  }

  return (
    <div className="inspector-empty">
      <span className="inspector-empty-text">{message}</span>
    </div>
  );
}
