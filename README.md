# PURR Work Queue — VS Code Extension

A VS Code extension + CLI system for tracking work items, specs, and session worklists. Built for use with Claude Code but works standalone too.

## Features

- **Sidebar tree views** — Browse work queue items grouped by phase, status, track, or agent-readiness grade
- **Kanban board** — Drag-and-drop webview board with detail panel, dependency graph, and dashboard
- **Worklist management** — View, add, edit, reorder, and check off tasks from `*WORKLIST*.md` files directly in the detail panel
- **CLI tool** — `wq-cli.js` for CRUD operations, status transitions with auto-file-moving, and dependency tracking
- **Claude Code integration** — Delegate items to explore/plan agents, auto-create worklists on status change
- **Configurable** — Customize statuses, phases, tracks, transitions, and colors from the Settings panel

## Quick Start

### Option A: Install the pre-built VSIX (fastest)

1. Clone this repo into your project (or copy the files):
   ```bash
   git clone https://github.com/YOUR_ORG/vscode-wq-viewer.git
   ```

2. Install the extension:
   ```bash
   code --install-extension purr-wq-viewer-0.9.0.vsix
   ```

3. Open your project in VS Code — the Work Queue sidebar appears automatically.

### Option B: Build from source

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/YOUR_ORG/vscode-wq-viewer.git
   cd vscode-wq-viewer
   npm install
   ```

2. Build:
   ```bash
   npm run compile
   ```

3. Package and install:
   ```bash
   npx vsce package
   code --install-extension purr-wq-viewer-*.vsix
   ```

4. Reload VS Code.

## Setting Up in a New Project

The extension expects this directory structure in your workspace root:

```
your-project/
├── documents/
│   ├── handoffs/
│   │   ├── 1-pending/          # intake + ready items
│   │   ├── 2-in_progress/      # active + blocked items
│   │   ├── 3-completed/        # done + archive items
│   │   └── work_queue.json     # work queue data
│   └── wq-system/
│       ├── wq-cli.js           # CLI tool (zero external deps)
│       ├── triage-criteria.md  # Agent-readiness scoring rubric
│       └── README.md           # WQ system docs
└── .claude/
    └── commands/
        ├── wq.md               # /project:wq skill for Claude Code
        └── wl.md               # /project:wl skill for Claude Code
```

**Automated setup:** Run the setup script to copy these files into any project:

```bash
node setup.js /path/to/your-project
```

**Manual setup:** Copy the `documents/` and `.claude/` directories to your project root.

## CLI Usage

The CLI requires only Node.js — no external packages.

```bash
# Create a work item
node documents/wq-system/wq-cli.js create "Feature Name" --track=frontend --phase=development

# Change status (auto-moves handoff files between folders)
node documents/wq-system/wq-cli.js status WQ-001 active

# View item details
node documents/wq-system/wq-cli.js view WQ-001

# List items by filter
node documents/wq-system/wq-cli.js list active
node documents/wq-system/wq-cli.js list frontend

# Check dependencies
node documents/wq-system/wq-cli.js deps WQ-001

# Find which item owns a document
node documents/wq-system/wq-cli.js find SPEC_Feature.md

# Get next available ID
node documents/wq-system/wq-cli.js next-id
```

## Status-Folder Mapping

| Status | Folder | Description |
|--------|--------|-------------|
| `intake` | `1-pending/` | New items awaiting review |
| `ready` | `1-pending/` | Reviewed and ready to start |
| `active` | `2-in_progress/` | Currently being worked on |
| `blocked` | `2-in_progress/` | Waiting on dependency or decision |
| `done` | `3-completed/` | Work finished |
| `archive` | `3-completed/` | Archived/hidden |

## Customization

Open the WQ Board (click the dashboard icon in the sidebar) and use the **Settings** tab to customize:

- **Statuses** — Add/remove/reorder statuses, assign colors and folder mappings
- **Phases** — Define project phases (e.g., Planning, Development, Testing, Production)
- **Tracks** — Define work tracks (e.g., Frontend, Backend, Infra, Docs)
- **Transitions** — Control which status changes are allowed

All settings are stored in `work_queue.json` alongside your data.

## Claude Code Integration

If you use [Claude Code](https://claude.com/claude-code), copy the skill files to `.claude/commands/` in your project:

- **`wq.md`** — Provides the `/project:wq` skill for full work queue management
- **`wl.md`** — Provides the `/project:wl` skill for session worklist management

These skills teach Claude Code how to use the CLI, create worklists, and triage items for agent readiness.

## Development

```bash
npm run compile          # Build extension + webview
npm run watch:ext        # Watch mode for extension host
npm run watch:webview    # Watch mode for webview
npm run lint             # TypeScript type check
npx vsce package         # Package as .vsix
```

## Requirements

- **VS Code** 1.85.0 or later
- **Node.js** (for the CLI tool and building from source)

## License

MIT
