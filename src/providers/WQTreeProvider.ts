// Main TreeDataProvider for the "Items" view in the Work Queue sidebar.
// Supports grouping by phase, status, track, or grade with text filtering.

import * as vscode from 'vscode';
import type { WQItem, GroupingMode } from '../models/WQItem';
import { WQDataService } from '../services/WQDataService';
import { getStatusIcon, getOrderedIds, getLabels } from '../utils/constants';

/**
 * TreeItem representing either a group header or a WQ item.
 */
export class WQTreeItem extends vscode.TreeItem {
  /** Set for item nodes; undefined for group nodes */
  public wqItem?: WQItem;
  /** Group key used to retrieve children */
  public groupKey?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }
}

export class WQTreeProvider implements vscode.TreeDataProvider<WQTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WQTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private grouping: GroupingMode = 'phase';
  private filterText = '';
  private dataService: WQDataService;

  constructor(dataService: WQDataService, defaultGrouping: GroupingMode = 'phase') {
    this.dataService = dataService;
    this.grouping = defaultGrouping;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setGrouping(mode: GroupingMode): void {
    this.grouping = mode;
    this.refresh();
  }

  getGrouping(): GroupingMode {
    return this.grouping;
  }

  setFilter(text: string): void {
    this.filterText = text;
    this.refresh();
  }

  getFilter(): string {
    return this.filterText;
  }

  getTreeItem(element: WQTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WQTreeItem): WQTreeItem[] {
    if (!element) {
      return this.getRootGroups();
    }

    if (element.groupKey) {
      return this.getGroupChildren(element.groupKey);
    }

    return [];
  }

  // --- Private ---

  private getVisibleItems(): WQItem[] {
    const config = vscode.workspace.getConfiguration('purr-wq');
    return this.dataService.getFilteredItems({
      showDone: config.get('showDone', false),
      showArchived: config.get('showArchived', false),
      searchText: this.filterText || undefined,
    });
  }

  private getRootGroups(): WQTreeItem[] {
    const items = this.getVisibleItems();

    switch (this.grouping) {
      case 'phase': return this.groupByPhase(items);
      case 'status': return this.groupByStatus(items);
      case 'track': return this.groupByTrack(items);
      case 'grade': return this.groupByGrade(items);
      default: return this.groupByPhase(items);
    }
  }

  private groupByPhase(items: WQItem[]): WQTreeItem[] {
    const settings = this.dataService.getSettings();
    const { phases } = getOrderedIds(settings);
    const labels = getLabels(settings).phases;

    return phases
      .map(phase => {
        const count = items.filter(i => i.phase === phase).length;
        if (count === 0) { return null; }
        const node = new WQTreeItem(
          `${labels[phase] || phase} (${count})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        node.groupKey = `phase:${phase}`;
        node.iconPath = new vscode.ThemeIcon('folder');
        return node;
      })
      .filter((n): n is WQTreeItem => n !== null);
  }

  private groupByStatus(items: WQItem[]): WQTreeItem[] {
    const settings = this.dataService.getSettings();
    const { statuses } = getOrderedIds(settings);
    const labels = getLabels(settings).statuses;

    return statuses
      .map(status => {
        const count = items.filter(i => i.status === status).length;
        if (count === 0) { return null; }
        const node = new WQTreeItem(
          `${labels[status] || status} (${count})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        node.groupKey = `status:${status}`;
        node.iconPath = getStatusIcon(status);
        return node;
      })
      .filter((n): n is WQTreeItem => n !== null);
  }

  private groupByTrack(items: WQItem[]): WQTreeItem[] {
    const settings = this.dataService.getSettings();
    const { tracks } = getOrderedIds(settings);
    const labels = getLabels(settings).tracks;

    return tracks
      .map(track => {
        const count = items.filter(i => i.track === track).length;
        if (count === 0) { return null; }
        const node = new WQTreeItem(
          `${labels[track] || track} (${count})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        node.groupKey = `track:${track}`;
        node.iconPath = new vscode.ThemeIcon('folder');
        return node;
      })
      .filter((n): n is WQTreeItem => n !== null);
  }

  private groupByGrade(items: WQItem[]): WQTreeItem[] {
    const gradeA = items.filter(i => i.tags.includes('grade-a'));
    const gradeB = items.filter(i => i.tags.includes('grade-b'));
    const ungraded = items.filter(i => !i.tags.includes('grade-a') && !i.tags.includes('grade-b'));

    const groups: WQTreeItem[] = [];

    if (gradeA.length > 0) {
      const node = new WQTreeItem(
        `Grade A: Critical (${gradeA.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      node.groupKey = 'grade:a';
      node.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('errorForeground'));
      groups.push(node);
    }

    if (gradeB.length > 0) {
      const node = new WQTreeItem(
        `Grade B: High Value (${gradeB.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      node.groupKey = 'grade:b';
      node.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('editorWarning.foreground'));
      groups.push(node);
    }

    if (ungraded.length > 0) {
      const node = new WQTreeItem(
        `Ungraded (${ungraded.length})`,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      node.groupKey = 'grade:none';
      node.iconPath = new vscode.ThemeIcon('folder');
      groups.push(node);
    }

    return groups;
  }

  private getGroupChildren(groupKey: string): WQTreeItem[] {
    const items = this.getVisibleItems();
    const [dimension, value] = groupKey.split(':');

    let filtered: WQItem[];
    switch (dimension) {
      case 'phase':
        filtered = items.filter(i => i.phase === value);
        break;
      case 'status':
        filtered = items.filter(i => i.status === value);
        break;
      case 'track':
        filtered = items.filter(i => i.track === value);
        break;
      case 'grade':
        if (value === 'a') {
          filtered = items.filter(i => i.tags.includes('grade-a'));
        } else if (value === 'b') {
          filtered = items.filter(i => i.tags.includes('grade-b'));
        } else {
          filtered = items.filter(i => !i.tags.includes('grade-a') && !i.tags.includes('grade-b'));
        }
        break;
      default:
        filtered = [];
    }

    // Sort by priority (lower number = higher priority)
    filtered.sort((a, b) => a.priority - b.priority);

    return filtered.map(item => this.createItemNode(item));
  }

  private createItemNode(item: WQItem): WQTreeItem {
    const node = new WQTreeItem(item.id, vscode.TreeItemCollapsibleState.None);
    node.wqItem = item;

    // Description: title + priority + optional worklist progress
    const titleTrunc = item.title.length > 45 ? item.title.slice(0, 42) + '...' : item.title;
    let desc = `${titleTrunc}  P${item.priority}`;

    const worklist = this.dataService.getWorklistForItem(item.id);
    if (worklist && worklist.progress.total > 0) {
      desc += `  [${worklist.progress.completed}/${worklist.progress.total}]`;
    }
    node.description = desc;

    // Tooltip: full details
    const summary = Array.isArray(item.summary) ? item.summary.join(' ') : item.summary;
    node.tooltip = new vscode.MarkdownString(
      `**${item.id}: ${item.title}**\n\n` +
      `${summary}\n\n` +
      `Status: ${item.status} | Track: ${item.track} | Phase: ${item.phase}\n\n` +
      `Priority: ${item.priority}` +
      (item.effort ? ` | Effort: ${item.effort}` : '') +
      (item.tags.length > 0 ? `\n\nTags: ${item.tags.join(', ')}` : ''),
    );

    // Icon
    node.iconPath = getStatusIcon(item.status);

    // Context value for menu when-clauses
    const hasDocs = item.documents.length > 0;
    const hasWorklist = !!worklist;
    let ctx = `wqItem.${item.status}`;
    if (hasDocs) { ctx += '.hasDoc'; }
    if (hasWorklist) { ctx += '.hasWorklist'; }
    node.contextValue = ctx;

    return node;
  }
}
