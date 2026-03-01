# Work Queue System

A portable task/feature tracking system designed for use with Claude Code sessions.

## Components

```
wq-system/
├── wq-cli.js              # CLI tool for CRUD operations
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
node documents/wq-system/wq-cli.js create "Feature Name" --track=frontend --phase=development

# Change status (moves files automatically)
node documents/wq-system/wq-cli.js status WQ-001 active

# Edit item
node documents/wq-system/wq-cli.js edit WQ-001 --priority=5 --add-tag="urgent"

# View item
node documents/wq-system/wq-cli.js view WQ-001

# List items
node documents/wq-system/wq-cli.js list active
node documents/wq-system/wq-cli.js list frontend

# Get next available ID
node documents/wq-system/wq-cli.js next-id

# Help
node documents/wq-system/wq-cli.js help

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
