// Entry point for the Agentic Work Queue VS Code extension.
// Registers TreeView providers, file watchers, and all commands.

import * as vscode from 'vscode';
import * as path from 'path';
import { WQDataService } from './services/WQDataService';
import { ClaudeCodeService } from './services/ClaudeCodeService';
import { WQTreeProvider, WQTreeItem } from './providers/WQTreeProvider';
import { WQActiveTreeProvider } from './providers/WQActiveTreeProvider';
import { WQFileWatcher } from './providers/WQFileWatcher';
import { WQWebviewProvider } from './providers/WQWebviewProvider';
import type { GroupingMode } from './models/WQItem';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Always register tree views so the activity bar container appears.
  // If no workspace is open, show empty placeholder views.
  if (!workspaceRoot) {
    const emptyProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
      getTreeItem: (el) => el,
      getChildren: () => [],
    };
    context.subscriptions.push(
      vscode.window.createTreeView('wqItems', { treeDataProvider: emptyProvider }),
      vscode.window.createTreeView('wqActiveWork', { treeDataProvider: emptyProvider }),
    );
    return;
  }

  const handoffsDir = path.join(workspaceRoot, 'documents', 'handoffs');

  // Services
  const dataService = new WQDataService(handoffsDir);
  const claudeService = new ClaudeCodeService(workspaceRoot);

  // Restore persisted grouping
  const savedGrouping = context.workspaceState.get<GroupingMode>('purr-wq.grouping', 'phase');

  // Tree providers
  const itemsProvider = new WQTreeProvider(dataService, savedGrouping);
  const activeProvider = new WQActiveTreeProvider(dataService);

  // Webview provider
  const webviewProvider = new WQWebviewProvider(context.extensionUri, dataService, claudeService);

  // Register tree views
  const itemsView = vscode.window.createTreeView('wqItems', {
    treeDataProvider: itemsProvider,
    showCollapseAll: true,
  });
  const activeView = vscode.window.createTreeView('wqActiveWork', {
    treeDataProvider: activeProvider,
  });

  // File watcher with debounced refresh
  const fileWatcher = new WQFileWatcher(workspaceRoot, () => {
    dataService.reload();
    itemsProvider.refresh();
    activeProvider.refresh();
    webviewProvider.pushDataUpdate();
  });

  // Helper: extract WQItem from a tree item (works for both providers)
  const getItem = (treeItem: any) => {
    return treeItem && 'wqItem' in treeItem ? treeItem.wqItem : undefined;
  };

  // --- P0 Commands ---

  const refreshCmd = vscode.commands.registerCommand('purr-wq.refresh', () => {
    dataService.reload();
    itemsProvider.refresh();
    activeProvider.refresh();
  });

  const groupByPhaseCmd = vscode.commands.registerCommand('purr-wq.groupByPhase', () => {
    setGrouping('phase', context, itemsProvider);
  });

  const groupByStatusCmd = vscode.commands.registerCommand('purr-wq.groupByStatus', () => {
    setGrouping('status', context, itemsProvider);
  });

  const groupByTrackCmd = vscode.commands.registerCommand('purr-wq.groupByTrack', () => {
    setGrouping('track', context, itemsProvider);
  });

  const groupByGradeCmd = vscode.commands.registerCommand('purr-wq.groupByGrade', () => {
    setGrouping('grade', context, itemsProvider);
  });

  const openSpecCmd = vscode.commands.registerCommand('purr-wq.openSpec', (treeItem: WQTreeItem) => {
    const item = treeItem?.wqItem;
    if (!item || item.documents.length === 0) {
      vscode.window.showInformationMessage(`No documents linked to ${item?.id || 'this item'}.`);
      return;
    }

    // Open the first document (usually the primary spec/brief)
    const doc = item.documents[0];
    const resolved = dataService.resolveDocumentPath(doc);
    if (resolved) {
      vscode.workspace.openTextDocument(resolved).then(
        d => vscode.window.showTextDocument(d),
        () => vscode.window.showErrorMessage(`Could not open: ${doc.path}`),
      );
    } else {
      vscode.window.showErrorMessage(`File not found: ${doc.path}`);
    }
  });

  const openWorklistCmd = vscode.commands.registerCommand('purr-wq.openWorklist', (treeItem: WQTreeItem) => {
    const item = treeItem?.wqItem;
    if (!item) { return; }

    const wlPath = dataService.resolveWorklistPath(item.id);
    if (wlPath) {
      vscode.workspace.openTextDocument(wlPath).then(
        d => vscode.window.showTextDocument(d),
        () => vscode.window.showErrorMessage(`Could not open worklist for ${item.id}.`),
      );
    } else {
      vscode.window.showInformationMessage(`No worklist found for ${item.id}.`);
    }
  });

  const copyIdCmd = vscode.commands.registerCommand('purr-wq.copyId', (treeItem: WQTreeItem) => {
    const item = treeItem?.wqItem;
    if (item) {
      vscode.env.clipboard.writeText(item.id);
      vscode.window.showInformationMessage(`Copied ${item.id} to clipboard.`);
    }
  });

  const filterCmd = vscode.commands.registerCommand('purr-wq.filterItems', async () => {
    const current = itemsProvider.getFilter();
    const input = await vscode.window.showInputBox({
      prompt: 'Filter WQ items by title, tags, or ID',
      value: current,
      placeHolder: 'e.g. "dashboard", "WQ-065", "frontend"',
    });
    if (input !== undefined) {
      itemsProvider.setFilter(input);
      // Update tree view title to show active filter
      if (input) {
        itemsView.title = `Items (filtered: "${input}")`;
      } else {
        itemsView.title = 'Items';
      }
    }
  });

  const clearFilterCmd = vscode.commands.registerCommand('purr-wq.clearFilter', () => {
    itemsProvider.setFilter('');
    itemsView.title = 'Items';
  });

  // --- P1 Commands: Status Changes ---

  const startWorkCmd = vscode.commands.registerCommand('purr-wq.startWork', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.changeStatus(item.id, 'active'); }
  });

  const markReadyCmd = vscode.commands.registerCommand('purr-wq.markReady', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.changeStatus(item.id, 'ready'); }
  });

  const markBlockedCmd = vscode.commands.registerCommand('purr-wq.markBlocked', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.changeStatus(item.id, 'blocked'); }
  });

  const markDoneCmd = vscode.commands.registerCommand('purr-wq.markDone', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.changeStatus(item.id, 'done'); }
  });

  const archiveCmd = vscode.commands.registerCommand('purr-wq.archive', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.changeStatus(item.id, 'archive'); }
  });

  // --- P1 Commands: Agent Delegation ---

  const delegateExploreCmd = vscode.commands.registerCommand('purr-wq.delegateExplore', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.delegateExplore(item); }
  });

  const delegatePlanCmd = vscode.commands.registerCommand('purr-wq.delegatePlan', (treeItem: WQTreeItem) => {
    const item = getItem(treeItem);
    if (item) { claudeService.delegatePlan(item); }
  });

  const delegateTriageCmd = vscode.commands.registerCommand('purr-wq.delegateTriage', () => {
    claudeService.delegateTriage();
  });

  // --- P2 Commands: Webview Board ---

  const openBoardCmd = vscode.commands.registerCommand('purr-wq.openBoard', () => {
    webviewProvider.open();
  });

  // Push all disposables
  context.subscriptions.push(
    itemsView,
    activeView,
    fileWatcher,
    claudeService,
    refreshCmd,
    groupByPhaseCmd,
    groupByStatusCmd,
    groupByTrackCmd,
    groupByGradeCmd,
    openSpecCmd,
    openWorklistCmd,
    copyIdCmd,
    filterCmd,
    clearFilterCmd,
    startWorkCmd,
    markReadyCmd,
    markBlockedCmd,
    markDoneCmd,
    archiveCmd,
    delegateExploreCmd,
    delegatePlanCmd,
    delegateTriageCmd,
    openBoardCmd,
    webviewProvider,
  );
}

function setGrouping(
  mode: GroupingMode,
  context: vscode.ExtensionContext,
  provider: WQTreeProvider,
): void {
  provider.setGrouping(mode);
  context.workspaceState.update('purr-wq.grouping', mode);
}

export function deactivate(): void {
  // Cleanup handled by subscriptions
}
