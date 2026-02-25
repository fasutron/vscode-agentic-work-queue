// Flat TreeDataProvider for the "Active Work" view.
// Shows only active and blocked items with WORKLIST progress badges.

import * as vscode from 'vscode';
import type { WQItem } from '../models/WQItem';
import { WQDataService } from '../services/WQDataService';
import { getStatusIcon } from '../utils/constants';

class ActiveTreeItem extends vscode.TreeItem {
  public wqItem?: WQItem;
}

export class WQActiveTreeProvider implements vscode.TreeDataProvider<ActiveTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ActiveTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private dataService: WQDataService;

  constructor(dataService: WQDataService) {
    this.dataService = dataService;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ActiveTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ActiveTreeItem): ActiveTreeItem[] {
    if (element) { return []; }

    // System-required behavior: active/blocked filter (these are system statuses)
    const items = this.dataService.getFilteredItems({
      status: ['active', 'blocked'],
      showDone: false,
      showArchived: false,
    });

    // Sort: active first, then blocked; within each, by priority
    items.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      return a.priority - b.priority;
    });

    return items.map(item => this.createItemNode(item));
  }

  private createItemNode(item: WQItem): ActiveTreeItem {
    const node = new ActiveTreeItem(item.id, vscode.TreeItemCollapsibleState.None);
    node.wqItem = item;

    // Description: title + worklist progress prominently displayed
    const titleTrunc = item.title.length > 40 ? item.title.slice(0, 37) + '...' : item.title;
    let desc = titleTrunc;

    const worklist = this.dataService.getWorklistForItem(item.id);
    if (worklist && worklist.progress.total > 0) {
      const pct = Math.round((worklist.progress.completed / worklist.progress.total) * 100);
      desc += `  [${worklist.progress.completed}/${worklist.progress.total} ${pct}%]`;
    }
    node.description = desc;

    // Tooltip
    const summary = Array.isArray(item.summary) ? item.summary.join(' ') : item.summary;
    const tooltipParts = [
      `**${item.id}: ${item.title}**`,
      '',
      summary,
      '',
      `Status: ${item.status} | Track: ${item.track} | Priority: P${item.priority}`,
    ];
    if (worklist && worklist.progress.total > 0) {
      tooltipParts.push('', `Progress: ${worklist.progress.completed}/${worklist.progress.total} tasks`);
      if (worklist.progress.lastCompletedTask) {
        tooltipParts.push(`Last completed: ${worklist.progress.lastCompletedTask}`);
      }
    }
    node.tooltip = new vscode.MarkdownString(tooltipParts.join('\n'));

    // Icon
    node.iconPath = getStatusIcon(item.status);

    // Context value
    const hasDocs = item.documents.length > 0;
    const hasWorklist = !!worklist;
    let ctx = `wqItem.${item.status}`;
    if (hasDocs) { ctx += '.hasDoc'; }
    if (hasWorklist) { ctx += '.hasWorklist'; }
    node.contextValue = ctx;

    return node;
  }
}
