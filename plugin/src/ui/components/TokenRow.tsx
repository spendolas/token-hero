/**
 * TokenRow — single row showing status dot, name, and values.
 */

import type { DiffedToken } from '@shared/styleTypes';

interface TokenRowProps {
  token: DiffedToken;
  expanded: boolean;
  onToggle: () => void;
}

const DOT_CLASS: Record<string, string> = {
  clean: 'dot-clean',
  drifted_amber: 'dot-amber',
  drifted_red: 'dot-red',
  unmapped: 'dot-outline',
  orphaned: 'dot-outline',
  unknown: 'dot-outline',
  internal: 'dot-dim',
};

export function TokenRow({ token, expanded, onToggle }: TokenRowProps) {
  const dotCls = DOT_CLASS[token.status] ?? 'dot-outline';
  const separator = token.status === 'drifted_amber' || token.status === 'drifted_red' ? '\u2260' : '';
  const codeDisplay = token.codeDisplayValue ?? '\u2014';

  return (
    <button className={`token-row ${expanded ? 'token-row-expanded' : ''}`} onClick={onToggle}>
      <span className={`token-dot ${dotCls}`} />
      <span className="token-name" title={token.name}>{token.name}</span>
      <span className="token-value token-value-figma" title={token.figmaDisplayValue}>{token.figmaDisplayValue}</span>
      {separator && <span className="token-separator">{separator}</span>}
      <span className="token-value token-value-code" title={codeDisplay}>{codeDisplay}</span>
    </button>
  );
}
