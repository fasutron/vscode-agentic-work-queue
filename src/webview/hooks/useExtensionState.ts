// Custom hook: subscribes to postMessage state from the extension host.

import { useState, useEffect, useCallback } from 'react';
import type { WQItem, WQSettings } from '../../models/WQItem';
import { DEFAULT_SETTINGS } from '../../models/defaultSettings';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage, WorklistSummary, WorklistDetailView } from '../types';

// acquireVsCodeApi can only be called once per webview lifecycle.
const vscode = (globalThis as any).acquireVsCodeApi();

export function postToExtension(msg: WebviewToExtensionMessage): void {
  vscode.postMessage(msg);
}

export interface ExtensionState {
  items: WQItem[];
  worklists: WorklistSummary[];
  settings: WQSettings;
  worklistDetail: WorklistDetailView | null;
  loading: boolean;
  toast: string | null;
}

export function useExtensionState(): ExtensionState {
  const [items, setItems] = useState<WQItem[]>([]);
  const [worklists, setWorklists] = useState<WorklistSummary[]>([]);
  const [settings, setSettings] = useState<WQSettings>(DEFAULT_SETTINGS);
  const [worklistDetail, setWorklistDetail] = useState<WorklistDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      // Guard: ignore messages that aren't ours (VS Code internal messages, etc.)
      if (!msg || typeof msg.type !== 'string') { return; }
      try {
        switch (msg.type) {
          case 'init':
          case 'dataUpdate':
            if (msg.data?.items) {
              setItems(msg.data.items);
              setWorklists(msg.data.worklists ?? []);
              if (msg.data.settings) { setSettings(msg.data.settings); }
              setLoading(false);
            }
            break;
          case 'toast':
            if (msg.data?.message) {
              setToast(msg.data.message);
              setTimeout(() => setToast(null), 3000);
            }
            break;
          case 'worklistDetail':
            setWorklistDetail(msg.data ?? null);
            break;
          case 'statusChangeResult':
            // Handled silently — data refresh comes via dataUpdate
            break;
        }
      } catch {
        // Swallow unexpected message shapes to prevent React crashes
      }
    };

    window.addEventListener('message', handler);
    // Signal to extension that the webview is ready to receive data.
    postToExtension({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  return { items, worklists, settings, worklistDetail, loading, toast };
}

/** Get worklist progress for a specific WQ item. */
export function useWorklist(wqId: string, worklists: WorklistSummary[]): WorklistSummary | undefined {
  return worklists.find(w => w.wqId.toUpperCase() === wqId.toUpperCase());
}
