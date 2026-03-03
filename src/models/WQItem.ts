// TypeScript interfaces for the Work Queue data model.
// Maps to the JSON structure in documents/handoffs/work_queue.json.

// Loosened to string so user-defined values work. System-required statuses
// (intake, active, done, archive) are enforced by settings.system flag.
export type WQStatus = string;
export type WQTrack = string;
export type WQPhase = string;
export type GroupingMode = 'phase' | 'status' | 'track' | 'grade';

export interface WQDocument {
  type: string;   // 'spec' | 'brief' | 'notes'
  path: string;   // relative to handoffs dir, e.g. "2-in_progress/SPEC_Foo.md"
}

export interface WQItem {
  id: string;
  title: string;
  summary: string | string[];   // some items have array summaries
  status: WQStatus;
  track: WQTrack;
  phase: WQPhase;
  priority: number;
  effort: string | null;
  tags: string[];
  documents: WQDocument[];
  dependsOn: string[];
  blocks: string[];
  createdAt: string;
  updatedAt: string;
  statusHistory?: { from: string; to: string; at: string }[];
  notes?: string;
}

// --- Settings types ---

export interface WQStatusEntry {
  id: string;
  label: string;
  system?: boolean;   // true for intake, active, done, archive — cannot be deleted
  folder: string;     // '1-pending' | '2-in_progress' | '3-completed'
  color: string;      // hex color, e.g. '#e5c07b'
}

export interface WQPhaseEntry {
  id: string;
  label: string;
  color: string;
}

export interface WQTrackEntry {
  id: string;
  label: string;
  color: string;
}

export interface WQSettings {
  statuses: WQStatusEntry[];
  phases: WQPhaseEntry[];
  tracks: WQTrackEntry[];
  transitions: Record<string, string[]>;
}

export interface WQFile {
  version: string;
  repoPath: string;
  lastModified: string;
  ideAgentPreamble: string;
  items: WQItem[];
  settings?: WQSettings;
}

export interface WorklistProgress {
  completed: number;
  pending: number;
  total: number;
  lastCompletedTask?: string;
}

export interface WorklistMapping {
  filePath: string;           // absolute path to WORKLIST file
  wqIds: string[];            // ["WQ-155"] or ["WQ-077", "WQ-078"] for multi-WQ
  progress: WorklistProgress;
}

// --- Parsed worklist types (for round-trip editing) ---

/** A single checkbox task from a WORKLIST file. */
export interface WorklistTask {
  id: string;        // Stable ID: "task-0", "task-1", etc.
  text: string;      // Task text without checkbox prefix
  checked: boolean;  // true = [x], false = [ ]
  section: string;   // Section heading, e.g. "In Progress"
}

/** A raw (non-checkbox) line preserved for round-trip fidelity. */
export interface WorklistRawLine {
  type: 'raw';
  text: string;
}

/** Parsed worklist section containing tasks and interstitial raw lines. */
export interface WorklistSection {
  heading: string;
  items: (WorklistTask | WorklistRawLine)[];
}

/** Full parsed worklist for round-trip serialization. */
export interface ParsedWorklist {
  title: string;
  wqIds: string[];
  rawPreamble: string;      // Lines between H1 and first H2
  sections: WorklistSection[];
}

// --- Parsed test plan types (for round-trip editing) ---

/** Test status: pending (untested), pass, or fail. */
export type TestStatus = 'pending' | 'pass' | 'fail';

/** A single test item from a TEST_PLAN or TESTING_CHECKLIST file. */
export interface TestItem {
  id: string;            // Stable ID: "test-0", "test-1", etc.
  text: string;          // Test description without status prefix
  status: TestStatus;    // pending = [ ], pass = [x]/[X], fail = [!]
  section: string;       // Section heading
}

/** A raw (non-test) line preserved for round-trip fidelity. */
export interface TestRawLine {
  type: 'raw';
  text: string;
}

/** Parsed test plan section containing test items and raw lines. */
export interface TestSection {
  heading: string;
  items: (TestItem | TestRawLine)[];
}

/** Full parsed test plan for round-trip serialization. */
export interface ParsedTestPlan {
  title: string;
  wqIds: string[];
  rawPreamble: string;      // Lines between H1 and first H2
  sections: TestSection[];
}

/** Test plan progress summary. */
export interface TestPlanProgress {
  pass: number;
  fail: number;
  pending: number;
  total: number;
}

/** Maps test plan file to WQ items (analogous to WorklistMapping). */
export interface TestPlanMapping {
  filePath: string;
  wqIds: string[];
  progress: TestPlanProgress;
}
