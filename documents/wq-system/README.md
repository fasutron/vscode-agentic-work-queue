# Work Queue System

A portable task/feature tracking system designed for use with Claude Code sessions.

## Components

```
wq-system/
├── wq-cli.js              # CLI tool for CRUD operations
├── wq                     # Shell wrapper (Unix)
├── wq.cmd                 # Shell wrapper (Windows)
├── wl                     # Shell wrapper (Unix)
├── wl.cmd                 # Shell wrapper (Windows)
├── triage-criteria.md     # Agent-ready task selection rubric
└── README.md              # This file
```

## Installation in New Project

1. Copy this `wq-system/` directory to `documents/wq-system/`

2. Create the handoffs directory structure:
   ```
   documents/handoffs/
   ├── 1-pending/
   ├── 2-in_progress/
   ├── 3-completed/
   └── work_queue.json
   ```

3. Initialize `work_queue.json`:
   ```json
   {
     "version": "1.0.0",
     "lastModified": "2026-01-01T00:00:00.000Z",
     "items": []
   }
   ```

4. Copy the Claude skill file to `.claude/commands/wq.md`

## CLI Usage

```bash
# Create item
documents/wq-system/wq create "Feature Name" --track=frontend --phase=development

# Change status (moves files automatically)
documents/wq-system/wq status WQ-001 active

# Edit item
documents/wq-system/wq edit WQ-001 --priority=5 --add-tag="urgent"

# View item
documents/wq-system/wq view WQ-001

# List items
documents/wq-system/wq list active
documents/wq-system/wq list frontend

# Get next available ID
documents/wq-system/wq next-id

# Help
documents/wq-system/wq help

# Triage (via /project:wq skill — CC reasoning task, not a CLI command)
# Evaluates items against agent-ready criteria in triage-criteria.md
# See .claude/commands/wq.md for usage
```

## Status-Folder Mapping

| Status | Folder |
|--------|--------|
| `intake`, `ready` | `1-pending/` |
| `active`, `blocked` | `2-in_progress/` |
| `done`, `archive` | `3-completed/` |

## Valid Values

**Tracks:** Project-specific — see `work_queue.json` settings (defaults: frontend, backend, infra, docs)

**Phases:** Project-specific — see `work_queue.json` settings (defaults: planning, development, testing, production)

**Statuses:** intake, ready, active, blocked, done, archive

## Dependencies

- Node.js (no external packages required)
- Uses only `fs` and `path` from Node standard library
