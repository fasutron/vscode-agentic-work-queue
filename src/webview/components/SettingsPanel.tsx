// Settings panel for configuring statuses, phases, tracks, and transitions.
// Drag-and-drop reorder via @dnd-kit. Each edit persists to work_queue.json.

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WQSettings, WQStatusEntry, WQPhaseEntry, WQTrackEntry } from '../../models/WQItem';
import { postToExtension } from '../hooks/useExtensionState';

interface Props {
  settings: WQSettings;
}

type SettingsSection = 'statuses' | 'phases' | 'tracks';

const FOLDER_OPTIONS: { value: string; hint: string }[] = [
  { value: '1-pending', hint: 'Items waiting to be started' },
  { value: '2-in_progress', hint: 'Items currently being worked on' },
  { value: '3-completed', hint: 'Finished or archived items' },
];

/** Convert a label to a kebab-case ID. */
function toKebabId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Sortable Row Wrapper ─────────────────────────────────────────────────────

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="settings-row">
      <button className="settings-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        {'\u2630'}
      </button>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPanel({ settings }: Props) {
  const [section, setSection] = useState<SettingsSection>('statuses');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = useCallback((updated: WQSettings) => {
    postToExtension({ type: 'saveSettings', data: { settings: updated } });
  }, []);

  // ─── ID Prompt ──────────────────────────────────────────────────────────────

  const promptForId = (type: string, existingIds: string[]): string | null => {
    const label = prompt(`Enter an ID for the new ${type} (lowercase, kebab-case):`);
    if (!label) return null;
    const id = toKebabId(label);
    if (!id) {
      postToExtension({ type: 'showNotification', data: { message: 'Invalid ID — must contain at least one letter or number.', kind: 'error' } });
      return null;
    }
    if (existingIds.includes(id)) {
      postToExtension({ type: 'showNotification', data: { message: `ID "${id}" already exists.`, kind: 'error' } });
      return null;
    }
    return id;
  };

  // ─── Status handlers ────────────────────────────────────────────────────────

  const updateStatus = (id: string, patch: Partial<WQStatusEntry>) => {
    const statuses = settings.statuses.map(s => s.id === id ? { ...s, ...patch } : s);
    save({ ...settings, statuses });
  };

  const addStatus = () => {
    const id = promptForId('status', settings.statuses.map(s => s.id));
    if (!id) return;
    const label = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const entry: WQStatusEntry = { id, label, folder: '1-pending', color: '#888888' };
    save({ ...settings, statuses: [...settings.statuses, entry] });
  };

  const removeStatus = (id: string) => {
    const entry = settings.statuses.find(s => s.id === id);
    if (!entry || entry.system) return;
    const statuses = settings.statuses.filter(s => s.id !== id);
    const transitions = { ...settings.transitions };
    delete transitions[id];
    for (const key of Object.keys(transitions)) {
      transitions[key] = transitions[key].filter(t => t !== id);
    }
    save({ ...settings, statuses, transitions });
  };

  const handleStatusDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = settings.statuses.findIndex(s => s.id === active.id);
    const newIndex = settings.statuses.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    save({ ...settings, statuses: arrayMove(settings.statuses, oldIndex, newIndex) });
  };

  // ─── Phase handlers ─────────────────────────────────────────────────────────

  const updatePhase = (id: string, patch: Partial<WQPhaseEntry>) => {
    const phases = settings.phases.map(p => p.id === id ? { ...p, ...patch } : p);
    save({ ...settings, phases });
  };

  const addPhase = () => {
    const id = promptForId('phase', settings.phases.map(p => p.id));
    if (!id) return;
    const label = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const entry: WQPhaseEntry = { id, label, color: '#888888' };
    save({ ...settings, phases: [...settings.phases, entry] });
  };

  const removePhase = (id: string) => {
    save({ ...settings, phases: settings.phases.filter(p => p.id !== id) });
  };

  const handlePhaseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = settings.phases.findIndex(p => p.id === active.id);
    const newIndex = settings.phases.findIndex(p => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    save({ ...settings, phases: arrayMove(settings.phases, oldIndex, newIndex) });
  };

  // ─── Track handlers ─────────────────────────────────────────────────────────

  const updateTrack = (id: string, patch: Partial<WQTrackEntry>) => {
    const tracks = settings.tracks.map(t => t.id === id ? { ...t, ...patch } : t);
    save({ ...settings, tracks });
  };

  const addTrack = () => {
    const id = promptForId('track', settings.tracks.map(t => t.id));
    if (!id) return;
    const label = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const entry: WQTrackEntry = { id, label, color: '#888888' };
    save({ ...settings, tracks: [...settings.tracks, entry] });
  };

  const removeTrack = (id: string) => {
    save({ ...settings, tracks: settings.tracks.filter(t => t.id !== id) });
  };

  const handleTrackDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = settings.tracks.findIndex(t => t.id === active.id);
    const newIndex = settings.tracks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    save({ ...settings, tracks: arrayMove(settings.tracks, oldIndex, newIndex) });
  };

  // ─── Transition handlers ────────────────────────────────────────────────────

  const toggleTransition = (fromStatus: string, toStatus: string) => {
    const transitions = { ...settings.transitions };
    const current = transitions[fromStatus] || [];
    if (current.includes(toStatus)) {
      transitions[fromStatus] = current.filter(t => t !== toStatus);
    } else {
      transitions[fromStatus] = [...current, toStatus];
    }
    save({ ...settings, transitions });
  };

  return (
    <div className="settings-panel">
      {/* Section tabs */}
      <div className="settings-tabs">
        {(['statuses', 'phases', 'tracks'] as SettingsSection[]).map(s => (
          <button
            key={s}
            className={`settings-tab ${section === s ? 'active' : ''}`}
            onClick={() => setSection(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Statuses ── */}
      {section === 'statuses' && (
        <div className="settings-section">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStatusDragEnd}>
            <SortableContext items={settings.statuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="settings-list">
                {settings.statuses.map(entry => (
                  <SortableRow key={entry.id} id={entry.id}>
                    <input
                      type="color"
                      className="settings-color-input"
                      value={entry.color}
                      onChange={e => updateStatus(entry.id, { color: e.target.value })}
                      title="Status color"
                    />
                    <span className="settings-id" title="Immutable ID stored in work_queue.json">{entry.id}</span>
                    <input
                      type="text"
                      className="settings-label-input"
                      value={entry.label}
                      onChange={e => updateStatus(entry.id, { label: e.target.value })}
                      title="Display label (editable)"
                    />
                    <select
                      className="settings-folder-select"
                      value={entry.folder}
                      onChange={e => updateStatus(entry.id, { folder: e.target.value })}
                      title={FOLDER_OPTIONS.find(f => f.value === entry.folder)?.hint || 'Handoff folder for documents'}
                    >
                      {FOLDER_OPTIONS.map(f => <option key={f.value} value={f.value} title={f.hint}>{f.value}</option>)}
                    </select>
                    {entry.system && <span className="settings-system-badge" title="System-required — cannot be deleted">{'\uD83D\uDD12'}</span>}
                    {!entry.system && <span className="settings-system-spacer" />}
                    <button
                      className="settings-delete-btn"
                      disabled={!!entry.system}
                      onClick={() => removeStatus(entry.id)}
                      title={entry.system ? 'Cannot delete system status' : 'Delete status'}
                    >{'\u2715'}</button>
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button className="settings-add-btn" onClick={addStatus}>+ Add Status</button>

          {/* Transitions editor */}
          <div className="settings-transitions">
            <div className="section-title" style={{ marginTop: 24, marginBottom: 8 }}>Transitions</div>
            <div className="settings-transitions-note">
              For each status, check which statuses it can transition to.
            </div>
            {settings.statuses.map(from => (
              <div key={from.id} className="settings-transition-row">
                <span className="settings-transition-from">{from.label}</span>
                <span className="settings-transition-arrow">{'\u2192'}</span>
                <div className="settings-transition-targets">
                  {settings.statuses.filter(s => s.id !== from.id).map(to => {
                    const checked = (settings.transitions[from.id] || []).includes(to.id);
                    return (
                      <label key={to.id} className="settings-transition-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTransition(from.id, to.id)}
                        />
                        {to.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Phases ── */}
      {section === 'phases' && (
        <div className="settings-section">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhaseDragEnd}>
            <SortableContext items={settings.phases.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="settings-list">
                {settings.phases.map(entry => (
                  <SortableRow key={entry.id} id={entry.id}>
                    <input
                      type="color"
                      className="settings-color-input"
                      value={entry.color}
                      onChange={e => updatePhase(entry.id, { color: e.target.value })}
                      title="Phase color"
                    />
                    <span className="settings-id" title="Immutable ID stored in work_queue.json">{entry.id}</span>
                    <input
                      type="text"
                      className="settings-label-input"
                      value={entry.label}
                      onChange={e => updatePhase(entry.id, { label: e.target.value })}
                      title="Display label (editable)"
                    />
                    <button
                      className="settings-delete-btn"
                      onClick={() => removePhase(entry.id)}
                      title="Delete phase"
                    >{'\u2715'}</button>
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button className="settings-add-btn" onClick={addPhase}>+ Add Phase</button>
        </div>
      )}

      {/* ── Tracks ── */}
      {section === 'tracks' && (
        <div className="settings-section">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTrackDragEnd}>
            <SortableContext items={settings.tracks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="settings-list">
                {settings.tracks.map(entry => (
                  <SortableRow key={entry.id} id={entry.id}>
                    <input
                      type="color"
                      className="settings-color-input"
                      value={entry.color}
                      onChange={e => updateTrack(entry.id, { color: e.target.value })}
                      title="Track color"
                    />
                    <span className="settings-id" title="Immutable ID stored in work_queue.json">{entry.id}</span>
                    <input
                      type="text"
                      className="settings-label-input"
                      value={entry.label}
                      onChange={e => updateTrack(entry.id, { label: e.target.value })}
                      title="Display label (editable)"
                    />
                    <button
                      className="settings-delete-btn"
                      onClick={() => removeTrack(entry.id)}
                      title="Delete track"
                    >{'\u2715'}</button>
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button className="settings-add-btn" onClick={addTrack}>+ Add Track</button>
        </div>
      )}
    </div>
  );
}
