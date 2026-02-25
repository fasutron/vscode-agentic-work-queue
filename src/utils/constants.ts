// Shared constants and settings-derived helpers for the WQ sidebar extension.

import * as vscode from 'vscode';
import type { WQSettings } from '../models/WQItem';

// System statuses get specific icons; user-defined statuses get circle-outline.
const SYSTEM_STATUS_ICONS: Record<string, (color?: vscode.ThemeColor) => vscode.ThemeIcon> = {
  intake:  () => new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground')),
  ready:   () => new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue')),
  active:  () => new vscode.ThemeIcon('play', new vscode.ThemeColor('charts.green')),
  blocked: () => new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
  done:    () => new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
  archive: () => new vscode.ThemeIcon('archive', new vscode.ThemeColor('disabledForeground')),
};

/** Get icon for a status ID. System statuses have specific icons; user statuses get circle-outline. */
export function getStatusIcon(statusId: string): vscode.ThemeIcon {
  const factory = SYSTEM_STATUS_ICONS[statusId];
  return factory ? factory() : new vscode.ThemeIcon('circle-outline');
}

/** Get ordered ID arrays from settings. */
export function getOrderedIds(settings: WQSettings): { statuses: string[]; phases: string[]; tracks: string[] } {
  return {
    statuses: settings.statuses.map(s => s.id),
    phases: settings.phases.map(p => p.id),
    tracks: settings.tracks.map(t => t.id),
  };
}

/** Get label maps from settings. */
export function getLabels(settings: WQSettings): { statuses: Record<string, string>; phases: Record<string, string>; tracks: Record<string, string> } {
  return {
    statuses: Object.fromEntries(settings.statuses.map(s => [s.id, s.label])),
    phases: Object.fromEntries(settings.phases.map(p => [p.id, p.label])),
    tracks: Object.fromEntries(settings.tracks.map(t => [t.id, t.label])),
  };
}

// Regex for extracting WQ IDs from WORKLIST filenames (e.g. WQ155, WQ-088)
export const WORKLIST_ID_FILENAME_REGEX = /WQ[_-]?(\d+)/i;

// Regex for matching the WQ Item header line in WORKLIST markdown
export const WORKLIST_HEADER_REGEX = /^\*\*WQ\s+Items?:\*\*\s*(.+)$/m;

// Regex for extracting all WQ-NNN patterns from a string
export const WQ_ID_EXTRACT_REGEX = /WQ-(\d+)/g;
