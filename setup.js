#!/usr/bin/env node
// Setup script for the PURR Work Queue system.
// Copies the WQ CLI, starter data, and Claude Code skills into a target project.
//
// Usage:
//   node setup.js /path/to/your-project
//   node setup.js                          # defaults to current working directory

const fs = require('fs');
const path = require('path');

const targetRoot = path.resolve(process.argv[2] || process.cwd());
const sourceRoot = __dirname;

console.log(`\nPURR Work Queue — Setup`);
console.log(`Target project: ${targetRoot}\n`);

if (!fs.existsSync(targetRoot)) {
  console.error(`Error: Target directory does not exist: ${targetRoot}`);
  process.exit(1);
}

// Directories to create
const dirs = [
  'documents/handoffs/1-pending',
  'documents/handoffs/2-in_progress',
  'documents/handoffs/3-completed',
  'documents/wq-system',
  '.claude/commands',
];

// Files to copy: [source relative to this repo, destination relative to target]
const files = [
  ['documents/wq-system/wq-cli.js', 'documents/wq-system/wq-cli.js'],
  ['documents/wq-system/README.md', 'documents/wq-system/README.md'],
  ['documents/wq-system/triage-criteria.md', 'documents/wq-system/triage-criteria.md'],
  ['.claude/commands/wq.md', '.claude/commands/wq.md'],
  ['.claude/commands/wl.md', '.claude/commands/wl.md'],
];

// Starter work_queue.json (only created if none exists)
const starterWQ = {
  version: '1.0.0',
  lastModified: new Date().toISOString(),
  settings: {
    statuses: [
      { id: 'intake', label: 'Intake', system: true, folder: '1-pending', color: '#e5c07b' },
      { id: 'ready', label: 'Ready', folder: '1-pending', color: '#9ca3af' },
      { id: 'active', label: 'Active', system: true, folder: '2-in_progress', color: '#61afef' },
      { id: 'blocked', label: 'Blocked', folder: '2-in_progress', color: '#e06c75' },
      { id: 'done', label: 'Done', system: true, folder: '3-completed', color: '#98c379' },
      { id: 'archive', label: 'Archive', system: true, folder: '3-completed', color: '#5c6370' },
    ],
    phases: [
      { id: 'planning', label: 'Planning', color: '#e5c07b' },
      { id: 'development', label: 'Development', color: '#61afef' },
      { id: 'testing', label: 'Testing', color: '#9ca3af' },
      { id: 'production', label: 'Production', color: '#98c379' },
    ],
    tracks: [
      { id: 'frontend', label: 'Frontend', color: '#3b82f6' },
      { id: 'backend', label: 'Backend', color: '#22c55e' },
      { id: 'infra', label: 'Infra', color: '#f97316' },
      { id: 'docs', label: 'Docs', color: '#a855f7' },
    ],
    transitions: {
      intake: ['ready', 'active'],
      ready: ['active'],
      active: ['blocked', 'done'],
      blocked: ['active'],
      done: ['archive'],
    },
  },
  items: [],
};

let created = 0;
let skipped = 0;

// Create directories
for (const dir of dirs) {
  const fullPath = path.join(targetRoot, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  Created: ${dir}/`);
    created++;
  } else {
    console.log(`  Exists:  ${dir}/`);
    skipped++;
  }
}

// Copy files (skip if already exists)
for (const [src, dest] of files) {
  const srcPath = path.join(sourceRoot, src);
  const destPath = path.join(targetRoot, dest);

  if (!fs.existsSync(srcPath)) {
    console.log(`  Missing: ${src} (not found in repo — skipping)`);
    continue;
  }

  if (fs.existsSync(destPath)) {
    console.log(`  Exists:  ${dest}`);
    skipped++;
  } else {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copied:  ${dest}`);
    created++;
  }
}

// Create starter work_queue.json if none exists
const wqPath = path.join(targetRoot, 'documents/handoffs/work_queue.json');
if (!fs.existsSync(wqPath)) {
  fs.writeFileSync(wqPath, JSON.stringify(starterWQ, null, 2) + '\n');
  console.log(`  Created: documents/handoffs/work_queue.json`);
  created++;
} else {
  console.log(`  Exists:  documents/handoffs/work_queue.json`);
  skipped++;
}

// Create .gitkeep files in empty handoff folders
for (const sub of ['1-pending', '2-in_progress', '3-completed']) {
  const keepPath = path.join(targetRoot, 'documents/handoffs', sub, '.gitkeep');
  if (!fs.existsSync(keepPath)) {
    const dirContents = fs.readdirSync(path.join(targetRoot, 'documents/handoffs', sub));
    if (dirContents.length === 0) {
      fs.writeFileSync(keepPath, '');
      // Don't count this — it's a minor side effect
    }
  }
}

console.log(`\nDone! Created ${created} items, skipped ${skipped} existing.`);
console.log(`\nNext steps:`);
console.log(`  1. Install the VS Code extension:`);
console.log(`     code --install-extension purr-wq-viewer-0.9.0.vsix`);
console.log(`  2. Open your project in VS Code`);
console.log(`  3. Look for "Work Queue" in the sidebar`);
console.log(`  4. Create your first item:`);
console.log(`     node documents/wq-system/wq-cli.js create "My Feature" --track=frontend --phase=development`);
