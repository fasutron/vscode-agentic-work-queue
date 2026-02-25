Work Queue Management: $ARGUMENTS

You are a work queue management agent. This skill provides CRUD operations for work queue items.

## DO NOT
- Read `work_queue.json` directly — use the CLI commands below
- Guess at valid options — check `work_queue.json` settings for valid tracks, phases, and statuses
- Run `list all` — valid filters: status names, track names, or phase names from your project's settings

**This skill uses the `wq-cli.js` tool for all operations.**

---

## CLI Tool Location

```
documents/wq-system/wq-cli.js
```

This tool and its companion files can be copied to other projects as a self-contained unit.

---

## Usage

For all WQ operations, execute the CLI tool with the appropriate command:

```bash
node documents/wq-system/wq-cli.js <command> [args] [options]
```

### Commands

| Command | Usage | Description |
|---------|-------|-------------|
| `create` | `create "Title" --track=X --phase=Y` | Create new item |
| `status` | `status WQ-065 active` | Change status + sync files |
| `edit` | `edit WQ-065 --priority=5` | Update item fields |
| `view` | `view WQ-065` | View item details |
| `list` | `list [filter]` | List items |
| `deps` | `deps WQ-065` | Show item dependencies |
| `find` | `find SPEC_Feature.md` | Find WQ by document |
| `next-id` | `next-id` | Show next available ID |
| `help` | `help` | Show CLI help |
| `triage` | `triage [phase]` | Score items for agent-readiness |

---

## Action: CREATE

```bash
node documents/wq-system/wq-cli.js create "Title" --track=<track> --phase=<phase> [options]
```

### Required
- `--track=` : One of your project's configured tracks (see `work_queue.json` settings)
- `--phase=` : One of your project's configured phases (see `work_queue.json` settings)

### Optional
- `--summary="..."` : Brief description
- `--priority=N` : Lower = higher priority (default: 50)
- `--effort="Xd"` : Estimate like "2h", "1d", "3d", "1w"
- `--tags="tag1,tag2"` : Comma-separated tags
- `--depends="WQ-001,WQ-002"` : Dependencies
- `--doc-type=brief|spec|notes` : Create stub document file

### Example
```bash
node documents/wq-system/wq-cli.js create "User Auth Feature" --track=frontend --phase=development --priority=5 --tags="auth,security"
```

---

## Action: STATUS

```bash
node documents/wq-system/wq-cli.js status <WQ-ID> <new-status>
```

### Valid Statuses
- `intake` → files in `1-pending/`
- `ready` → files in `1-pending/`
- `active` → files in `2-in_progress/`
- `blocked` → files in `2-in_progress/`
- `done` → files in `3-completed/`
- `archive` → files in `3-completed/`

The CLI automatically:
- Moves document files to the correct folder
- Updates paths in work_queue.json
- Warns about incomplete dependencies
- Reports newly unblocked items when marking done

### Example
```bash
node documents/wq-system/wq-cli.js status WQ-065 done
```

### Auto-Create Worklist on `active`

When changing status to `active`, **automatically create a WORKLIST file** if one doesn't already exist:

1. After the CLI moves files, check the target folder for an existing `*_WORKLIST.md` containing `WQ Item: <WQ-ID>`
2. If none found, create one:

```markdown
# [Title from WQ item] WORKLIST

**WQ Item:** WQ-XXX
**Related Docs:**
- [paths from the WQ item's files array]

## Completed
(None yet)

## In Progress
- [ ] Review spec/brief and plan implementation

## Deferred
(None yet)

## Decisions
(None yet)

## Notes
(None yet)
```

3. Place the file in the same folder the CLI moved handoff docs into (typically `documents/handoffs/2-in_progress/`)
4. Use naming convention: `<WQ-ID>_<Title_Snake_Case>_WORKLIST.md` (e.g., `WQ065_User_Auth_Feature_WORKLIST.md`)
5. Link the worklist back to the WQ item:
```bash
node documents/wq-system/wq-cli.js edit WQ-XXX --add-doc="worklist:<path-to-worklist>"
```
6. Report: "Created worklist: `<path>`"

**Do NOT auto-create** for any other status transition (`blocked`, `done`, `intake`, etc.).

---

## Action: EDIT

```bash
node documents/wq-system/wq-cli.js edit <WQ-ID> [options]
```

### Options
- `--title="New Title"`
- `--summary="New summary"`
- `--priority=N`
- `--effort="Xd"`
- `--phase=<phase>`
- `--track=<track>`
- `--tags="tag1,tag2"` (replaces existing)
- `--add-tag="newtag"` (appends)
- `--depends="WQ-001,WQ-002"` (replaces existing)
- `--add-depends="WQ-003"` (appends)
- `--add-doc="type:path"` (adds document reference)

### Example
```bash
node documents/wq-system/wq-cli.js edit WQ-065 --priority=3 --add-tag="urgent"
```

---

## Action: VIEW

```bash
node documents/wq-system/wq-cli.js view <WQ-ID>
```

Displays full item details including dependencies, blocks, and documents.

---

## Action: LIST

```bash
node documents/wq-system/wq-cli.js list [filter]
```

### Filters
- By status: `active`, `ready`, `blocked`, `intake`, `done`, `archive`
- By track: Any track name from your project settings
- By phase: Any phase name from your project settings
- (no filter): All non-done, non-archived items

---

## Action: DEPS

```bash
node documents/wq-system/wq-cli.js deps <WQ-ID>           # What does this item depend on?
node documents/wq-system/wq-cli.js deps <WQ-ID> --reverse # What depends on this item?
node documents/wq-system/wq-cli.js deps --blocked         # All items with unmet deps
```

### Examples
```bash
node documents/wq-system/wq-cli.js deps WQ-065           # Show WQ-065's dependencies
node documents/wq-system/wq-cli.js deps WQ-065 --reverse # Show what's blocked by WQ-065
node documents/wq-system/wq-cli.js deps --blocked        # Show all blocked items
```

---

## Action: FIND

Look up which WQ item(s) a handoff document belongs to.

```bash
node documents/wq-system/wq-cli.js find <path-or-filename>
```

Accepts filename, relative path, or full path. Normalizes Windows/Unix paths.

### Examples
```bash
node documents/wq-system/wq-cli.js find SPEC_Feature.md
node documents/wq-system/wq-cli.js find 1-pending/SPEC_Feature.md
node documents/wq-system/wq-cli.js find "documents/handoffs/1-pending/BRIEF_Feature.md"
```

---

## Action: TRIAGE

Identify agent-ready items from the work queue. This is a CC reasoning task, not a CLI command.

### Usage

```
/project:wq triage              # Triage all non-done, non-archived items
/project:wq triage development  # Triage items in a specific phase
/project:wq triage frontend     # Triage items on a specific track
```

### Steps

1. List items using the CLI: `node documents/wq-system/wq-cli.js list [filter]`
2. Read the criteria file: `documents/wq-system/triage-criteria.md`
3. For each item, evaluate against the five required criteria
4. Score passing items (1-3) using the rubric
5. Present results using the output format in the criteria doc

### Important

- **Read the criteria file every time** — do not rely on memory of its contents
- View individual items (`wq view WQ-XXX`) as needed to assess scope
- Check dependencies (`wq deps WQ-XXX`) for criterion #5
- Read linked handoff docs if the summary alone is insufficient to score

---

## Key Paths

| Resource | Path |
|----------|------|
| **CLI Tool** | `documents/wq-system/wq-cli.js` |
| **Triage Criteria** | `documents/wq-system/triage-criteria.md` |
| **Work Queue JSON** | `documents/handoffs/work_queue.json` |
| **Pending Items** | `documents/handoffs/1-pending/` |
| **In Progress Items** | `documents/handoffs/2-in_progress/` |
| **Completed Items** | `documents/handoffs/3-completed/` |

---

## Status-Folder Mapping

| Status | Folder |
|--------|--------|
| `intake`, `ready` | `1-pending/` |
| `active`, `blocked` | `2-in_progress/` |
| `done`, `archive` | `3-completed/` |

---

## Portability

To use the WQ system in another project:

1. Copy the `documents/wq-system/` directory
2. Copy the `documents/handoffs/` directory structure (or create empty folders)
3. Create an initial `work_queue.json` (or run `node setup.js /path/to/project`)
4. Copy this skill file to `.claude/commands/wq.md`

---

## Cross-References

- **CLI source**: `documents/wq-system/wq-cli.js`
- **Triage criteria**: `documents/wq-system/triage-criteria.md`
