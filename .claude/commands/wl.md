Session worklist manager: $ARGUMENTS

You are a worklist management agent. Your job is to help the user interact with WORKLIST files during a session — view progress, add tasks, mark tasks complete, and get a quick status summary.

## Subcommands

Parse `$ARGUMENTS` to determine which subcommand to run:

| Input | Shortcut | Action |
|-------|----------|--------|
| (empty) or `view` | `v` | **View** — Display the active worklist |
| `add "Task description"` | `a "Task"` | **Add** — Add a new task to In Progress |
| `done "Task description"` | `d "Task"` | **Done** — Mark a task as completed |
| `status` | `s` | **Status** — Compact summary of progress |
| `create "Feature Name"` | `c "Name"` | **Create** — Create a new worklist file |

---

## Step 1: Find the Active Worklist

Before any operation, locate the relevant WORKLIST file:

```bash
# 1. Check git status for recently modified worklist files
git diff --name-only | grep -i worklist
git diff --cached --name-only | grep -i worklist

# 2. If none found in git, check in_progress folder
find documents/handoffs/2-in_progress -name "*WORKLIST*" 2>/dev/null

# 3. If still none, check pending folder
find documents/handoffs/1-pending -name "*WORKLIST*" 2>/dev/null
```

**If multiple worklists are found:** Present the list and ask the user which one to use.

**If no worklist is found:**
- For `view`, `add`, `done`, `status`: Tell the user no active worklist was found. Suggest `create`.
- For `create`: Proceed to creation.

---

## Step 2: Execute Subcommand

### VIEW (default)

Read the worklist file and display it with a formatted summary:

```markdown
## [Feature Name] WORKLIST
**File:** documents/handoffs/.../feature_WORKLIST.md
**WQ Item:** WQ-XXX

### Progress: X/Y tasks complete

**Completed (X):**
- Task that was done
- Another completed task

**In Progress (Y):**
- Current task

**Deferred (Z):**
- Deferred task
```

### ADD

Add a new unchecked item to the `## In Progress` section of the worklist file.

1. Read the worklist file
2. Find the `## In Progress` section
3. Add `- [ ] <task description>` at the end of that section
4. Write the file
5. Confirm: "Added to In Progress: <task description>"

**If no In Progress section exists**, create one after `## Completed`.

### DONE

Mark a task as completed by moving it from In Progress to Completed.

1. Read the worklist file
2. Search for the task description (fuzzy match — match substring)
3. If found in `## In Progress`: Remove it, add `- [x] <task description>` to end of `## Completed`
4. If found in `## Completed` already: Tell the user it's already done
5. If not found: Tell the user no matching task was found, show the current In Progress items
6. Write the file
7. Confirm: "Marked complete: <task description>"

### STATUS

Read the worklist and output a compact one-liner:

```
WORKLIST [Feature Name]: X done | Y in progress | Z deferred
```

Count items by section:
- `## Completed` / `## Previously Completed` / `## Recently Completed` — all count as completed
- `## In Progress` — count as in progress
- `## Deferred` — count as deferred

### CREATE

Create a new worklist file.

1. Ask the user for:
   - Feature name (from arguments or ask)
   - WQ Item ID (optional — ask if they have one)
   - Location: alongside a handoff doc or standalone in `2-in_progress/`
2. Generate the file using the standard template:

```markdown
# [Feature Name] WORKLIST

**WQ Item:** WQ-XXX (or "None — standalone session work")
**Related Docs:**
- (Add relevant doc paths)

## Completed
(None yet)

## In Progress
- [ ] First task

## Deferred
(None yet)

## Decisions
(None yet)

## Notes
(None yet)
```

3. Write the file
4. Confirm with the file path

---

## DO NOT

- Read `work_queue.json` directly — use `/project:wq` for WQ operations
- Create duplicate worklists — if one exists for the same feature, use it
- Modify sections other than Completed, In Progress, and Deferred
- Remove items — only move them between sections

## Auto-Creation

Worklists are **automatically created** by `/project:wq` when a WQ item transitions to `active` status. You do not need to manually create worklists for WQ-linked work — just run `/project:wq status WQ-XXX active` and the worklist will be scaffolded.

Use `/project:wl create` only for standalone session work that has no WQ item.

## Bug Filing from Testing

The VS Code WQ extension's **Testing tab** allows you to file bugs from failed tests directly into the worklist. When a test is marked as failed (`- [!]`), clicking the bug icon creates a `[TEST FAIL] <description>` task in a "Bugs from Testing" section of the worklist. These bugs appear as regular unchecked worklist tasks and can be managed with the standard worklist commands above.

## Rules

1. **Always find before operating** — never guess the file path
2. **Preserve existing content** — only add/move items, don't restructure
3. **Use exact markdown format** — `- [x]` for completed, `- [ ]` for in progress
4. **Report what you did** — always confirm the action taken
5. **Handle varied formats** — worklist files may have extra sections (bugs, phases, etc.). Only operate on the standard sections.
