// Default settings when work_queue.json has no settings block.
// This is the single fallback source — all consumers import from here.

import type { WQSettings } from './WQItem';

export const DEFAULT_SETTINGS: WQSettings = {
  statuses: [
    { id: 'intake', label: 'Intake', system: true, folder: '1-pending', color: '#e5c07b' },
    { id: 'ready', label: 'Ready', folder: '1-pending', color: '#9ca3af' },
    { id: 'active', label: 'Active', system: true, folder: '2-in_progress', color: '#61afef' },
    { id: 'blocked', label: 'Blocked', folder: '2-in_progress', color: '#e06c75' },
    { id: 'done', label: 'Done', system: true, folder: '3-completed', color: '#98c379' },
    { id: 'archive', label: 'Archive', system: true, folder: '3-completed', color: '#5c6370' },
  ],
  phases: [
    { id: 'pre-beta', label: 'Pre-Beta', color: '#e5c07b' },
    { id: 'beta', label: 'Beta', color: '#61afef' },
    { id: 'post-beta', label: 'Post-Beta', color: '#9ca3af' },
    { id: 'production', label: 'Production', color: '#98c379' },
  ],
  tracks: [
    { id: 'player', label: 'Player', color: '#3b82f6' },
    { id: 'coach', label: 'Coach', color: '#22c55e' },
    { id: 'quiz', label: 'Quiz', color: '#a855f7' },
    { id: 'infra', label: 'Infra', color: '#f97316' },
    { id: 'platform', label: 'Platform', color: '#6b7280' },
    { id: 'production', label: 'Production', color: '#ef4444' },
  ],
  transitions: {
    intake: ['ready', 'active'],
    ready: ['active'],
    active: ['blocked', 'done'],
    blocked: ['active'],
    done: ['archive'],
  },
};
