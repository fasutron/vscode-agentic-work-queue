Generate commit for recent work: $ARGUMENTS

You are a commit preparation agent. Your job is to analyze work done across one or more sessions and generate a meaningful commit with proper summary.

## Purpose

Work often spans multiple sessions and features. This skill:
1. Finds WORKLIST files to understand what was accomplished
2. Analyzes git changes grouped by feature/WQ item
3. Generates a structured commit message
4. Awaits user approval before committing

## Input

Optional context to include/exclude or focus the commit:

```
/project:commit                                    # Analyze all uncommitted changes
/project:commit "Focus on hand history work"       # Filter to specific area
/project:commit "Exclude comms-session-build"      # Exclude specific work
```

---

## Step 1: Find WORKLIST Files

WORKLIST files (`*_WORKLIST.md` or `*WORKLIST*.md`) are the primary source of context.

```bash
# Find WORKLIST files in uncommitted changes
git diff --name-only | grep -i worklist

# Find WORKLIST files in staged changes
git diff --cached --name-only | grep -i worklist

# Find all WORKLIST files in handoffs (for cross-reference)
find documents/handoffs -name "*WORKLIST*.md" -o -name "*worklist*.md" 2>/dev/null
```

For each WORKLIST file found, read it to extract:
- **WQ Item ID** (e.g., `WQ-065`)
- **Completed items** (checked boxes `[x]`)
- **Decisions made**
- **Related doc paths**

## Step 2: Gather Git Context

```bash
# All uncommitted changes (staged + unstaged)
git status --short

# Files changed
git diff --name-only
git diff --cached --name-only

# Recent commits for context
git log --oneline -5
```

## Step 3: Analyze Code Changes (Fallback for Missing WORKLIST)

**If WORKLIST files don't cover all changed files, analyze the code directly:**

### 3a. Read File Headers
For each changed file without WORKLIST coverage, read the first 30 lines:
```bash
head -30 <file>
```

Look for:
- Header comments explaining purpose (e.g., `// Service for importing PHH files`)
- JSDoc `@description` or `@file` tags
- Export names that indicate purpose

### 3b. Analyze Diffs for Context
For significant changes, read the actual diff:
```bash
git diff --unified=5 <file> | head -100
```

Look for:
- New function/class names
- Changed API endpoints
- New imports that indicate dependencies

### 3c. Infer Feature from File Path
Use path patterns to group related files:

| Path Pattern | Likely Feature |
|--------------|----------------|
| `services/handHistory/*` | Hand History system |
| `routes/*routes.js` | API endpoints (group by prefix) |
| `frontend/src/components/X/*` | X feature UI |
| `frontend/src/api/X.js` | X feature API wrapper |
| `frontend/src/hooks/useX.js` | X feature hooks |
| `frontend/src/contexts/XContext.js` | X feature state |
| `.claude/commands/*` | Claude Code skills |
| `documents/handoffs/*` | Handoff/WQ documentation |
| `migrations/*.sql` | Database schema changes |

### 3d. Cross-Reference WQ Items
Even without WORKLIST, check `work_queue.json` for active items:
```bash
grep -B2 -A10 '"status": "active"' documents/handoffs/work_queue.json
```

Match changed files to WQ items by:
- Title keywords matching directory names
- Tags matching file paths
- Summary mentioning related features

## Step 4: Group Changes by Feature/WQ

Combine context from WORKLIST files (Step 1) and code analysis (Step 3) to group changes.

**Context priority:**
1. WORKLIST files — highest confidence, use completed items verbatim
2. WQ item matches — good confidence, reference WQ ID
3. File headers — medium confidence, use if descriptive
4. Path inference — fallback, group by directory pattern
5. Diff analysis — last resort, describe what changed

**Grouping heuristics:**
- Files in same directory often belong together
- Files referenced in same WORKLIST belong together
- Route + API wrapper + component for same feature = one group
- Skill files (`.claude/commands/`) = their own group
- Documentation updates = their own group
- **New files without WORKLIST:** group by path pattern, describe based on header/content

**Example grouping:**
```
## Hand History (WQ-065)
- services/handHistory/PHHConverter.js
- services/handHistory/ImportService.js
- routes/handhistoryroutes.js
- frontend/src/api/handHistory.js
- frontend/src/components/HandHistory/HandBrowser.jsx
- documents/handoffs/1-pending/hand-history-improvements-working-list.md

## Claude Code Skills & Workflow
- .claude/commands/wq.md
- .claude/commands/update-docs.md
- CLAUDE.md
- documents/UI-API-New-Docs/HANDOFF_PROTOCOL.md

## Communication System (WQ-XXX)
- routes/conversationroutes.js
- routes/messageroutes.js
- frontend/src/components/Communication/...
```

## Step 4: Generate Commit Message

Use WORKLIST completed items and file analysis to draft message.

**Format:**
```
<short summary line - 50 chars max>

<blank line>

<detailed summary grouped by feature>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

**Example:**
```
Hand history import, WQ skill, communication system

Hand History (WQ-065):
- PHHConverter service for format normalization
- Import endpoint with file upload support
- HandBrowser UI with filtering

Claude Code Workflow:
- New /project:wq skill for work queue management
- New /project:update-docs skill for documentation sync
- Updated CLAUDE.md and HANDOFF_PROTOCOL.md with skill refs

Communication System:
- Conversation and message routes
- Frontend components for messaging UI
- Notification context and hooks

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

## Step 5: Present for Approval

Show the user:

```markdown
## Proposed Commit

**Files to be committed:** 47 files

### Summary
[Generated commit message]

### File Groups

#### Hand History (WQ-065) — 12 files
- services/handHistory/PHHConverter.js
- [...]

#### Claude Code Skills — 8 files
- .claude/commands/wq.md
- [...]

### Options
1. **Commit all** — stage and commit everything shown
2. **Commit specific groups** — e.g., "Just Hand History and Skills"
3. **Edit message** — modify the commit message
4. **Abort** — don't commit, user will handle manually
```

## Step 6: Execute Commit (After Approval)

Only after explicit user approval:

```bash
# Stage files (if not already staged)
git add <files>

# Commit with message via heredoc for proper formatting
git commit -m "$(cat <<'EOF'
<commit message here>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# Show result
git log -1 --stat
```

---

## WORKLIST File Convention

WORKLIST files should follow this format for best results:

```markdown
# [Feature Name] WORKLIST

**WQ Item:** WQ-XXX
**Related Docs:**
- documents/handoffs/X-folder/SPEC_Feature.md
- documents/handoffs/X-folder/BRIEF_Feature.md

## Completed
- [x] Task that was done
- [x] Another completed task

## In Progress
- [ ] Task currently being worked on

## Deferred
- [ ] Task moved to future WQ

## Decisions
- Decision 1: Chose X because Y
- Decision 2: Deferred Z to future work
```

The skill extracts:
- WQ ID from `**WQ Item:**` line
- Completed work from `[x]` items
- Decisions from `## Decisions` section

---

## Rules

1. **Never commit without approval** — always present summary first
2. **Read WORKLIST files first** — they're the primary context source
3. **Fallback to code analysis** — if no WORKLIST covers a file, read headers and diffs
4. **Group logically** — don't just list files alphabetically
5. **Use WQ IDs** — reference them in commit message when known
6. **Keep summary line short** — 50 chars max for first line
7. **Include Co-Authored-By** — always add the Claude attribution
8. **Run pre-commit-check first** — if it fails, warn user before proceeding
9. **Flag low-confidence groups** — if grouping is based only on path inference, note "inferred from path" in presentation

## Security Enforcement

A git pre-commit hook automatically runs before every commit:
- Frontend linting
- Backend syntax checks
- Semgrep security scan (all rulesets)

If any check fails, the commit is blocked. The hook can be bypassed with `git commit --no-verify` but this should only be used in emergencies.

To run security checks manually before committing:
```bash
./scripts/security-scan.sh quick
```

To generate a full security report:
```bash
./scripts/security-scan.sh report
```
