/**
 * TokenRowDetail — expanded view with side-by-side values, "Used by" list, and push button.
 */

import { useState, useEffect } from 'react';
import type { DiffedToken } from '@shared/styleTypes';
import type { PushQueueItem } from '../state/types';
import * as pluginBridge from '../bridge/pluginBridge';

interface Consumer {
  nodeId: string;
  nodeName: string;
}

interface TokenRowDetailProps {
  token: DiffedToken;
  onPush?: () => void;
  pushStatus?: PushQueueItem['status'];
  pushError?: string;
  connected: boolean;
}

export function TokenRowDetail({ token, onPush, pushStatus, pushError, connected }: TokenRowDetailProps) {
  const [consumers, setConsumers] = useState<Consumer[] | null>(null);
  const [loading, setLoading] = useState(false);

  const supportsConsumers = token.group === 'textStyles' || token.group === 'effects';
  const isOrphan = token.id.startsWith('orphan:');
  const isDrifted = token.status === 'drifted_amber' || token.status === 'drifted_red';
  const isRed = token.status === 'drifted_red';
  const canPush = connected && isDrifted && onPush && pushStatus !== 'in_flight' && pushStatus !== 'pending';

  useEffect(() => {
    if (!supportsConsumers || isOrphan) return;

    setLoading(true);
    pluginBridge
      .request<{ consumers: Consumer[] }>('GET_STYLE_CONSUMERS', {
        styleId: token.id,
        group: token.group,
      })
      .then((result) => {
        setConsumers(result.consumers);
      })
      .catch(() => {
        setConsumers([]);
      })
      .finally(() => setLoading(false));
  }, [token.id, token.group, supportsConsumers, isOrphan]);

  let pushLabel = 'Push to code';
  if (pushStatus === 'pending') pushLabel = 'Pending...';
  else if (pushStatus === 'in_flight') pushLabel = 'Pushing...';
  else if (isRed) pushLabel = 'Push to code (code is newer)';

  return (
    <div className="token-detail">
      <div className="detail-row">
        <span className="detail-label">Figma</span>
        <span className="detail-value">{token.figmaDisplayValue || '\u2014'}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Code</span>
        <span className="detail-value">{token.codeDisplayValue ?? '\u2014'}</span>
      </div>

      {supportsConsumers && !isOrphan && (
        <div className="detail-row">
          <span className="detail-label">Used by</span>
          <span className="detail-value used-by-list">
            {loading && 'Loading...'}
            {!loading && consumers && consumers.length === 0 && 'No consumers'}
            {!loading && consumers && consumers.length > 0 && (
              <>
                {consumers.slice(0, 2).map((c) => c.nodeName).join(', ')}
                {consumers.length > 2 && ` +${consumers.length - 2} more`}
              </>
            )}
          </span>
        </div>
      )}

      {isDrifted && (
        <>
          <button
            className={`btn-secondary btn-push ${isRed ? 'btn-push-warning' : ''}`}
            disabled={!canPush}
            onClick={onPush}
          >
            {pushLabel}
          </button>
          {pushStatus === 'error' && pushError && (
            <div className="btn-push-status push-error">{pushError}</div>
          )}
          {pushStatus === 'success' && (
            <div className="btn-push-status push-success">Pushed</div>
          )}
        </>
      )}

      {!isDrifted && !isOrphan && token.status !== 'unknown' && token.status !== 'internal' && (
        <button className="btn-secondary btn-push" disabled>
          {token.status === 'unmapped' ? 'No code mapping' : 'In sync'}
        </button>
      )}
    </div>
  );
}
