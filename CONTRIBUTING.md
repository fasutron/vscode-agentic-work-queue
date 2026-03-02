# Contributing to Agentic Work Queue

## Getting Started

```bash
git clone https://github.com/fasutron/vscode-agentic-work-queue.git
cd vscode-agentic-work-queue
npm install
npm run compile
```

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Build extension + webview (esbuild) |
| `npm run watch:ext` | Watch mode for extension host |
| `npm run watch:webview` | Watch mode for webview |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npx vsce package` | Package as `.vsix` |

## Architecture

Dual esbuild pipeline — CJS for the extension host, IIFE for the webview:

```
src/
├── extension.ts                 # Entry point, command registration
├── models/                      # Type definitions, parsers
├── providers/                   # Tree view, webview host, file watchers
├── services/WQDataService.ts    # Data layer (work_queue.json + markdown files)
└── webview/                     # React 18 app, postMessage bridge
media/
└── webview.css                  # Webview styles (VS Code theme variables)
documents/wq-system/
└── wq-cli.js                   # CLI tool (zero deps, ships to consumer projects)
```

Key conventions:
- Webview ↔ Extension communication via `postMessage` (types in `src/webview/types.ts`)
- CSS uses VS Code theme variables (`--vscode-*`), no external frameworks
- `wq-cli.js` must remain zero-dependency Node.js for portability

## Testing

No automated test suite yet. Manual testing via VSIX install:

```bash
npm run compile && npx vsce package
code --install-extension purr-wq-viewer-*.vsix
# Ctrl+Shift+P → "Developer: Reload Window"
```

## Using a Coding Agent

If you use an AI coding agent (Claude Code, Gemini Code, RooCode, Cursor, Codex, etc.):

1. The repo includes an `AGENTS.md` with extension development context that most agents read automatically.
2. `CLAUDE.md` is gitignored. If your agent uses it, create one locally and point it to `AGENTS.md` for project context.
3. Claude Code skill files are in `.claude/commands/` (wq.md, wl.md) for WQ/worklist management.

## Pull Requests

- Run `npm run lint` before submitting
- Test your changes by installing the VSIX in a fresh VS Code window
- Keep `wq-cli.js` zero-dependency
