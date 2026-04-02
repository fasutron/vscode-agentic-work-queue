// Typed postMessage protocol for extension host <-> webview communication.

import type { WQItem, WQSettings, TestStatus } from '../models/WQItem';

/** Worklist progress summary sent to webview (no file system paths). */
export interface WorklistSummary {
  wqId: string;
  completed: number;
  pending: number;
  total: number;
}

/** Individual worklist task sent to webview. */
export interface WorklistTaskView {
  id: string;
  text: string;
  checked: boolean;
  section: string;
}

/** Full worklist detail sent to webview for a specific WQ item. */
export interface WorklistDetailView {
  wqId: string;
  title: string;
  sections: { heading: string; tasks: WorklistTaskView[] }[];
}

/** Test plan progress summary sent to webview. */
export interface TestPlanSummary {
  wqId: string;
  pass: number;
  fail: number;
  pending: number;
  total: number;
}

/** Individual test item sent to webview. */
export interface TestItemView {
  id: string;
  text: string;
  status: TestStatus;
  section: string;
}

/** Full test plan detail sent to webview for a specific WQ item. */
export interface TestPlanDetailView {
  wqId: string;
  title: string;
  sections: { heading: string; tests: TestItemView[] }[];
}

/** Messages sent FROM extension host TO webview. */
export type ExtensionToWebviewMessage =
  | { type: 'init'; data: { items: WQItem[]; worklists: WorklistSummary[]; settings: WQSettings; testPlans: TestPlanSummary[] } }
  | { type: 'dataUpdate'; data: { items: WQItem[]; worklists: WorklistSummary[]; settings: WQSettings; testPlans: TestPlanSummary[] } }
  | { type: 'statusChangeResult'; data: { itemId: string; success: boolean } }
  | { type: 'toast'; data: { message: string } }
  | { type: 'worklistDetail'; data: WorklistDetailView | null }
  | { type: 'testPlanDetail'; data: TestPlanDetailView | null };

/** Messages sent FROM webview TO extension host. */
export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'changeStatus'; data: { itemId: string; newStatus: string } }
  | { type: 'openSpec'; data: { itemId: string; docIndex?: number } }
  | { type: 'openWorklist'; data: { itemId: string } }
  | { type: 'copyId'; data: { itemId: string } }
  | { type: 'delegateExplore'; data: { itemId: string } }
  | { type: 'delegatePlan'; data: { itemId: string } }
  | { type: 'editField'; data: { itemId: string; field: string; value: string } }
  | { type: 'saveSettings'; data: { settings: WQSettings } }
  | { type: 'showNotification'; data: { message: string; kind: 'info' | 'warning' | 'error' } }
  | { type: 'requestWorklistDetail'; data: { wqId: string } }
  | { type: 'saveWorklistTasks'; data: { wqId: string; sections: { heading: string; tasks: WorklistTaskView[] }[] } }
  | { type: 'requestTestPlanDetail'; data: { wqId: string } }
  | { type: 'saveTestPlanTests'; data: { wqId: string; sections: { heading: string; tests: TestItemView[] }[] } }
  | { type: 'createBugFromTest'; data: { wqId: string; testText: string } }
  | { type: 'createItem'; data: { title: string; track: string; phase: string } }
  | { type: 'createSpec'; data: { itemId: string; docType?: string } };
