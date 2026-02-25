// Dashboard view: status counts, phase progress, and track breakdown.
// Excludes done/archived items by default; toggle checkbox to include done.

import { useState, useMemo } from 'react';
import type { WQItem, WQSettings } from '../../models/WQItem';
import type { WorklistSummary } from '../types';
import type { ListFilter } from '../App';

interface Props {
  items: WQItem[];
  worklists: WorklistSummary[];
  settings: WQSettings;
  onItemClick: (item: WQItem) => void;
  onSwitchToList: (filter: ListFilter) => void;
}

export default function Dashboard({ items, worklists, settings, onItemClick, onSwitchToList }: Props) {
  // Derive ordered arrays from settings (archive excluded from status cards)
  const statusOrder = settings.statuses.filter(s => s.id !== 'archive').map(s => s.id);
  const phaseOrder = settings.phases.map(p => p.id);
  const trackOrder = settings.tracks.map(t => t.id);
  const statusLabels = Object.fromEntries(settings.statuses.map(s => [s.id, s.label]));
  const phaseLabels = Object.fromEntries(settings.phases.map(p => [p.id, p.label]));
  const trackLabels = Object.fromEntries(settings.tracks.map(t => [t.id, t.label]));
  const [includeDone, setIncludeDone] = useState(false);

  const stats = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const phaseCounts: Record<string, number> = {};
    const trackCounts: Record<string, number> = {};

    // Always count status cards from non-archived items (done card always visible)
    const nonArchived = items.filter(i => i.status !== 'archive');
    for (const item of nonArchived) {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }

    // Phase/track counts exclude done unless toggled
    const counted = nonArchived.filter(i => includeDone || i.status !== 'done');
    for (const item of counted) {
      phaseCounts[item.phase] = (phaseCounts[item.phase] || 0) + 1;
      trackCounts[item.track] = (trackCounts[item.track] || 0) + 1;
    }

    // Worklist aggregate
    let wlCompleted = 0;
    let wlTotal = 0;
    for (const wl of worklists) {
      wlCompleted += wl.completed;
      wlTotal += wl.total;
    }

    return { statusCounts, phaseCounts, trackCounts, total: counted.length, wlCompleted, wlTotal };
  }, [items, worklists, includeDone]);

  const maxTrack = Math.max(...trackOrder.map(t => stats.trackCounts[t] || 0), 1);

  return (
    <div className="dashboard">
      {/* Status cards */}
      <div className="stats-grid">
        {statusOrder.map(status => (
          <div key={status} className="stat-card" onClick={() => onSwitchToList({ status })}>
            <div className="stat-value" style={{ color: `var(--wq-status-${status})` }}>
              {stats.statusCounts[status] || 0}
            </div>
            <div className="stat-label">{statusLabels[status] || status}</div>
          </div>
        ))}
        <div className="stat-card" onClick={() => onSwitchToList({})}>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      {/* Include done toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginBottom: 16, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={includeDone}
          onChange={e => setIncludeDone(e.target.checked)}
        />
        Include done items in phase/track counts
      </label>

      {/* Worklist progress */}
      {stats.wlTotal > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-title">Worklist Progress</div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.round((stats.wlCompleted / stats.wlTotal) * 100)}%`,
                background: 'var(--wq-status-done)',
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>
            {stats.wlCompleted} / {stats.wlTotal} tasks ({Math.round((stats.wlCompleted / stats.wlTotal) * 100)}%)
          </div>
        </div>
      )}

      {/* Phase breakdown */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-title">By Phase</div>
        {phaseOrder.map(phase => {
          const count = stats.phaseCounts[phase] || 0;
          const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          return (
            <div
              key={phase}
              className="breakdown-row"
              style={{ cursor: 'pointer' }}
              onClick={() => onSwitchToList({ phase })}
            >
              <div className="breakdown-label">{phaseLabels[phase] || phase}</div>
              <div className="breakdown-bar">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${pct}%`, background: `var(--wq-phase-${phase})` }}
                  />
                </div>
              </div>
              <div className="breakdown-count">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Track breakdown */}
      <div>
        <div className="section-title">By Track</div>
        {trackOrder.map(track => {
          const count = stats.trackCounts[track] || 0;
          const pct = maxTrack > 0 ? Math.round((count / maxTrack) * 100) : 0;
          return (
            <div
              key={track}
              className="breakdown-row"
              style={{ cursor: 'pointer' }}
              onClick={() => onSwitchToList({ track })}
            >
              <div className="breakdown-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`track-dot track-dot-${track}`} />
                {trackLabels[track] || track}
              </div>
              <div className="breakdown-bar">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${pct}%`, background: `var(--wq-track-${track})` }}
                  />
                </div>
              </div>
              <div className="breakdown-count">{count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
