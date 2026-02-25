// CSS class mappings for WQ status and track colors.
// Uses CSS custom properties defined in media/webview.css.

import type { WQStatus, WQTrack } from '../../models/WQItem';

export function statusClass(status: WQStatus | string): string {
  return `status-${status}`;
}

export function trackDotClass(track: WQTrack | string): string {
  return `track-dot-${track}`;
}

export function trackClass(track: WQTrack | string): string {
  return `track-${track}`;
}
