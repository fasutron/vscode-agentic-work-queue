// Root component for the webview. Manages tab navigation, state from extension,
// and the detail panel overlay.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { WQItem } from '../models/WQItem';
import { useExtensionState, postToExtension } from './hooks/useExtensionState';
import Dashboard from './components/Dashboard';
import ListView from './components/ListView';
import DetailPanel from './components/DetailPanel';
import DependencyGraph from './components/DependencyGraph';
import SettingsPanel from './components/SettingsPanel';

/** Error boundary so crashes show an error message instead of grey screen. */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: string },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) { return { error: err.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: 'var(--vscode-errorForeground)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{this.props.fallback || 'Component crashed'}</div>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--vscode-descriptionForeground)' }}>{this.state.error}</pre>
          <button
            style={{ marginTop: 12, padding: '4px 12px', cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

type ViewTab = 'dashboard' | 'list' | 'graph' | 'settings';

/** Preset filters that Dashboard can push to ListView. */
export interface ListFilter {
  status?: string;
  track?: string;
  phase?: string;
  search?: string;
}

export default function App() {
  const { items, worklists, testPlans, settings, worklistDetail, testPlanDetail, loading, toast } = useExtensionState();
  const [activeTab, setActiveTab] = useState<ViewTab>('dashboard');
  const [selectedItem, setSelectedItem] = useState<WQItem | null>(null);
  const [presetFilter, setPresetFilter] = useState<ListFilter>({});
  const [toastPos, setToastPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track last click position for toast anchoring
  useEffect(() => {
    const track = (e: MouseEvent) => setToastPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('click', track);
    return () => window.removeEventListener('click', track);
  }, []);

  const handleSelectItem = useCallback((item: WQItem | { id: string }) => {
    const fresh = items.find(i => i.id === item.id);
    if (fresh) { setSelectedItem(fresh); }
  }, [items]);

  const handleCloseDetail = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const handleSwitchToList = useCallback((filter: ListFilter) => {
    setPresetFilter(filter);
    setActiveTab('list');
  }, []);

  // When data updates, refresh the selected item if it's still open
  const selected = selectedItem
    ? items.find(i => i.id === selectedItem.id) ?? selectedItem
    : null;

  if (loading) {
    return (
      <div className="app">
        <div className="empty-state">Loading work queue data...</div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Tab bar */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          List
        </button>
        <button
          className={`tab-btn ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          Graph
        </button>
        <button
          className="tab-btn"
          onClick={() => postToExtension({ type: 'ready' })}
          style={{ marginLeft: 'auto' }}
          title="Refresh data"
        >
          {'\u21BB'}
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          {'\u2699'} Settings
        </button>
      </div>

      {/* View area — non-scrolling container; content scrolls inside .view-content */}
      <div className="view-area">
        <div className="view-content">
          {activeTab === 'dashboard' && (
            <Dashboard
              items={items}
              worklists={worklists}
              settings={settings}
              onItemClick={handleSelectItem}
              onSwitchToList={handleSwitchToList}
            />
          )}
          {activeTab === 'list' && (
            <ListView
              items={items}
              settings={settings}
              onItemClick={handleSelectItem}
              presetFilter={presetFilter}
            />
          )}
          {activeTab === 'graph' && (
            <ErrorBoundary fallback="Graph failed to render">
              <DependencyGraph
                items={items}
                settings={settings}
                onItemClick={handleSelectItem}
              />
            </ErrorBoundary>
          )}
          {activeTab === 'settings' && (
            <SettingsPanel settings={settings} />
          )}
        </div>

        {/* Detail panel — floats over content, never scrolls with list */}
        {selected && (
          <DetailPanel
            item={selected}
            allItems={items}
            worklists={worklists}
            testPlans={testPlans}
            settings={settings}
            worklistDetail={worklistDetail}
            testPlanDetail={testPlanDetail}
            onClose={handleCloseDetail}
            onNavigateToItem={handleSelectItem}
          />
        )}
      </div>

      {/* Auto-dismissing toast, anchored left of last click */}
      {toast && (
        <div
          className="toast"
          style={{ left: toastPos.x, top: toastPos.y, transform: 'translate(-100%, -50%)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
