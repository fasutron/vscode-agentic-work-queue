// File system watchers for work_queue.json and *WORKLIST*.md files.
// Triggers a debounced callback on any change to keep TreeViews in sync.

import * as vscode from 'vscode';

export class WQFileWatcher implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private onChange: () => void;
  private debounceMs: number;

  constructor(workspaceRoot: string, onChange: () => void, debounceMs = 300) {
    this.onChange = onChange;
    this.debounceMs = debounceMs;

    // Watch work_queue.json
    const wqPattern = new vscode.RelativePattern(
      workspaceRoot,
      'documents/handoffs/work_queue.json',
    );
    const wqWatcher = vscode.workspace.createFileSystemWatcher(wqPattern);
    wqWatcher.onDidChange(() => this.debouncedRefresh());

    // Watch all WORKLIST files (create/change/delete)
    const wlPattern = new vscode.RelativePattern(
      workspaceRoot,
      'documents/handoffs/**/*WORKLIST*.md',
    );
    const wlWatcher = vscode.workspace.createFileSystemWatcher(wlPattern);
    wlWatcher.onDidChange(() => this.debouncedRefresh());
    wlWatcher.onDidCreate(() => this.debouncedRefresh());
    wlWatcher.onDidDelete(() => this.debouncedRefresh());

    this.watchers = [wqWatcher, wlWatcher];
  }

  private debouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.onChange();
    }, this.debounceMs);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watchers.forEach(w => w.dispose());
  }
}
