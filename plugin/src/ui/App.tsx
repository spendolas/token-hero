/**
 * App — root component with tab bar, status pill, and content routing.
 */

import { useRef, useEffect } from 'react';
import { usePlugin } from './state/PluginContext';
import { StatusPill } from './components/StatusPill';
import { AuditTab } from './tabs/AuditTab';
import { StylesTab } from './tabs/StylesTab';
import { InspectorTab } from './tabs/InspectorTab';
import { SettingsTab } from './tabs/SettingsTab';
import { send } from './bridge/pluginBridge';
import type { TabId } from './state/types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'styles', label: 'Styles' },
  { id: 'inspector', label: 'Inspector' },
  { id: 'audit', label: 'Audit' },
  { id: 'settings', label: 'Settings' },
];

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;

export function App() {
  const { state, setActiveTab } = usePlugin();
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = appRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
      send('RESIZE', { width: 320, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app" ref={appRef}>
      {/* Version mismatch banner */}
      {state.versionMismatch && (
        <div className="banner banner-warning">
          Plugin and bridge versions don&apos;t match. Please update both to the same version.
        </div>
      )}

      {/* Header */}
      <div className="app-header">
        <div className="tab-row">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${state.activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.id === 'styles' && state.stylesStale && (
                <span className="tab-stale-indicator"> \u21BB</span>
              )}
            </button>
          ))}
        </div>
        <StatusPill />
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {state.activeTab === 'styles' && <StylesTab />}
        {state.activeTab === 'inspector' && <InspectorTab />}
        {state.activeTab === 'audit' && <AuditTab />}
        {state.activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
