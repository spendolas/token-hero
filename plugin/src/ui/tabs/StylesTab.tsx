/**
 * StylesTab — reads Figma styles, diffs against code snapshot, displays results.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { usePlugin } from '../state/PluginContext';
import { diffAll } from '../logic/diffEngine';
import { buildPatchForToken, buildPatchForSection, buildPatchForAll } from '../logic/patchBuilder';
import { FilterBar } from '../components/FilterBar';
import { SectionGroup } from '../components/SectionGroup';
import { TokenRow } from '../components/TokenRow';
import { TokenRowDetail } from '../components/TokenRowDetail';
import type { FilterMode, DiffedToken, SectionSummary } from '@shared/styleTypes';

function isVisible(token: DiffedToken, filter: FilterMode): boolean {
  if (token.status === 'internal') return false;
  switch (filter) {
    case 'all': return true;
    case 'drifted': return token.status === 'drifted_amber' || token.status === 'drifted_red';
    case 'clean': return token.status === 'clean';
    case 'unmapped': return token.status === 'unmapped' || token.status === 'orphaned';
    default: return true;
  }
}

function hasActionableItems(section: SectionSummary): boolean {
  return section.driftedCount > 0 || section.unmappedCount > 0 || section.orphanedCount > 0;
}

export function StylesTab() {
  const { state, refreshStyles, pushToCode } = usePlugin();
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());
  const [initDone, setInitDone] = useState(false);

  const connected = state.connectionStatus === 'connected';

  // Fetch on mount
  useEffect(() => {
    refreshStyles();
    setInitDone(true);
  }, [refreshStyles]);

  // Auto-refresh when styles become stale (e.g. Figma style edited)
  useEffect(() => {
    if (state.stylesStale) {
      refreshStyles();
    }
  }, [state.stylesStale, refreshStyles]);

  const sections = useMemo(() => {
    if (!state.figmaStyles) return [];
    return diffAll(
      state.figmaStyles,
      state.codeSnapshot,
      state.excludedTokens,
      state.styleTimestamps,
      state.configWrittenAt,
    );
  }, [state.figmaStyles, state.codeSnapshot, state.excludedTokens, state.styleTimestamps, state.configWrittenAt]);

  // Push status lookup
  const pushStatusByToken = useMemo(() => {
    const map: Record<string, { status: 'pending' | 'in_flight' | 'success' | 'error'; error?: string }> = {};
    for (const item of state.pushQueue) {
      for (const name of item.tokenNames) {
        map[name] = { status: item.status, error: item.error };
      }
    }
    return map;
  }, [state.pushQueue]);

  // Auto-expand sections with actionable items on first load
  const hasSections = sections.length > 0;
  useEffect(() => {
    if (!initDone || !hasSections) return;
    const autoExpand = new Set<string>();
    for (const s of sections) {
      if (hasActionableItems(s) || !state.codeSnapshot) {
        autoExpand.add(s.group);
      }
    }
    setExpandedSections(autoExpand);
  }, [initDone, hasSections]); // only run once when sections first arrive

  const toggleSection = useCallback((group: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const toggleToken = useCallback((id: string) => {
    setExpandedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const hasCodeData = state.codeSnapshot !== null;

  const totalDrifted = sections.reduce((sum, s) => sum + s.driftedCount, 0);

  const handlePushToken = useCallback((token: DiffedToken) => {
    if (!state.figmaStyles || !state.config) return;
    const payload = buildPatchForToken(token, state.figmaStyles, state.config);
    if (payload) pushToCode(payload, [token.name]);
  }, [state.figmaStyles, state.config, pushToCode]);

  const handlePushSection = useCallback((section: SectionSummary) => {
    if (!state.figmaStyles || !state.config) return;
    const payload = buildPatchForSection(section.tokens, state.figmaStyles, state.config);
    if (payload) {
      const names = section.tokens
        .filter((t) => t.status === 'drifted_amber' || t.status === 'drifted_red')
        .map((t) => t.name);
      pushToCode(payload, names);
    }
  }, [state.figmaStyles, state.config, pushToCode]);

  const handlePushAll = useCallback(() => {
    if (!state.figmaStyles || !state.config) return;
    const payload = buildPatchForAll(sections, state.figmaStyles, state.config);
    if (payload) {
      const names: string[] = [];
      for (const s of sections) {
        for (const t of s.tokens) {
          if (t.status === 'drifted_amber' || t.status === 'drifted_red') names.push(t.name);
        }
      }
      pushToCode(payload, names);
    }
  }, [sections, state.figmaStyles, state.config, pushToCode]);

  if (!state.figmaStyles) {
    return (
      <div className="styles-tab styles-loading">
        Loading styles...
      </div>
    );
  }

  return (
    <div className="styles-tab">
      <FilterBar
        current={filterMode}
        onChange={setFilterMode}
      />

      {connected && totalDrifted > 0 && (
        <div className="push-all-bar">
          <button
            className="btn-push-section"
            disabled={state.pushInFlight}
            onClick={handlePushAll}
          >
            Push all {totalDrifted} drifted
          </button>
        </div>
      )}

      {sections.map((section) => {
        const visibleTokens = section.tokens.filter((t) => isVisible(t, filterMode));
        if (visibleTokens.length === 0 && filterMode !== 'all') return null;

        return (
          <SectionGroup
            key={section.group}
            section={section}
            expanded={expandedSections.has(section.group)}
            onToggle={() => toggleSection(section.group)}
            hasCodeData={hasCodeData}
            onPushAllDrifted={() => handlePushSection(section)}
            pushDisabled={!connected || state.pushInFlight}
          >
            {visibleTokens.map((token) => {
              const ps = pushStatusByToken[token.name];
              return (
                <div key={token.id}>
                  <TokenRow
                    token={token}
                    expanded={expandedTokens.has(token.id)}
                    onToggle={() => toggleToken(token.id)}
                  />
                  {expandedTokens.has(token.id) && (
                    <TokenRowDetail
                      token={token}
                      onPush={() => handlePushToken(token)}
                      pushStatus={ps?.status}
                      pushError={ps?.error}
                      connected={connected}
                    />
                  )}
                </div>
              );
            })}
          </SectionGroup>
        );
      })}
    </div>
  );
}
