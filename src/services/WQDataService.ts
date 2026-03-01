// Central data service: loads work_queue.json, discovers/parses WORKLIST and
// TEST_PLAN files, and maintains the mapping between WQ items and their documents.

import * as fs from 'fs';
import * as path from 'path';
import type { WQItem, WQFile, WQDocument, WorklistMapping, TestPlanMapping, WQStatus, WQPhase, WQTrack, WQSettings } from '../models/WQItem';
import type { ParsedWorklist, ParsedTestPlan } from '../models/WQItem';
import { DEFAULT_SETTINGS } from '../models/defaultSettings';
import { parseWorklistProgress, extractWqIdsFromWorklist, parseWorklistFull, serializeWorklist } from '../models/WorklistParser';
import { parseTestPlanProgress, extractWqIdsFromTestPlan, parseTestPlanFull, serializeTestPlan } from '../models/TestPlanParser';

export interface FilterOptions {
  status?: WQStatus[];
  phase?: WQPhase[];
  track?: WQTrack[];
  searchText?: string;
  showDone?: boolean;
  showArchived?: boolean;
}

export class WQDataService {
  private handoffsDir: string;
  private items: WQItem[] = [];
  private settings: WQSettings = DEFAULT_SETTINGS;
  /** Maps WQ ID → worklist mappings (an item can have multiple worklists) */
  private worklistByWqId: Map<string, WorklistMapping[]> = new Map();
  /** Maps absolute file path → worklist mapping */
  private worklistByPath: Map<string, WorklistMapping> = new Map();
  /** Maps WQ ID → test plan mappings */
  private testPlanByWqId: Map<string, TestPlanMapping[]> = new Map();
  /** Maps absolute file path → test plan mapping */
  private testPlanByPath: Map<string, TestPlanMapping> = new Map();

  constructor(handoffsDir: string) {
    this.handoffsDir = handoffsDir;
    this.reload();
  }

  /**
   * Reload all data from disk. Called on init and on file watcher events.
   */
  reload(): void {
    this.loadItems();
    this.loadWorklists();
    this.loadTestPlans();
  }

  getItems(): WQItem[] {
    return this.items;
  }

  getSettings(): WQSettings {
    return this.settings;
  }

  /**
   * Write updated settings back to work_queue.json.
   * The file watcher will trigger a reload automatically.
   */
  saveSettings(settings: WQSettings): void {
    const wqPath = path.join(this.handoffsDir, 'work_queue.json');
    try {
      const raw = fs.readFileSync(wqPath, 'utf-8');
      const wqFile = JSON.parse(raw);
      wqFile.settings = settings;
      wqFile.lastModified = new Date().toISOString();
      fs.writeFileSync(wqPath, JSON.stringify(wqFile, null, 2));
      this.settings = settings;
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  getItemById(id: string): WQItem | undefined {
    return this.items.find(item => item.id.toLowerCase() === id.toLowerCase());
  }

  /**
   * Get filtered items based on criteria.
   */
  getFilteredItems(filter: FilterOptions): WQItem[] {
    return this.items.filter(item => {
      // Status visibility
      if (!filter.showDone && item.status === 'done') { return false; }
      if (!filter.showArchived && item.status === 'archive') { return false; }

      // Status filter
      if (filter.status && !filter.status.includes(item.status)) { return false; }

      // Phase filter
      if (filter.phase && !filter.phase.includes(item.phase)) { return false; }

      // Track filter
      if (filter.track && !filter.track.includes(item.track)) { return false; }

      // Text search (title + tags)
      if (filter.searchText) {
        const query = filter.searchText.toLowerCase();
        const titleMatch = item.title.toLowerCase().includes(query);
        const tagMatch = item.tags.some(t => t.toLowerCase().includes(query));
        const idMatch = item.id.toLowerCase().includes(query);
        if (!titleMatch && !tagMatch && !idMatch) { return false; }
      }

      return true;
    });
  }

  /**
   * Get the primary WORKLIST mapping for a WQ item (first match).
   */
  getWorklistForItem(id: string): WorklistMapping | undefined {
    const mappings = this.worklistByWqId.get(id.toUpperCase());
    return mappings?.[0];
  }

  /**
   * Resolve a WQ document's relative path to an absolute path.
   * Falls back to scanning all status folders if the stored path is stale.
   */
  resolveDocumentPath(doc: WQDocument): string | undefined {
    const directPath = path.join(this.handoffsDir, doc.path);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    // Fallback: scan status folders (derived from settings) for the basename
    const basename = path.basename(doc.path);
    const folders = [...new Set(this.settings.statuses.map(s => s.folder))];
    for (const folder of folders) {
      const candidate = path.join(this.handoffsDir, folder, basename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  /**
   * Get the absolute path to the WORKLIST file for a WQ item.
   */
  resolveWorklistPath(itemId: string): string | undefined {
    return this.getWorklistForItem(itemId)?.filePath;
  }

  /**
   * Get the full parsed worklist for a WQ item (individual tasks, not just counts).
   */
  getWorklistDetail(itemId: string): ParsedWorklist | undefined {
    const mapping = this.getWorklistForItem(itemId);
    if (!mapping) { return undefined; }
    try {
      const content = fs.readFileSync(mapping.filePath, 'utf-8');
      const filename = path.basename(mapping.filePath);
      return parseWorklistFull(content, filename);
    } catch {
      return undefined;
    }
  }

  /**
   * Save an updated ParsedWorklist back to disk.
   */
  saveWorklistDetail(itemId: string, parsed: ParsedWorklist): boolean {
    const mapping = this.getWorklistForItem(itemId);
    if (!mapping) { return false; }
    try {
      const markdown = serializeWorklist(parsed);
      fs.writeFileSync(mapping.filePath, markdown, 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to save worklist:', e);
      return false;
    }
  }

  /**
   * Get WQ item IDs that have associated worklist files.
   */
  getWorklistItemIds(): string[] {
    return Array.from(this.worklistByWqId.keys());
  }

  // --- Test plan public methods ---

  /**
   * Get the primary test plan mapping for a WQ item (first match).
   */
  getTestPlanForItem(id: string): TestPlanMapping | undefined {
    const mappings = this.testPlanByWqId.get(id.toUpperCase());
    return mappings?.[0];
  }

  /**
   * Get the absolute path to the test plan file for a WQ item.
   */
  resolveTestPlanPath(itemId: string): string | undefined {
    return this.getTestPlanForItem(itemId)?.filePath;
  }

  /**
   * Get the full parsed test plan for a WQ item.
   */
  getTestPlanDetail(itemId: string): ParsedTestPlan | undefined {
    const mapping = this.getTestPlanForItem(itemId);
    if (!mapping) { return undefined; }
    try {
      const content = fs.readFileSync(mapping.filePath, 'utf-8');
      const filename = path.basename(mapping.filePath);
      return parseTestPlanFull(content, filename);
    } catch {
      return undefined;
    }
  }

  /**
   * Save an updated ParsedTestPlan back to disk.
   */
  saveTestPlanDetail(itemId: string, parsed: ParsedTestPlan): boolean {
    const mapping = this.getTestPlanForItem(itemId);
    if (!mapping) { return false; }
    try {
      const markdown = serializeTestPlan(parsed);
      fs.writeFileSync(mapping.filePath, markdown, 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to save test plan:', e);
      return false;
    }
  }

  /**
   * Get WQ item IDs that have associated test plan files.
   */
  getTestPlanItemIds(): string[] {
    return Array.from(this.testPlanByWqId.keys());
  }

  // --- Private methods ---

  private loadItems(): void {
    const wqPath = path.join(this.handoffsDir, 'work_queue.json');
    try {
      const raw = fs.readFileSync(wqPath, 'utf-8');
      const wqFile: WQFile = JSON.parse(raw);
      this.items = wqFile.items || [];
      this.settings = wqFile.settings || DEFAULT_SETTINGS;
    } catch {
      this.items = [];
      this.settings = DEFAULT_SETTINGS;
    }
  }

  private loadWorklists(): void {
    this.worklistByWqId.clear();
    this.worklistByPath.clear();

    const worklistFiles = this.discoverWorklistFiles();

    for (const filePath of worklistFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const filename = path.basename(filePath);
        const progress = parseWorklistProgress(content);
        const wqIds = extractWqIdsFromWorklist(content, filename);

        const mapping: WorklistMapping = {
          filePath,
          wqIds,
          progress,
        };

        this.worklistByPath.set(filePath, mapping);

        // Index by each referenced WQ ID
        for (const id of wqIds) {
          const key = id.toUpperCase();
          const existing = this.worklistByWqId.get(key) || [];
          existing.push(mapping);
          this.worklistByWqId.set(key, existing);
        }
      } catch {
        // Skip unreadable worklist files
      }
    }
  }

  /**
   * Recursively discover all *WORKLIST*.md files under the handoffs directory.
   */
  private discoverWorklistFiles(): string[] {
    const results: string[] = [];
    const matcher = (name: string) => name.includes('WORKLIST') && name.endsWith('.md');
    this.walkDir(this.handoffsDir, results, matcher);
    return results;
  }

  /**
   * Recursively discover all test plan files under the handoffs directory.
   * Matches: *TEST_PLAN*, *TESTING_CHECKLIST*, *SMOKE_TEST*, *_Tests.md
   * (case-insensitive). Excludes worklist, results, and prompt files.
   */
  private discoverTestPlanFiles(): string[] {
    const results: string[] = [];
    const matcher = (name: string) => {
      const upper = name.toUpperCase();
      if (!upper.endsWith('.MD')) return false;
      if (upper.includes('WORKLIST')) return false;
      // Exclude test session artifacts (results, prompts, vectors)
      if (upper.includes('_RESULT') || upper.includes('_PROMPT') || upper.includes('_VECTOR')) return false;
      return upper.includes('TEST_PLAN') || upper.includes('TESTING_CHECKLIST')
        || upper.includes('SMOKE_TEST') || upper.includes('_TESTS.');
    };
    this.walkDir(this.handoffsDir, results, matcher);
    return results;
  }

  private loadTestPlans(): void {
    this.testPlanByWqId.clear();
    this.testPlanByPath.clear();

    const testPlanFiles = this.discoverTestPlanFiles();

    for (const filePath of testPlanFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const filename = path.basename(filePath);
        const progress = parseTestPlanProgress(content);
        const wqIds = extractWqIdsFromTestPlan(content, filename);

        const mapping: TestPlanMapping = {
          filePath,
          wqIds,
          progress,
        };

        this.testPlanByPath.set(filePath, mapping);

        // Index by each referenced WQ ID
        for (const id of wqIds) {
          const key = id.toUpperCase();
          const existing = this.testPlanByWqId.get(key) || [];
          existing.push(mapping);
          this.testPlanByWqId.set(key, existing);
        }
      } catch {
        // Skip unreadable test plan files
      }
    }
  }

  private walkDir(dir: string, results: string[], matcher: (name: string) => boolean): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, results, matcher);
      } else if (entry.isFile() && matcher(entry.name)) {
        results.push(fullPath);
      }
    }
  }
}
