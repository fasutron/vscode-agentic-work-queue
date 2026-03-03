// Handles WQ actions via direct CLI for status changes, and clipboard + CC sidebar
// for agent delegation (since the CC extension has no public sendMessage API).
//
// Routing:
//   - All status changes: Direct CLI (node wq-cli.js)
//   - Agent delegation: Copy prompt to clipboard + open CC sidebar

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';
import type { WQItem } from '../models/WQItem';

export class ClaudeCodeService implements vscode.Disposable {
  private outputChannel: vscode.OutputChannel;
  private workspaceRoot: string;
  private cliPath: string;

  constructor(workspaceRoot: string) {
    this.outputChannel = vscode.window.createOutputChannel('Agentic WQ');
    this.workspaceRoot = workspaceRoot;
    this.cliPath = path.join(workspaceRoot, 'documents', 'wq-system', 'wq-cli.js');
  }

  /**
   * Change WQ item status. Always uses direct CLI.
   */
  async changeStatus(wqId: string, newStatus: string): Promise<boolean> {
    return this.runCli(wqId, newStatus);
  }

  /**
   * Delegate to Claude Code: copies prompt to clipboard and opens CC sidebar.
   */
  async delegateExplore(item: WQItem): Promise<void> {
    const docList = item.documents.length > 0
      ? `Read the linked documents: ${item.documents.map(d => d.path).join(', ')}.`
      : '';
    const prompt = [
      `Explore ${item.id}: ${item.title}`,
      '',
      `Use the Explore agent to analyze the codebase for ${item.id}: ${item.title}.`,
      docList,
      'Identify implementation approach, affected files, dependencies, and risks.',
      'Provide a summary suitable for an implementation handoff.',
    ].filter(Boolean).join('\n');

    await this.sendViaCCClipboard(prompt, `Explore ${item.id}`);
  }

  async delegatePlan(item: WQItem): Promise<void> {
    const docList = item.documents.length > 0
      ? `Read the linked documents: ${item.documents.map(d => d.path).join(', ')}.`
      : '';
    const prompt = [
      `Plan ${item.id}: ${item.title}`,
      '',
      `Use the Plan agent to create an implementation plan for ${item.id}: ${item.title}.`,
      docList,
      'Produce a step-by-step implementation plan with file paths and estimated effort.',
    ].filter(Boolean).join('\n');

    await this.sendViaCCClipboard(prompt, `Plan ${item.id}`);
  }

  /**
   * Edit a WQ item field via CLI (track, phase, priority, effort, etc.)
   */
  async editField(wqId: string, field: string, value: string): Promise<boolean> {
    return new Promise((resolve) => {
      const label = `${wqId} --${field}=${value}`;
      execFile('node', [this.cliPath, 'edit', wqId, `--${field}=${value}`], {
        cwd: this.workspaceRoot,
        timeout: 15000,
      }, (error, stdout, stderr) => {
        if (error) {
          const msg = stderr || error.message;
          vscode.window.showErrorMessage(`WQ edit failed: ${msg}`);
          this.outputChannel.appendLine(`[CLI ERROR] ${label}: ${msg}`);
          resolve(false);
        } else {
          this.outputChannel.appendLine(`[CLI] ${label}: ${stdout.trim()}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Create a new WQ item via CLI.
   */
  async createItem(title: string, track: string, phase: string): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('node', [this.cliPath, 'create', title, `--track=${track}`, `--phase=${phase}`], {
        cwd: this.workspaceRoot,
        timeout: 15000,
      }, (error, stdout, stderr) => {
        if (error) {
          const msg = stderr || error.message;
          vscode.window.showErrorMessage(`WQ create failed: ${msg}`);
          this.outputChannel.appendLine(`[CLI ERROR] create: ${msg}`);
          resolve(false);
        } else {
          this.outputChannel.appendLine(`[CLI] create: ${stdout.trim()}`);
          resolve(true);
        }
      });
    });
  }

  async delegateTriage(phase?: string): Promise<void> {
    const filter = phase || 'planning';
    const prompt = `/project:wq triage ${filter}`;
    await this.sendViaCCClipboard(prompt, `Triage ${filter}`);
  }

  // --- Private: Direct CLI execution ---

  private async runCli(wqId: string, newStatus: string): Promise<boolean> {
    return new Promise((resolve) => {
      const label = `${wqId} → ${newStatus}`;

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `WQ: ${label}` },
        () => new Promise<void>((done) => {
          execFile('node', [this.cliPath, 'status', wqId, newStatus], {
            cwd: this.workspaceRoot,
            timeout: 15000,
          }, (error, stdout, stderr) => {
            if (error) {
              const msg = stderr || error.message;
              vscode.window.showErrorMessage(`WQ status change failed: ${msg}`);
              this.outputChannel.appendLine(`[CLI ERROR] ${label}: ${msg}`);
              resolve(false);
            } else {
              this.outputChannel.appendLine(`[CLI] ${label}: ${stdout.trim()}`);
              resolve(true);
            }
            done();
          });
        }),
      );
    });
  }

  // --- Private: Clipboard + CC sidebar ---

  private async sendViaCCClipboard(prompt: string, label: string): Promise<void> {
    this.outputChannel.appendLine(`\n--- ${label} ---`);
    this.outputChannel.appendLine(`> ${prompt}`);

    await vscode.env.clipboard.writeText(prompt);

    // Optionally open the CC sidebar
    const openSidebar = vscode.workspace.getConfiguration('purr-wq').get<boolean>('openCCSidebar', false);
    if (openSidebar) {
      try {
        await vscode.commands.executeCommand('claude-vscode.sidebar.open');
      } catch {
        // CC extension not installed — skip silently
      }
    }

  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}
