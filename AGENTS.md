# AGENTS.md — Agentic Work Queue Extension

> This file provides context for AI coding agents working on the extension itself.
> For consumer project integration, see `documents/wq-system/WQ_CONTEXT.md`.

## Project Overview

VS Code extension + CLI system for tracking work items, specs, and session worklists.
TypeScript extension host + React 18 webview, built with esbuild.

## Architecture

```
src/
├── extension.ts              # Activation, command registration
├── models/
│   ├── WQItem.ts             # Core type definitions
│   ├── WorklistParser.ts     # Markdown worklist parser
│   └── TestPlanParser.ts     # Markdown test plan parser
├── providers/
│   ├── WQTreeProvider.ts     # Sidebar tree view
│   ├── WQWebviewProvider.ts  # Kanban board webview host
│   └── WQFileWatcher.ts      # File system watchers
├── services/
│   ├── WQDataService.ts      # Data layer (reads/writes work_queue.json + markdown files)
│   └── ClaudeCodeService.ts  # Claude Code terminal integration
└── webview/
    ├── App.tsx               # React root
    ├── hooks/
    │   └── useExtensionState.ts  # postMessage state bridge
    └── components/
        ├── Board.tsx         # Kanban columns
        ├── DetailPanel.tsx   # Item detail + worklist + testing tabs
        ├── DependencyGraph.tsx
        └── Dashboard.tsx
media/
└── webview.css               # All webview styles (VS Code theme vars)
documents/
└── wq-system/
    ├── wq-cli.js             # CLI tool (zero deps, ships to consumer projects)
    ├── triage-criteria.md    # Agent-readiness scoring rubric
    └── README.md
```

## Build Commands

```bash
npm run compile          # Build extension + webview (esbuild)
npm run watch:ext        # Watch mode for extension host
npm run watch:webview    # Watch mode for webview
npm run lint             # TypeScript type check (tsc --noEmit)
npx vsce package         # Package as .vsix
```

## Build System

Dual esbuild pipeline:
- **Extension host**: `compile:ext` — Node.js target, CJS output → `dist/extension.js`
- **Webview**: `compile:webview` — Browser target, IIFE output → `dist/webview.js`

Both configs are in `package.json` scripts. The webview bundle is loaded by `WQWebviewProvider.ts` via a `<script>` tag in the HTML it generates.

## Key Conventions

- **Webview ↔ Extension**: Communication via `postMessage`. Message types defined in `src/webview/types.ts`.
- **CSS**: Uses VS Code theme variables (`--vscode-*`). No external CSS frameworks.
- **Data format**: `work_queue.json` is the single source of truth. Markdown files (worklists, test plans, specs) are linked via `item.documents[]`.
- **CLI tool**: `wq-cli.js` is zero-dependency Node.js. It ships to consumer projects and must stay portable.
- **Status-folder mapping**: `intake`/`ready` → `1-pending/`, `active`/`blocked` → `2-in_progress/`, `done`/`archive` → `3-completed/`. The CLI auto-moves files on status change.

## Testing

Manual testing via VSIX install:
```bash
npm run compile && npx vsce package
code --install-extension purr-wq-viewer-*.vsix
# Reload VS Code window
```

## Consumer Integration

The `setup.js` installer scaffolds the WQ system into consumer projects:
- Creates `documents/handoffs/` directory structure
- Copies `wq-cli.js`, skill files, and triage criteria
- Initializes `work_queue.json`
- Copies `WQ_CONTEXT.md` into consumer project at `documents/wq-system/`
- Prints an agent-agnostic integration prompt for the user to paste to their coding agent

The `WQ_CONTEXT.md` file teaches any coding agent how to use the WQ CLI.

Use `setup.js --update` to overwrite system files (CLI, skills, WQ_CONTEXT.md) while preserving user data (`work_queue.json`, handoff directories).
