# Agentic Work Queue — VS Code Extension

A VS Code extension + CLI system for tracking work items, specs, and session worklists. Built for use with Claude Code but works standalone too.

## Features

- **Sidebar tree views** — Browse work queue items grouped by phase, status, track, or agent-readiness grade
- **Webview panel** — Dashboard, list view, dependency graph, and settings tabs with detail panel overlay
- **Worklist management** — View, add, edit, reorder, and check off tasks from `*WORKLIST*.md` files directly in the detail panel
- **Testing tab** — Tri-state test checklist (pending/pass/fail) with drag-and-drop reordering, progress tracking, and bug filing from failed tests
- **CLI tool** — `wq-cli.js` for CRUD operations, status transitions with auto-file-moving, and dependency tracking
- **Claude Code integration** — Delegate items to explore/plan agents, auto-create worklists on status change
- **Configurable** — Customize statuses, phases, tracks, transitions, and colors from the Settings panel

## For AI Agents

**Stop after cloning.** Do not run, replicate, or substitute `setup.js`.
`setup.js` requires interactive user input.

1. Clone this repo to a **temp directory** — NOT the user's project folder:
   - Linux/macOS: `/tmp/agentic-wq`
   - Windows: `%TEMP%\agentic-wq`
2. Print the setup command for the user to run manually, substituting the actual clone path and project path:

```bash
node <clone-path>/setup.js <project-path>
```

3. Do not proceed further. Do not offer to run the command. The user will run it themselves in their terminal.

## Quick Start

### Option A: Use the setup script (recommended)

The setup script scaffolds your project structure and installs the extension in one step.
Clone the extension repo to a **temp directory** (not inside your project):

```bash
git clone https://github.com/fasutron/vscode-agentic-work-queue.git /tmp/agentic-wq
cd /tmp/agentic-wq
node setup.js /path/to/your-project
```

The installer will prompt you to choose between the **pre-built VSIX** (fastest) or **compile from source** (latest).

### Option B: Install the pre-built VSIX only

A pre-built `.vsix` is included in the repo. Install directly:

```bash
code --install-extension purr-wq-viewer-*.vsix
```

Then reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window").

### Option C: Build from source

```bash
git clone https://github.com/fasutron/vscode-agentic-work-queue.git
cd vscode-agentic-work-queue
npm install
npm run compile
npx vsce package
code --install-extension purr-wq-viewer-*.vsix
```

### Setup Script Options

```bash
node setup.js /path/to/project     # Full setup: scaffold + install
node setup.js                       # Same, defaults to current directory
node setup.js --install-only        # Skip scaffolding, just install extension
node setup.js --no-install          # Scaffold only, skip extension install
node setup.js --update              # Update system files (preserves your data)
node setup.js --no-agents          # Skip agent integration prompt
```

### Updating

To update an existing installation after pulling a new version of the extension repo:

```bash
cd path/to/extension-repo && git pull
node setup.js --update /path/to/your-project
```

This overwrites system files (CLI, skill files, WQ_CONTEXT.md) but never touches your `work_queue.json` or handoff directories.

## Project Structure

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

**`node setup.js`** creates this structure automatically. Or copy the `documents/` and `.claude/` directories manually.

## CLI Usage

The CLI requires only Node.js — no external packages. Your agent will have access to all of these commands (see Agent Integration below) through the WQ and WL commands that are installed with this project.

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

# Edit an item
node documents/wq-system/wq-cli.js edit WQ-001 --priority=10 --add-tag=urgent

# Check dependencies
node documents/wq-system/wq-cli.js deps WQ-001
node documents/wq-system/wq-cli.js deps --blocked

# Find which item owns a document
node documents/wq-system/wq-cli.js find SPEC_Feature.md

# Normalize document paths (one-time cleanup, idempotent)
node documents/wq-system/wq-cli.js normalize

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

## Agent Integration

The setup script copies `WQ_CONTEXT.md` into your project at `documents/wq-system/WQ_CONTEXT.md`. This file contains the full WQ system reference (CLI commands, status-folder mappings, conventions).

After setup, the installer prints a prompt you can paste to your coding agent. The agent reads `WQ_CONTEXT.md` and inserts the context into whatever persistent file it uses (CLAUDE.md, AGENTS.md, etc.).

### GitHub Copilot

For Copilot, the installer offers to auto-append a short WQ pointer (6 lines) to `.github/copilot-instructions.md`. This pointer tells Copilot where to find the full CLI reference and skill files on demand, without bloating the instructions file. You can decline and add the pointer manually if you prefer to control the file structure.

### Talking to Your Agent

Once the WQ context is in your agent's environment, you can reference the work queue and worklists naturally in conversation. Your agent will know what "WQ" and "WL" mean.

**Work Queue (WQ) examples:**

> "For the invite workflow, check our WQ to see if we have this already defined as a task somewhere."

> "I want to add dark mode support. Create a WQ item for it on the frontend track, planning phase."

> "What's active in the WQ right now? Pick the highest priority item and start a worklist for it."

> "We just found a race condition in the checkout flow. Add it to the WQ as blocked, backend track, and link it as a dependency of WQ-012."

> "I'm done with WQ-008. Mark it done and move WQ-009 to active — that's next."

**Session Worklist (WL) examples:**

> "What's on my WL right now? Show me where I'm at."

> "Add 'fix the flaky timeout in the upload test' to my WL."

> "The auth refactor is done — mark it complete on the WL."

> "WL status — how many tasks do I have left?"

> "I'm starting a spike on caching. Create a WL for it, no WQ item yet."

### Claude Code

The setup script also copies skill files to `.claude/commands/` in your project:

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

## Feedback & Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/fasutron/vscode-agentic-work-queue/issues) on GitHub.

## License

MIT
