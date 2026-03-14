/**
 * AuditTab — divergence findings from audit results.
 *
 * Displays findings grouped by divergence type with Fix/Fix All buttons.
 * Findings arrive via Flow 3 (AUDIT_RESULTS) from the bridge.
 */

import { useState, useCallback } from 'react';
import { usePlugin } from '../state/PluginContext';
import type { AuditFinding, DivergenceType } from '@shared/protocol';

const TYPE_LABELS: Record<DivergenceType, string> = {
  CASCADE_LOSS: 'Cascade Loss',
  WRONG_TOKEN: 'Wrong Token',
  TOKEN_MISSING: 'Token Missing',
  NOT_APPLIED: 'Not Applied',
  UNRECORDED_VARIANT_DELTA: 'Unrecorded Variant',
  REMOVED_NESTED: 'Removed Nested',
};

const TYPE_ORDER: DivergenceType[] = [
  'CASCADE_LOSS',
  'WRONG_TOKEN',
  'TOKEN_MISSING',
  'NOT_APPLIED',
  'UNRECORDED_VARIANT_DELTA',
  'REMOVED_NESTED',
];

export function AuditTab() {
  const { state, executeFix, executeFixAll, runAudit } = usePlugin();
  const findings = state.auditFindings;
  const isConnected = state.connectionStatus === 'connected';
  const hasAuditCommand = !!(state.config && state.config.pipeline && state.config.pipeline.auditCommand);

  // ── Empty state ──────────────────────────────────────────
  if (findings.length === 0) {
    return (
      <div className="audit-empty">
        <span className="audit-empty-text">
          {!isConnected
            ? 'Connect to bridge app to run audits.'
            : !hasAuditCommand
              ? 'No audit command configured. Set one in Settings.'
              : 'No audit findings yet.'}
        </span>
        {isConnected && hasAuditCommand && (
          <button className="btn-primary audit-run-btn" onClick={runAudit} style={{ marginTop: 8 }}>
            Run Audit
          </button>
        )}
      </div>
    );
  }

  // ── Group findings by type ───────────────────────────────
  const grouped: Record<string, AuditFinding[]> = {};
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (!grouped[f.divergenceType]) {
      grouped[f.divergenceType] = [];
    }
    grouped[f.divergenceType].push(f);
  }

  // Only show types that have findings, in canonical order
  const activeTypes: DivergenceType[] = [];
  for (let i = 0; i < TYPE_ORDER.length; i++) {
    if (grouped[TYPE_ORDER[i]]) {
      activeTypes.push(TYPE_ORDER[i]);
    }
  }

  // Count fixable
  let totalFixable = 0;
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].suggestedFix) totalFixable++;
  }

  return (
    <div className="audit-tab">
      {/* Summary */}
      <div className="audit-summary">
        <span className="audit-summary-count">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
        {totalFixable > 0 && (
          <span className="audit-summary-fixable">{totalFixable} fixable</span>
        )}
        {state.auditGeneratedAt && (
          <span className="audit-summary-time">
            {formatTime(state.auditGeneratedAt)}
          </span>
        )}
        {isConnected && hasAuditCommand && (
          <button className="btn-secondary audit-rerun-btn" onClick={runAudit}>
            Re-run
          </button>
        )}
      </div>

      {/* Error banner */}
      {state.auditError && (
        <div className="audit-error">{state.auditError}</div>
      )}

      {/* Type sections */}
      {activeTypes.map(function (dtype) {
        return (
          <TypeSection
            key={dtype}
            divergenceType={dtype}
            findings={grouped[dtype]}
            fixInFlight={state.auditFixInFlight}
            onFix={executeFix}
            onFixAll={executeFixAll}
          />
        );
      })}
    </div>
  );
}

// ── TypeSection ──────────────────────────────────────────────

function TypeSection(props: {
  divergenceType: DivergenceType;
  findings: AuditFinding[];
  fixInFlight: string | null;
  onFix: (finding: AuditFinding) => void;
  onFixAll: (type: DivergenceType) => void;
}) {
  const _expanded = useState(false);
  const expanded = _expanded[0];
  const setExpanded = _expanded[1];

  const fixableCount = props.findings.filter(function (f) { return !!f.suggestedFix; }).length;

  const handleFixAll = useCallback(function () {
    props.onFixAll(props.divergenceType);
  }, [props.onFixAll, props.divergenceType]);

  return (
    <div className="audit-type-section">
      <div className="audit-type-header">
        <button
          className="audit-type-toggle"
          onClick={function () { setExpanded(!expanded); }}
        >
          <span className="audit-type-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
          <span className="audit-type-label">{TYPE_LABELS[props.divergenceType]}</span>
          <span className="audit-type-count">({props.findings.length})</span>
        </button>
        {fixableCount > 0 && (
          <button
            className="btn-secondary audit-fix-all-btn"
            onClick={handleFixAll}
            disabled={!!props.fixInFlight}
          >
            Fix all ({fixableCount})
          </button>
        )}
      </div>
      {expanded && (
        <div className="audit-type-body">
          {props.findings.map(function (finding, idx) {
            return (
              <FindingRow
                key={finding.layerId + ':' + finding.divergenceType + ':' + idx}
                finding={finding}
                fixInFlight={props.fixInFlight}
                onFix={props.onFix}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── FindingRow ───────────────────────────────────────────────

function FindingRow(props: {
  finding: AuditFinding;
  fixInFlight: string | null;
  onFix: (finding: AuditFinding) => void;
}) {
  const f = props.finding;
  const key = f.layerId + ':' + f.divergenceType;
  const isFixing = props.fixInFlight === key;

  const handleFix = useCallback(function () {
    props.onFix(f);
  }, [props.onFix, f]);

  return (
    <div className="audit-finding-row">
      <div className="audit-finding-info">
        <span className="audit-finding-component">{f.componentName}</span>
        <span className="audit-finding-layer">{f.layerName}</span>
      </div>
      <div className="audit-finding-values">
        {f.expectedToken && (
          <span className="audit-finding-expected" title={'Expected: ' + f.expectedToken}>
            {f.expectedToken}
          </span>
        )}
        {f.actualToken && (
          <span className="audit-finding-actual" title={'Actual: ' + f.actualToken}>
            {'\u2192'} {f.actualToken}
          </span>
        )}
        {!f.expectedToken && !f.actualToken && (
          <span className="audit-finding-value" title={String(f.figmaValue)}>
            {String(f.figmaValue)}
          </span>
        )}
      </div>
      <div className="audit-finding-action">
        {f.suggestedFix ? (
          <button
            className="btn-secondary audit-fix-btn"
            onClick={handleFix}
            disabled={isFixing || !!props.fixInFlight}
          >
            {isFixing ? '\u2026' : 'Fix'}
          </button>
        ) : (
          <span className="audit-finding-manual">manual</span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = d.getHours();
  const m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
