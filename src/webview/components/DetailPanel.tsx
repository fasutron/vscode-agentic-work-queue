// Item detail panel with inline editing for status, track, and phase.
// Includes "Worklist" and "Testing" sub-tabs for viewing/editing tasks and tests.
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
import type { WQItem, WQSettings, TestStatus } from '../../models/WQItem';
import type { WorklistSummary, WorklistDetailView, WorklistTaskView, TestPlanSummary, TestPlanDetailView, TestItemView } from '../types';
import { postToExtension } from '../hooks/useExtensionState';
import DependencyChainPreview from './DependencyChainPreview';

interface Props {
  item: WQItem;
  allItems: WQItem[];
  worklists: WorklistSummary[];
  testPlans: TestPlanSummary[];
  settings: WQSettings;
  worklistDetail: WorklistDetailView | null;
  testPlanDetail: TestPlanDetailView | null;
  onClose: () => void;
  onNavigateToItem: (item: WQItem | { id: string }) => void;
}

type DetailTab = 'details' | 'dependencies' | 'worklist' | 'testing';

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

// ─── Sortable Test Row ───────────────────────────────────────────────────────

const STATUS_CYCLE: TestStatus[] = ['pending', 'pass', 'fail'];

function statusIcon(status: TestStatus): string {
  switch (status) {
    case 'pass': return '\u2713';   // ✓
    case 'fail': return '\u2717';   // ✗
    default: return '\u25CB';       // ○
  }
}

function SortableTestRow({ test, onUpdate, onDelete, onCreateBug }: {
  test: TestItemView;
  onUpdate: (id: string, patch: Partial<TestItemView>) => void;
  onDelete: (id: string) => void;
  onCreateBug: (testText: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: test.id });
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(test.text);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const commitEdit = () => {
    setEditing(false);
    const trimmed = editText.trim();
    if (trimmed && trimmed !== test.text) {
      onUpdate(test.id, { text: trimmed });
    } else {
      setEditText(test.text);
    }
  };

  const cycleStatus = () => {
    const idx = STATUS_CYCLE.indexOf(test.status);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    onUpdate(test.id, { status: next });
  };

  return (
    <div ref={setNodeRef} style={style} className={`testplan-task-row ${test.status === 'fail' ? 'fail' : ''}`}>
      <button className="settings-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        {'\u2630'}
      </button>
      <button
        className={`testplan-status testplan-status-${test.status}`}
        onClick={cycleStatus}
        title={`${test.status} — click to cycle`}
      >
        {statusIcon(test.status)}
      </button>
      {editing ? (
        <input
          className="worklist-task-text"
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); setEditText(test.text); } }}
          autoFocus
        />
      ) : (
        <span
          className={`worklist-task-text ${test.status === 'pass' ? 'testplan-text-pass' : ''}`}
          onClick={() => { setEditing(true); setEditText(test.text); }}
          title="Click to edit"
        >
          {test.text}
        </span>
      )}
      {test.status === 'fail' && (
        <button
          className="testplan-bug-btn"
          onClick={() => onCreateBug(test.text)}
          title="File bug to worklist"
        >
          {'\uD83D\uDC1B'}
        </button>
      )}
      <button
        className="settings-delete-btn"
        onClick={() => onDelete(test.id)}
        title="Remove test"
      >
        {'\u2715'}
      </button>
    </div>
  );
}

// ─── Testing Tab Content ─────────────────────────────────────────────────────

function TestingTabContent({ detail, itemId }: { detail: TestPlanDetailView; itemId: string }) {
  const [sections, setSections] = useState(detail.sections);

  useEffect(() => {
    setSections(detail.sections);
  }, [detail]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = useCallback((updated: typeof sections) => {
    setSections(updated);
    postToExtension({ type: 'saveTestPlanTests', data: { wqId: itemId, sections: updated } });
  }, [itemId]);

  const handleDragEnd = (sectionIdx: number) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sec = sections[sectionIdx];
    const oldIndex = sec.tests.findIndex(t => t.id === active.id);
    const newIndex = sec.tests.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const updated = sections.map((s, i) =>
      i === sectionIdx ? { ...s, tests: arrayMove(s.tests, oldIndex, newIndex) } : s
    );
    save(updated);
  };

  const handleUpdateTest = (sectionIdx: number) => (testId: string, patch: Partial<TestItemView>) => {
    const updated = sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return {
        ...s,
        tests: s.tests.map(t => t.id === testId ? { ...t, ...patch } : t),
      };
    });
    save(updated);
  };

  const handleDeleteTest = (sectionIdx: number) => (testId: string) => {
    const updated = sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return { ...s, tests: s.tests.filter(t => t.id !== testId) };
    });
    save(updated);
  };

  const handleAddTest = (sectionIdx: number) => (text: string) => {
    const sec = sections[sectionIdx];
    const maxId = sections.flatMap(s => s.tests).reduce((max, t) => {
      const num = parseInt(t.id.replace('test-', ''), 10);
      return num > max ? num : max;
    }, -1);
    const newTest: TestItemView = {
      id: `test-${maxId + 1}`,
      text,
      status: 'pending',
      section: sec.heading,
    };
    const updated = sections.map((s, i) =>
      i === sectionIdx ? { ...s, tests: [...s.tests, newTest] } : s
    );
    save(updated);
  };

  const handleCreateBug = (testText: string) => {
    postToExtension({ type: 'createBugFromTest', data: { wqId: itemId, testText } });
  };

  // Compute summary counts
  const allTests = sections.flatMap(s => s.tests);
  const passCount = allTests.filter(t => t.status === 'pass').length;
  const failCount = allTests.filter(t => t.status === 'fail').length;
  const pendingCount = allTests.filter(t => t.status === 'pending').length;
  const total = allTests.length;

  return (
    <div className="testplan-tab-content">
      {/* Summary bar */}
      {total > 0 && (
        <div className="testplan-summary">
          <span className="testplan-summary-pass">{passCount} pass</span>
          <span className="testplan-summary-fail">{failCount} fail</span>
          <span className="testplan-summary-pending">{pendingCount} pending</span>
          <div className="testplan-progress-bar">
            {passCount > 0 && (
              <div className="testplan-progress-pass" style={{ width: `${(passCount / total) * 100}%` }} />
            )}
            {failCount > 0 && (
              <div className="testplan-progress-fail" style={{ width: `${(failCount / total) * 100}%` }} />
            )}
            {pendingCount > 0 && (
              <div className="testplan-progress-pending" style={{ width: `${(pendingCount / total) * 100}%` }} />
            )}
          </div>
        </div>
      )}

      {sections.map((sec, sIdx) => (
        <div key={sec.heading} className="worklist-section">
          <div className="worklist-section-header">
            <span className="worklist-section-title">{sec.heading}</span>
            <span className="worklist-section-count">
              {sec.tests.filter(t => t.status === 'pass').length}/{sec.tests.length}
            </span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(sIdx)}>
            <SortableContext items={sec.tests.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {sec.tests.map(test => (
                <SortableTestRow
                  key={test.id}
                  test={test}
                  onUpdate={handleUpdateTest(sIdx)}
                  onDelete={handleDeleteTest(sIdx)}
                  onCreateBug={handleCreateBug}
                />
              ))}
            </SortableContext>
          </DndContext>
          <AddTaskInput onAdd={handleAddTest(sIdx)} />
        </div>
      ))}
      {sections.length === 0 && (
        <div style={{ padding: 16, color: 'var(--vscode-descriptionForeground)', fontSize: 12 }}>
          No test items found in this test plan file.
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DetailPanel({ item, allItems, worklists, testPlans, settings, worklistDetail, testPlanDetail, onClose, onNavigateToItem }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('details');

  const worklist = worklists.find(w => w.wqId.toUpperCase() === item.id.toUpperCase());
  const hasWorklist = !!worklist;
  const testPlan = testPlans.find(t => t.wqId.toUpperCase() === item.id.toUpperCase());
  const hasTestPlan = !!testPlan;
  const transitions = settings.transitions[item.status] || [];

  // Request worklist detail when switching to worklist tab
  useEffect(() => {
    if (activeTab === 'worklist') {
      postToExtension({ type: 'requestWorklistDetail', data: { wqId: item.id } });
    }
    if (activeTab === 'testing') {
      postToExtension({ type: 'requestTestPlanDetail', data: { wqId: item.id } });
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
          {hasTestPlan && (
            <button
              className={`detail-tab ${activeTab === 'testing' ? 'active' : ''}`}
              onClick={() => setActiveTab('testing')}
            >
              testing
              {testPlan && testPlan.fail > 0 && (
                <span className="testplan-fail-badge">{testPlan.fail}</span>
              )}
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
                      onClick={() => postToExtension({ type: 'openSpec', data: { itemId: item.id, docIndex: i } })}
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

              {/* Test plan progress — clickable link to switch to testing tab */}
              {testPlan && testPlan.total > 0 && (
                <div className="detail-field">
                  <span className="detail-label">Test Progress</span>
                  <div className="testplan-progress-bar" style={{ marginTop: 4 }}>
                    {testPlan.pass > 0 && (
                      <div className="testplan-progress-pass" style={{ width: `${(testPlan.pass / testPlan.total) * 100}%` }} />
                    )}
                    {testPlan.fail > 0 && (
                      <div className="testplan-progress-fail" style={{ width: `${(testPlan.fail / testPlan.total) * 100}%` }} />
                    )}
                    {testPlan.pending > 0 && (
                      <div className="testplan-progress-pending" style={{ width: `${(testPlan.pending / testPlan.total) * 100}%` }} />
                    )}
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--vscode-textLink-foreground)', marginTop: 2, cursor: 'pointer' }}
                    onClick={() => setActiveTab('testing')}
                    title="View test plan"
                  >
                    {testPlan.pass} pass / {testPlan.fail} fail / {testPlan.pending} pending — View tests
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

          {activeTab === 'testing' && (
            testPlanDetail && testPlanDetail.wqId.toUpperCase() === item.id.toUpperCase()
              ? <TestingTabContent detail={testPlanDetail} itemId={item.id} />
              : <div style={{ padding: 16, color: 'var(--vscode-descriptionForeground)', fontSize: 12 }}>Loading test plan...</div>
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
