# Agentic Work Queue

This project uses the [Agentic Work Queue](https://github.com/fasutron/vscode-agentic-work-queue) system for task tracking.

## CLI Tool

All work queue operations go through the CLI — do NOT edit `work_queue.json` directly.

```bash
documents/wq-system/wq <command> [args] [options]
```

| Command | Usage | Description |
|---------|-------|-------------|
| `create` | `create "Title" --track=X --phase=Y` | Create new item |
| `status` | `status WQ-001 active` | Change status (auto-moves files) |
| `edit` | `edit WQ-001 --priority=5` | Update item fields |
| `view` | `view WQ-001` | View item details |
| `list` | `list [filter]` | List items by status/track/phase |
| `deps` | `deps WQ-001` | Show dependencies |
| `find` | `find SPEC_Feature.md` | Find WQ item by document |
| `next-id` | `next-id` | Show next available ID |
| `normalize` | `normalize` | Fix document paths (idempotent) |

## Status-Folder Mapping

| Status | Folder | Description |
|--------|--------|-------------|
| `intake`, `ready` | `1-pending/` | Items awaiting or ready for work |
| `active`, `blocked` | `2-in_progress/` | Currently active or blocked items |
| `done`, `archive` | `3-completed/` | Finished or archived items |

## Directory Structure

```
documents/
├── handoffs/
│   ├── 1-pending/          # intake + ready items
│   ├── 2-in_progress/      # active + blocked items
│   ├── 3-completed/        # done + archived items
│   └── work_queue.json     # work queue data (use CLI, not direct edits)
└── wq-system/
    ├── wq-cli.js           # CLI tool (zero external deps)
    ├── wq                  # Shell wrapper (Unix)
    ├── wq.cmd              # Shell wrapper (Windows)
    ├── wl                  # Shell wrapper (Unix)
    ├── wl.cmd              # Shell wrapper (Windows)
    └── triage-criteria.md  # Agent-readiness scoring rubric
```

## Worklist Files

When a WQ item becomes `active`, create a `*_WORKLIST.md` file to track session progress:

```markdown
# [Feature] WORKLIST
**WQ Item:** WQ-XXX
## Completed
## In Progress
- [ ] Current task
## Deferred
```

Use `- [x]` for completed tasks, `- [ ]` for pending tasks.

## Test Plans

Test plans use checklist format for interactive editing in the VS Code extension:

```markdown
# [Feature] TEST PLAN
**WQ Item:** WQ-XXX
## Smoke Tests
- [ ] Feature loads without errors
## Functional Tests
- [ ] Primary flow works end-to-end
```

Use `- [x]` for passed, `- [ ]` for pending, `- [!]` for failed tests.

## Key Rules

1. **Never edit `work_queue.json` directly** — always use the CLI
2. **Never manually move handoff files** — the CLI auto-syncs folders on status change
3. **Check valid options first** — tracks, phases, and statuses are project-specific (stored in `work_queue.json` settings)
