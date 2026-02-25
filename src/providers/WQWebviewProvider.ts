// Manages the WebviewPanel lifecycle, HTML shell generation, and
// bidirectional message routing between extension host and webview.

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { WQDataService } from '../services/WQDataService';
import { ClaudeCodeService } from '../services/ClaudeCodeService';
import type { WQItem, WQSettings } from '../models/WQItem';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage, WorklistSummary, WorklistDetailView, WorklistTaskView } from '../webview/types';

export class WQWebviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private extensionUri: vscode.Uri,
    private dataService: WQDataService,
    private claudeService: ClaudeCodeService,
  ) {}

  /** Open or reveal the webview panel. */
  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'purrWqBoard',
      'Work Queue',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'media'),
        ],
      },
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'wq-icon.svg');
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtensionMessage) => this.handleMessage(msg),
      undefined,
      this.disposables,
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      for (const d of this.disposables) { d.dispose(); }
      this.disposables = [];
    });
  }

  /** Push updated data to the webview (called by file watcher). */
  pushDataUpdate(): void {
    this.postMessage({ type: 'dataUpdate', data: this.buildPayload() });
  }

  dispose(): void {
    this.panel?.dispose();
  }

  // --- Private ---

  private handleMessage(msg: WebviewToExtensionMessage): void {
    switch (msg.type) {
      case 'ready':
        this.postMessage({ type: 'init', data: this.buildPayload() });
        break;

      case 'changeStatus': {
        const { itemId, newStatus } = msg.data;
        this.claudeService.changeStatus(itemId, newStatus).then(success => {
          this.postMessage({ type: 'statusChangeResult', data: { itemId, success } });
          if (success) {
            const toastMsg = newStatus === 'active'
              ? `${itemId} started — prompt copied to clipboard. Paste into Claude Code.`
              : `${itemId} → ${newStatus}`;
            this.postMessage({ type: 'toast', data: { message: toastMsg } });
          }
        });
        break;
      }

      case 'openSpec': {
        const item = this.dataService.getItemById(msg.data.itemId);
        if (item && item.documents.length > 0) {
          const resolved = this.dataService.resolveDocumentPath(item.documents[0]);
          if (resolved) {
            vscode.workspace.openTextDocument(resolved).then(
              doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside),
              () => vscode.window.showErrorMessage(`Could not open: ${item.documents[0].path}`),
            );
          } else {
            vscode.window.showErrorMessage(`File not found: ${item.documents[0].path}`);
          }
        } else {
          vscode.window.showInformationMessage(`No documents linked to ${msg.data.itemId}.`);
        }
        break;
      }

      case 'openWorklist': {
        const wlPath = this.dataService.resolveWorklistPath(msg.data.itemId);
        if (wlPath) {
          vscode.workspace.openTextDocument(wlPath).then(
            doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside),
            () => vscode.window.showErrorMessage(`Could not open worklist for ${msg.data.itemId}.`),
          );
        } else {
          vscode.window.showInformationMessage(`No worklist found for ${msg.data.itemId}.`);
        }
        break;
      }

      case 'copyId':
        vscode.env.clipboard.writeText(msg.data.itemId);
        this.postMessage({ type: 'toast', data: { message: `Copied ${msg.data.itemId}` } });
        break;

      case 'editField': {
        const { itemId, field, value } = msg.data;
        this.claudeService.editField(itemId, field, value).then(success => {
          if (success) {
            this.postMessage({ type: 'toast', data: { message: `${itemId} ${field} → ${value}` } });
            // Refresh data after edit
            setTimeout(() => this.pushDataUpdate(), 300);
          }
        });
        break;
      }

      case 'delegateExplore': {
        const item = this.dataService.getItemById(msg.data.itemId);
        if (item) {
          this.claudeService.delegateExplore(item);
          this.postMessage({ type: 'toast', data: { message: 'Explore prompt copied — paste into Claude Code.' } });
        }
        break;
      }

      case 'delegatePlan': {
        const item = this.dataService.getItemById(msg.data.itemId);
        if (item) {
          this.claudeService.delegatePlan(item);
          this.postMessage({ type: 'toast', data: { message: 'Plan prompt copied — paste into Claude Code.' } });
        }
        break;
      }

      case 'saveSettings': {
        this.dataService.saveSettings(msg.data.settings);
        this.postMessage({ type: 'toast', data: { message: 'Settings saved' } });
        // File watcher will trigger a full reload, but push immediately for snappy UI
        setTimeout(() => this.pushDataUpdate(), 200);
        break;
      }

      case 'requestWorklistDetail': {
        const detail = this.buildWorklistDetail(msg.data.wqId);
        this.postMessage({ type: 'worklistDetail', data: detail });
        break;
      }

      case 'saveWorklistTasks': {
        const { wqId, sections } = msg.data;
        const parsed = this.dataService.getWorklistDetail(wqId);
        if (parsed) {
          // Patch checklist sections with updated tasks from webview
          for (const incoming of sections) {
            const target = parsed.sections.find(s => s.heading === incoming.heading);
            if (!target) { continue; }
            // Rebuild items: replace tasks with incoming order, keep raw lines at end
            const rawLines = target.items.filter(i => 'type' in i && i.type === 'raw');
            const newItems: typeof target.items = incoming.tasks.map(t => ({
              id: t.id,
              text: t.text,
              checked: t.checked,
              section: incoming.heading,
            }));
            // Append raw lines after tasks
            target.items = [...newItems, ...rawLines];
          }
          const success = this.dataService.saveWorklistDetail(wqId, parsed);
          if (success) {
            this.postMessage({ type: 'toast', data: { message: 'Worklist saved' } });
            // Refresh aggregate counts after a short delay
            setTimeout(() => this.pushDataUpdate(), 300);
          }
        }
        break;
      }

      case 'showNotification': {
        const { message, kind } = msg.data;
        if (kind === 'error') { vscode.window.showErrorMessage(message); }
        else if (kind === 'warning') { vscode.window.showWarningMessage(message); }
        else { vscode.window.showInformationMessage(message); }
        break;
      }
    }
  }

  private buildPayload(): { items: WQItem[]; worklists: WorklistSummary[]; settings: WQSettings } {
    const items = this.dataService.getItems();
    const settings = this.dataService.getSettings();
    const worklists: WorklistSummary[] = [];

    for (const item of items) {
      const mapping = this.dataService.getWorklistForItem(item.id);
      if (mapping && mapping.progress.total > 0) {
        worklists.push({
          wqId: item.id,
          completed: mapping.progress.completed,
          pending: mapping.progress.pending,
          total: mapping.progress.total,
        });
      }
    }

    return { items, worklists, settings };
  }

  /** Convert a ParsedWorklist to a webview-safe WorklistDetailView. */
  private buildWorklistDetail(wqId: string): WorklistDetailView | null {
    const parsed = this.dataService.getWorklistDetail(wqId);
    if (!parsed) { return null; }

    const sections: WorklistDetailView['sections'] = [];
    for (const section of parsed.sections) {
      // Only include sections that have checkbox tasks
      const tasks: WorklistTaskView[] = [];
      for (const item of section.items) {
        if ('type' in item && item.type === 'raw') { continue; }
        const task = item as import('../models/WQItem').WorklistTask;
        tasks.push({
          id: task.id,
          text: task.text,
          checked: task.checked,
          section: section.heading,
        });
      }
      if (tasks.length > 0) {
        sections.push({ heading: section.heading, tasks });
      }
    }

    return { wqId, title: parsed.title, sections };
  }

  private postMessage(msg: ExtensionToWebviewMessage): void {
    this.panel?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css'),
    );
    const bundledCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.css'),
    );

    const dynamicCss = this.buildDynamicCss();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${bundledCssUri}">
  <link rel="stylesheet" href="${cssUri}">
  <style>${dynamicCss}</style>
  <title>Work Queue</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /** Generate CSS variables and utility classes from settings. */
  private buildDynamicCss(): string {
    const settings = this.dataService.getSettings();
    const lines: string[] = [':root {'];

    for (const s of settings.statuses) {
      lines.push(`  --wq-status-${s.id}: ${s.color};`);
    }
    for (const t of settings.tracks) {
      lines.push(`  --wq-track-${t.id}: ${t.color};`);
    }
    for (const p of settings.phases) {
      lines.push(`  --wq-phase-${p.id}: ${p.color};`);
    }

    lines.push('}');

    // Status badge utility classes
    for (const s of settings.statuses) {
      lines.push(`.status-${s.id} { background: color-mix(in srgb, var(--wq-status-${s.id}) 20%, transparent); color: var(--wq-status-${s.id}); }`);
    }
    // Track dot utility classes
    for (const t of settings.tracks) {
      lines.push(`.track-dot-${t.id} { background: var(--wq-track-${t.id}); }`);
    }

    return lines.join('\n');
  }
}
