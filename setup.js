#!/usr/bin/env node
// Setup script for the Agentic Work Queue system.
// Scaffolds the WQ directory structure, CLI, and Claude Code skills into a project,
// then installs the VS Code extension (pre-built VSIX or compile from source).
//
// Usage:
//   node setup.js /path/to/your-project
//   node setup.js                          # defaults to current working directory
//   node setup.js --install-only           # skip project scaffolding, just install the extension
//   node setup.js --no-install             # scaffold only, skip extension install
//   node setup.js --no-agents             # skip AGENTS.md integration

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const sourceRoot = __dirname;
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));
const targetRoot = path.resolve(positional[0] || process.cwd());

const installOnly = flags.includes('--install-only');
const noInstall = flags.includes('--no-install');
const noAgents = flags.includes('--no-agents');

// ============================================================
// Helpers
// ============================================================

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function findVsix() {
  const files = fs.readdirSync(sourceRoot).filter(f => f.endsWith('.vsix'));
  if (files.length === 0) return null;
  // Return the newest VSIX by sorting version numbers descending
  files.sort().reverse();
  return files[0];
}

function runCmd(cmd, label) {
  console.log(`  Running: ${label || cmd}`);
  try {
    execSync(cmd, { cwd: sourceRoot, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// AGENTS.md Integration
// ============================================================

const AWQ_START = '<!-- AWQ:START -->';
const AWQ_END = '<!-- AWQ:END -->';

function getAgentsBlock() {
  return `${AWQ_START}
## Agentic Work Queue

This project uses the [Agentic Work Queue](https://github.com/fasutron/vscode-agentic-work-queue) system for task tracking.

### CLI Tool

All work queue operations go through the CLI — do NOT edit \`work_queue.json\` directly.

\`\`\`bash
node documents/wq-system/wq-cli.js <command> [args] [options]
\`\`\`

| Command | Usage | Description |
|---------|-------|-------------|
| \`create\` | \`create "Title" --track=X --phase=Y\` | Create new item |
| \`status\` | \`status WQ-001 active\` | Change status (auto-moves files) |
| \`edit\` | \`edit WQ-001 --priority=5\` | Update item fields |
| \`view\` | \`view WQ-001\` | View item details |
| \`list\` | \`list [filter]\` | List items by status/track/phase |
| \`deps\` | \`deps WQ-001\` | Show dependencies |
| \`find\` | \`find SPEC_Feature.md\` | Find WQ item by document |
| \`next-id\` | \`next-id\` | Show next available ID |
| \`normalize\` | \`normalize\` | Fix document paths (idempotent) |

### Status-Folder Mapping

| Status | Folder | Description |
|--------|--------|-------------|
| \`intake\`, \`ready\` | \`1-pending/\` | Items awaiting or ready for work |
| \`active\`, \`blocked\` | \`2-in_progress/\` | Currently active or blocked items |
| \`done\`, \`archive\` | \`3-completed/\` | Finished or archived items |

### Directory Structure

\`\`\`
documents/
├── handoffs/
│   ├── 1-pending/          # intake + ready items
│   ├── 2-in_progress/      # active + blocked items
│   ├── 3-completed/        # done + archived items
│   └── work_queue.json     # work queue data (use CLI, not direct edits)
└── wq-system/
    ├── wq-cli.js           # CLI tool (zero external deps)
    └── triage-criteria.md  # Agent-readiness scoring rubric
\`\`\`

### Worklist Files

When a WQ item becomes \`active\`, create a \`*_WORKLIST.md\` file to track session progress:

\`\`\`markdown
# [Feature] WORKLIST
**WQ Item:** WQ-XXX
## Completed
## In Progress
- [ ] Current task
## Deferred
\`\`\`

Use \`- [x]\` for completed tasks, \`- [ ]\` for pending tasks.

### Test Plans

Test plans use checklist format for interactive editing in the VS Code extension:

\`\`\`markdown
# [Feature] TEST PLAN
**WQ Item:** WQ-XXX
## Smoke Tests
- [ ] Feature loads without errors
## Functional Tests
- [ ] Primary flow works end-to-end
\`\`\`

Use \`- [x]\` for passed, \`- [ ]\` for pending, \`- [!]\` for failed tests.

### Key Rules

1. **Never edit \`work_queue.json\` directly** — always use the CLI
2. **Never manually move handoff files** — the CLI auto-syncs folders on status change
3. **Check valid options first** — tracks, phases, and statuses are project-specific (stored in \`work_queue.json\` settings)
${AWQ_END}`;
}

function appendAgentsMd() {
  const agentsPath = path.join(targetRoot, 'AGENTS.md');
  const block = getAgentsBlock();

  if (fs.existsSync(agentsPath)) {
    const existing = fs.readFileSync(agentsPath, 'utf8');

    if (existing.includes(AWQ_START)) {
      // Replace existing block
      const regex = new RegExp(`${AWQ_START}[\\s\\S]*?${AWQ_END}`, 'g');
      const updated = existing.replace(regex, block);
      fs.writeFileSync(agentsPath, updated);
      console.log(`  Updated: AGENTS.md (replaced existing AWQ block)`);
      return;
    }

    // Append to existing file
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    fs.writeFileSync(agentsPath, existing + separator + block + '\n');
    console.log(`  Updated: AGENTS.md (appended AWQ block)`);
  } else {
    // Create new file
    fs.writeFileSync(agentsPath, `# AGENTS.md\n\n${block}\n`);
    console.log(`  Created: AGENTS.md`);
  }
}

function printIntegrationPrompt() {
  console.log(`\n--- Agent Integration ---\n`);
  console.log(`  An AGENTS.md block has been added to your project with WQ system reference.`);
  console.log(`  Most coding agents (Claude Code, Gemini Code, RooCode, etc.) will read this`);
  console.log(`  automatically.\n`);
  console.log(`  If your agent doesn't auto-read AGENTS.md, paste this into your first message:\n`);
  console.log(`  ┌─────────────────────────────────────────────────────────────────────┐`);
  console.log(`  │  This project uses the Agentic Work Queue system for task tracking. │`);
  console.log(`  │  Read AGENTS.md for CLI commands, status-folder mappings, and       │`);
  console.log(`  │  conventions. Use \`node documents/wq-system/wq-cli.js help\` for    │`);
  console.log(`  │  full CLI reference. Never edit work_queue.json directly.            │`);
  console.log(`  └─────────────────────────────────────────────────────────────────────┘`);
  console.log('');
}

// ============================================================
// Project Scaffolding
// ============================================================

function scaffoldProject() {
  console.log(`\nAgentic Work Queue — Project Setup`);
  console.log(`Target: ${targetRoot}\n`);

  if (!fs.existsSync(targetRoot)) {
    console.error(`Error: Target directory does not exist: ${targetRoot}`);
    process.exit(1);
  }

  const dirs = [
    'documents/handoffs/1-pending',
    'documents/handoffs/2-in_progress',
    'documents/handoffs/3-completed',
    'documents/wq-system',
    '.claude/commands',
  ];

  const files = [
    ['documents/wq-system/wq-cli.js', 'documents/wq-system/wq-cli.js'],
    ['documents/wq-system/README.md', 'documents/wq-system/README.md'],
    ['documents/wq-system/triage-criteria.md', 'documents/wq-system/triage-criteria.md'],
    ['.claude/commands/wq.md', '.claude/commands/wq.md'],
    ['.claude/commands/wl.md', '.claude/commands/wl.md'],
  ];

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

  const wqPath = path.join(targetRoot, 'documents/handoffs/work_queue.json');
  if (!fs.existsSync(wqPath)) {
    fs.writeFileSync(wqPath, JSON.stringify(starterWQ, null, 2) + '\n');
    console.log(`  Created: documents/handoffs/work_queue.json`);
    created++;
  } else {
    console.log(`  Exists:  documents/handoffs/work_queue.json`);
    skipped++;
  }

  for (const sub of ['1-pending', '2-in_progress', '3-completed']) {
    const keepPath = path.join(targetRoot, 'documents/handoffs', sub, '.gitkeep');
    if (!fs.existsSync(keepPath)) {
      const dirContents = fs.readdirSync(path.join(targetRoot, 'documents/handoffs', sub));
      if (dirContents.length === 0) {
        fs.writeFileSync(keepPath, '');
      }
    }
  }

  console.log(`\nScaffolding complete: ${created} created, ${skipped} already existed.`);
}

// ============================================================
// Extension Installation
// ============================================================

async function installExtension() {
  console.log(`\n--- VS Code Extension Install ---\n`);

  const existingVsix = findVsix();

  if (existingVsix) {
    console.log(`  Pre-built VSIX found: ${existingVsix}`);
    const choice = await ask(`\n  Install options:\n    [1] Use pre-built VSIX (fastest)\n    [2] Compile from source (latest)\n    [3] Skip extension install\n\n  Choice [1/2/3]: `);

    if (choice === '3') {
      console.log('\n  Skipping extension install.');
      return;
    }

    if (choice === '2') {
      return compileAndInstall();
    }

    // Default: install pre-built
    const vsixPath = path.join(sourceRoot, existingVsix);
    console.log(`\n  Installing ${existingVsix}...`);
    if (runCmd(`code --install-extension "${vsixPath}"`, `code --install-extension ${existingVsix}`)) {
      console.log(`\n  Extension installed. Reload VS Code to activate.`);
    } else {
      console.error(`\n  Install failed. Try manually: code --install-extension "${vsixPath}"`);
    }
  } else {
    console.log(`  No pre-built VSIX found.`);
    const choice = await ask(`\n  Install options:\n    [1] Compile from source\n    [2] Skip extension install\n\n  Choice [1/2]: `);

    if (choice === '2') {
      console.log('\n  Skipping extension install.');
      return;
    }

    return compileAndInstall();
  }
}

async function compileAndInstall() {
  console.log(`\n  Compiling from source...`);

  // Check if node_modules exists
  if (!fs.existsSync(path.join(sourceRoot, 'node_modules'))) {
    console.log('');
    if (!runCmd('npm install', 'npm install')) {
      console.error('\n  npm install failed. Install dependencies manually and retry.');
      process.exit(1);
    }
  }

  console.log('');
  if (!runCmd('npm run compile', 'npm run compile')) {
    console.error('\n  Build failed. Check errors above.');
    process.exit(1);
  }

  console.log('');
  if (!runCmd('npx vsce package', 'npx vsce package')) {
    console.error('\n  Packaging failed. Check errors above.');
    process.exit(1);
  }

  const vsix = findVsix();
  if (!vsix) {
    console.error('\n  No VSIX produced. Check build output.');
    process.exit(1);
  }

  const vsixPath = path.join(sourceRoot, vsix);
  console.log(`\n  Installing ${vsix}...`);
  if (runCmd(`code --install-extension "${vsixPath}"`, `code --install-extension ${vsix}`)) {
    console.log(`\n  Extension installed. Reload VS Code to activate.`);
  } else {
    console.error(`\n  Install failed. Try manually: code --install-extension "${vsixPath}"`);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\n========================================`);
  console.log(`  Agentic Work Queue — Setup`);
  console.log(`========================================`);

  if (!installOnly) {
    scaffoldProject();
  }

  if (!noInstall) {
    await installExtension();
  }

  if (!installOnly && !noAgents) {
    appendAgentsMd();
    printIntegrationPrompt();
  }

  console.log(`--- Getting Started ---\n`);
  if (!installOnly) {
    console.log(`  Create your first work item:`);
    console.log(`    node documents/wq-system/wq-cli.js create "My Feature" --track=frontend --phase=development\n`);
  }
  console.log(`  Open VS Code and look for "Work Queue" in the sidebar.`);
  console.log(`  For CLI help: node documents/wq-system/wq-cli.js --help\n`);
}

main().catch(err => {
  console.error(`\nSetup error: ${err.message}`);
  process.exit(1);
});
