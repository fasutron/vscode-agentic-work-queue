// Item detail panel with inline editing for status, track, and phase.
// Includes a "Worklist" sub-tab for viewing/editing individual worklist tasks.
// Actions route through postMessage to extension host → wq-cli.js.

import { useState, useEffect, useCallback } from 'react';
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
import type { WQItem, WQSettings } from '../../models/WQItem';
import type { WorklistSummary, WorklistDetailView, WorklistTaskView } from '../types';
import { postToExtension } from '../hooks/useExtensionState';
import DependencyChainPreview from './DependencyChainPreview';

interface Props {
  item: WQItem;
  allItems: WQItem[];
  worklists: WorklistSummary[];
  settings: WQSettings;
  worklistDetail: WorklistDetailView | null;
  onClose: () => void;
  onNavigateToItem: (item: WQItem | { id: string }) => void;
}

type DetailTab = 'details' | 'dependencies' | 'worklist';

/** Icon prefix for system-required status transitions. */
function transitionLabel(statusId: string, settings: WQSettings): string {
  const entry = settings.statuses.find(s => s.id === statusId);
  const label = entry?.label || statusId;
  if (statusId === 'active') return `\u25B6 ${label}`;
  if (statusId === 'done') return `\u2713 ${label}`;
  if (statusId === 'blocked') return `\u26A0 ${label}`;
  if (statusId === 'archive') return label;
  return label;
}

// ─── Sortable Task Row ────────────────────────────────────────────────────────

function SortableTaskRow({ task, onUpdate, onDelete }: {
  task: WorklistTaskView;
  onUpdate: (id: string, patch: Partial<WorklistTaskView>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editText.trim();
    if (trimmed && trimmed !== task.text) {
      onUpdate(task.id, { text: trimmed });
    } else {
      setEditText(task.text);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="worklist-task-row">
      <button className="settings-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        {'\u2630'}
      </button>
      <input
        type="checkbox"
        className="worklist-task-checkbox"
        checked={task.checked}
        onChange={() => onUpdate(task.id, { checked: !task.checked })}
        title={task.checked ? 'Mark incomplete' : 'Mark complete'}
      />
      {editing ? (
        <input
          className="worklist-task-text"
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); setEditText(task.text); } }}
          autoFocus
        />
      ) : (
        <span
          className={`worklist-task-text ${task.checked ? 'checked' : ''}`}
          onClick={() => { setEditing(true); setEditText(task.text); }}
          title="Click to edit"
        >
          {task.text}
        </span>
      )}
      <button
        className="settings-delete-btn"
        onClick={() => onDelete(task.id)}
        title="Remove task"
      >
        {'\u2715'}
      </button>
    </div>
  );
}

// ─── Add Task Input ───────────────────────────────────────────────────────────

function AddTaskInput({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState('');

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onAdd(trimmed);
      setText('');
    }
  };

  return (
    <input
      className="worklist-add-input"
      placeholder="+ Add task..."
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(); }}
      onBlur={commit}
    />
  );
}

// ─── Worklist Tab Content ─────────────────────────────────────────────────────

function WorklistTabContent({ detail, itemId }: { detail: WorklistDetailView; itemId: string }) {
  const [sections, setSections] = useState(detail.sections);

  // Sync when detail changes (e.g., from extension push)
  useEffect(() => {
    setSections(detail.sections);
  }, [detail]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = useCallback((updated: typeof sections) => {
    setSections(updated);
    postToExtension({ type: 'saveWorklistTasks', data: { wqId: itemId, sections: updated } });
  }, [itemId]);

  const handleDragEnd = (sectionIdx: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sec = sections[sectionIdx];
    const oldIndex = sec.tasks.findIndex(t => t.id === active.id);
    const newIndex = sec.tasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const updated = sections.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: arrayMove(s.tasks, oldIndex, newIndex) } : s
    );
    save(updated);
  };

  const handleUpdateTask = (sectionIdx: number) => (taskId: string, patch: Partial<WorklistTaskView>) => {
    const updated = sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return {
        ...s,
        tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t),
      };
    });
    save(updated);
  };

  const handleDeleteTask = (sectionIdx: number) => (taskId: string) => {
    const updated = sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
    });
    save(updated);
  };

  const handleAddTask = (sectionIdx: number) => (text: string) => {
    const sec = sections[sectionIdx];
    const maxId = sections.flatMap(s => s.tasks).reduce((max, t) => {
      const num = parseInt(t.id.replace('task-', ''), 10);
      return num > max ? num : max;
    }, -1);
    const newTask: WorklistTaskView = {
      id: `task-${maxId + 1}`,
      text,
      checked: false,
      section: sec.heading,
    };
    const updated = sections.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: [...s.tasks, newTask] } : s
    );
    save(updated);
  };

  return (
    <div className="worklist-tab-content">
      {sections.map((sec, sIdx) => (
        <div key={sec.heading} className="worklist-section">
          <div className="worklist-section-header">
            <span className="worklist-section-title">{sec.heading}</span>
            <span className="worklist-section-count">
              {sec.tasks.filter(t => t.checked).length}/{sec.tasks.length}
            </span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(sIdx)}>
            <SortableContext items={sec.tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {sec.tasks.map(task => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  onUpdate={handleUpdateTask(sIdx)}
                  onDelete={handleDeleteTask(sIdx)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <AddTaskInput onAdd={handleAddTask(sIdx)} />
        </div>
      ))}
      {sections.length === 0 && (
        <div style={{ padding: 16, color: 'var(--vscode-descriptionForeground)', fontSize: 12 }}>
          No checklist items found in this worklist file.
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DetailPanel({ item, allItems, worklists, settings, worklistDetail, onClose, onNavigateToItem }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('details');

  const worklist = worklists.find(w => w.wqId.toUpperCase() === item.id.toUpperCase());
  const hasWorklist = !!worklist;
  const transitions = settings.transitions[item.status] || [];

  // Request worklist detail when switching to worklist tab
  useEffect(() => {
    if (activeTab === 'worklist') {
      postToExtension({ type: 'requestWorklistDetail', data: { wqId: item.id } });
    }
  }, [activeTab, item.id]);

  const handleStatusChange = (newStatus: string) => {
    postToExtension({ type: 'changeStatus', data: { itemId: item.id, newStatus } });
  };

  const handleEditField = (field: string, value: string) => {
    if (value === (item as any)[field]) { return; }
    postToExtension({ type: 'editField', data: { itemId: item.id, field, value } });
  };

  const handleNavigate = (target: WQItem | { id: string }) => {
    const full = allItems.find(i => i.id === target.id);
    if (full) {
      setActiveTab('details');
      onNavigateToItem(full);
    }
  };

  const summary = typeof item.summary === 'string'
    ? item.summary
    : Array.isArray(item.summary) ? item.summary.join('\n') : '';

  return (
    <div className="detail-overlay">
      <div className="detail-backdrop" onClick={onClose} />
      <div className="detail-panel">
        {/* Header */}
        <div className="detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
            <span className="item-id" style={{ fontSize: 13 }}>{item.id}</span>
            <span className={`status-badge status-${item.status}`}>{item.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-ghost"
              onClick={() => postToExtension({ type: 'copyId', data: { itemId: item.id } })}
            >
              Copy ID
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => postToExtension({ type: 'openSpec', data: { itemId: item.id } })}
            >
              Open Spec
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-tabs">
          {(['details', 'dependencies'] as const).map(tab => (
            <button
              key={tab}
              className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
          {hasWorklist && (
            <button
              className={`detail-tab ${activeTab === 'worklist' ? 'active' : ''}`}
              onClick={() => setActiveTab('worklist')}
            >
              worklist
            </button>
          )}
        </div>

        {/* Body */}
        <div className="detail-body">
          {activeTab === 'details' && (
            <>
              {/* Title */}
              <div className="detail-field">
                <span className="detail-label">Title</span>
                <div className="detail-value" style={{ fontWeight: 500, fontSize: 15 }}>{item.title}</div>
              </div>

              {/* Summary */}
              {summary && (
                <div className="detail-field">
                  <span className="detail-label">Summary</span>
                  <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{summary}</div>
                </div>
              )}

              {/* Status / Track / Phase (editable) */}
              <div className="detail-row">
                <div className="detail-field">
                  <span className="detail-label">Status</span>
                  <select
                    className="inline-select"
                    value={item.status}
                    onChange={e => handleStatusChange(e.target.value)}
                  >
                    {settings.statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Track</span>
                  <select
                    className="inline-select"
                    value={item.track}
                    onChange={e => handleEditField('track', e.target.value)}
                  >
                    {settings.tracks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Phase</span>
                  <select
                    className="inline-select"
                    value={item.phase}
                    onChange={e => handleEditField('phase', e.target.value)}
                  >
                    {settings.phases.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Priority / Effort */}
              <div className="detail-row-2">
                <div className="detail-field">
                  <span className="detail-label">Priority</span>
                  <div className="detail-value">{item.priority}</div>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Effort</span>
                  <div className="detail-value">{item.effort || '-'}</div>
                </div>
              </div>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div className="detail-field">
                  <span className="detail-label">Tags</span>
                  <div className="detail-tags">
                    {item.tags.map(t => <span key={t} className="detail-tag">{t}</span>)}
                  </div>
                </div>
              )}

              {/* Documents */}
              {item.documents && item.documents.length > 0 && (
                <div className="detail-field">
                  <span className="detail-label">Documents ({item.documents.length})</span>
                  {item.documents.map((doc, i) => (
                    <div
                      key={i}
                      style={{ fontSize: 12, color: 'var(--vscode-textLink-foreground)', cursor: 'pointer', marginTop: 2 }}
                      onClick={() => postToExtension({ type: 'openSpec', data: { itemId: item.id } })}
                    >
                      {doc.type}: {doc.path.split('/').pop()}
                    </div>
                  ))}
                </div>
              )}

              {/* Worklist progress — clickable link to switch to worklist tab */}
              {worklist && worklist.total > 0 && (
                <div className="detail-field">
                  <span className="detail-label">Worklist Progress</span>
                  <div className="progress-bar-bg" style={{ marginTop: 4 }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.round((worklist.completed / worklist.total) * 100)}%`,
                        background: 'var(--wq-status-done)',
                      }}
                    />
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--vscode-textLink-foreground)', marginTop: 2, cursor: 'pointer' }}
                    onClick={() => setActiveTab('worklist')}
                    title="View worklist details"
                  >
                    {worklist.completed} / {worklist.total} ({Math.round((worklist.completed / worklist.total) * 100)}%) — View worklist
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="detail-meta">
                <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
                <div>Updated: {new Date(item.updatedAt).toLocaleString()}</div>
              </div>
            </>
          )}

          {activeTab === 'dependencies' && (
            <DependencyChainPreview
              item={item}
              allItems={allItems}
              onItemClick={handleNavigate}
            />
          )}

          {activeTab === 'worklist' && (
            worklistDetail && worklistDetail.wqId.toUpperCase() === item.id.toUpperCase()
              ? <WorklistTabContent detail={worklistDetail} itemId={item.id} />
              : <div style={{ padding: 16, color: 'var(--vscode-descriptionForeground)', fontSize: 12 }}>Loading worklist...</div>
          )}
        </div>

        {/* Action bar */}
        <div className="action-bar">
          {transitions.map(status => (
            <button
              key={status}
              className="btn-status"
              onClick={() => handleStatusChange(status)}
            >
              {transitionLabel(status, settings)}
            </button>
          ))}
          <button
            className="btn-status"
            style={{ marginLeft: 'auto' }}
            onClick={() => postToExtension({ type: 'delegateExplore', data: { itemId: item.id } })}
          >
            Explore
          </button>
          <button
            className="btn-status"
            onClick={() => postToExtension({ type: 'delegatePlan', data: { itemId: item.id } })}
          >
            Plan
          </button>
        </div>
      </div>
    </div>
  );
}
