/**
 * SectionGroup — collapsible section header with badge counts and push button.
 */

import type { ReactNode } from 'react';
import type { SectionSummary } from '@shared/styleTypes';

interface SectionGroupProps {
  section: SectionSummary;
  expanded: boolean;
  onToggle: () => void;
  hasCodeData: boolean;
  onPushAllDrifted?: () => void;
  pushDisabled?: boolean;
  children: ReactNode;
}

function badgeText(section: SectionSummary, hasCodeData: boolean): string {
  const parts: string[] = [`${section.total} styles`];
  if (!hasCodeData) {
    parts.push('no code data');
  } else {
    if (section.driftedCount > 0) parts.push(`${section.driftedCount} drifted`);
    if (section.unmappedCount > 0) parts.push(`${section.unmappedCount} unmapped`);
    if (section.orphanedCount > 0) parts.push(`${section.orphanedCount} orphaned`);
  }
  return parts.join(' \u00B7 ');
}

export function SectionGroup({ section, expanded, onToggle, hasCodeData, onPushAllDrifted, pushDisabled, children }: SectionGroupProps) {
  if (section.total === 0) return null;

  return (
    <div className="section-group">
      <div className="section-header-row">
        <button className="section-header" onClick={onToggle}>
          <span className="section-chevron">{expanded ? '\u25BE' : '\u25B8'}</span>
          <span className="section-label">{section.label}</span>
          <span className="section-badge">{badgeText(section, hasCodeData)}</span>
        </button>
        {hasCodeData && section.driftedCount > 0 && onPushAllDrifted && (
          <button
            className="btn-push-section"
            disabled={pushDisabled}
            onClick={(e) => { e.stopPropagation(); onPushAllDrifted(); }}
          >
            Push {section.driftedCount} drifted
          </button>
        )}
      </div>
      {expanded && <div className="section-body">{children}</div>}
    </div>
  );
}
