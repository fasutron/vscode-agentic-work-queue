// Sortable, filterable table view of WQ items.
// Ported from work-queue-viewer/client/src/components/ListView.jsx

import { useState, useMemo, useEffect } from 'react';
import type { WQItem, WQSettings } from '../../models/WQItem';
import type { ListFilter } from '../App';
import { postToExtension } from '../hooks/useExtensionState';

interface Props {
  items: WQItem[];
  settings: WQSettings;
  onItemClick: (item: WQItem) => void;
  presetFilter?: ListFilter;
}

type SortField = 'id' | 'title' | 'status' | 'track' | 'phase' | 'priority' | 'effort';
type SortDir = 'asc' | 'desc';

export default function ListView({ items, settings, onItemClick, presetFilter }: Props) {
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState({ status: '', track: '', phase: '', search: '' });
  const [hideDone, setHideDone] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTrack, setNewTrack] = useState('');
  const [newPhase, setNewPhase] = useState('');

  // Apply preset filter from Dashboard when it changes
  useEffect(() => {
    if (presetFilter) {
      setFilters({
        status: presetFilter.status || '',
        track: presetFilter.track || '',
        phase: presetFilter.phase || '',
        search: presetFilter.search || '',
      });
    }
  }, [presetFilter]);

  const statusEntries = settings.statuses;
  const trackEntries = settings.tracks;
  const phaseEntries = settings.phases;

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (hideDone) { result = result.filter(i => i.status !== 'done' && i.status !== 'archive'); }
    if (filters.status) { result = result.filter(i => i.status === filters.status); }
    if (filters.track) { result = result.filter(i => i.track === filters.track); }
    if (filters.phase) { result = result.filter(i => i.phase === filters.phase); }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(i =>
        (i.title ?? '').toLowerCase().includes(q) ||
        (i.id ?? '').toLowerCase().includes(q) ||
        (typeof i.summary === 'string' && i.summary.toLowerCase().includes(q)) ||
        (Array.isArray(i.summary) && i.summary.some(s => s.toLowerCase().includes(q))) ||
        i.tags?.some(t => typeof t === 'string' && t.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let aVal: any = (a as any)[sortField];
      let bVal: any = (b as any)[sortField];
      // Normalize: push undefined/null to the end
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) { return sortDir === 'asc' ? -1 : 1; }
      if (aVal > bVal) { return sortDir === 'asc' ? 1 : -1; }
      return 0;
    });

    return result;
  }, [items, filters, sortField, sortDir, hideDone]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const hasFilters = filters.status || filters.track || filters.phase || filters.search;

  const handleCreate = () => {
    if (!newTitle.trim() || !newTrack || !newPhase) return;
    postToExtension({ type: 'createItem', data: { title: newTitle.trim(), track: newTrack, phase: newPhase } });
    setNewTitle('');
    setNewTrack('');
    setNewPhase('');
    setShowCreate(false);
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="filter-bar">
        <input
          className="filter-input"
          type="text"
          placeholder="Search..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />
        <select
          className="filter-select"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Statuses</option>
          {statusEntries.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select
          className="filter-select"
          value={filters.track}
          onChange={e => setFilters(f => ({ ...f, track: e.target.value }))}
        >
          <option value="">All Tracks</option>
          {trackEntries.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select
          className="filter-select"
          value={filters.phase}
          onChange={e => setFilters(f => ({ ...f, phase: e.target.value }))}
        >
          <option value="">All Phases</option>
          {phaseEntries.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {hasFilters && (
          <button className="clear-btn" onClick={() => setFilters({ status: '', track: '', phase: '', search: '' })}>
            Clear
          </button>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--vscode-descriptionForeground)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
          Hide done
        </label>
        <span className="filter-count">{filteredItems.length} of {items.length}</span>
        <button
          className="create-item-btn"
          onClick={() => setShowCreate(!showCreate)}
          title="Create new item"
        >+ New Item</button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="filter-bar" style={{ gap: 6, paddingTop: 0 }}>
          <input
            className="filter-input"
            type="text"
            placeholder="Title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
            style={{ flex: 2 }}
          />
          <select className="filter-select" value={newTrack} onChange={e => setNewTrack(e.target.value)}>
            <option value="">Track...</option>
            {trackEntries.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select className="filter-select" value={newPhase} onChange={e => setNewPhase(e.target.value)}>
            <option value="">Phase...</option>
            {phaseEntries.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button
            className="clear-btn"
            onClick={handleCreate}
            disabled={!newTitle.trim() || !newTrack || !newPhase}
            title="Create"
          >Create</button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="list-table">
          <thead>
            <tr>
              {(['id', 'title', 'status', 'track', 'phase', 'priority', 'effort'] as SortField[]).map(field => (
                <th key={field} onClick={() => handleSort(field)}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                  {sortField === field && (
                    <span className="sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>
                  )}
                </th>
              ))}
              <th>Docs</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id} className="item-row" onClick={() => onItemClick(item)}>
                <td className="item-id">{item.id}</td>
                <td>
                  <div className="item-title">{item.title}</div>
                  {item.summary && (
                    <div className="item-summary">
                      {typeof item.summary === 'string' ? item.summary : item.summary.join(' ')}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`status-badge status-${item.status}`}>{item.status}</span>
                </td>
                <td>
                  <div className="track-cell">
                    <span className={`track-dot track-dot-${item.track}`} />
                    {item.track}
                  </div>
                </td>
                <td>{item.phase}</td>
                <td>{item.priority}</td>
                <td>{item.effort || '-'}</td>
                <td style={{ color: 'var(--vscode-descriptionForeground)' }}>{item.documents?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredItems.length === 0 && (
          <div className="empty-state">No items match the current filters</div>
        )}
      </div>
    </div>
  );
}
