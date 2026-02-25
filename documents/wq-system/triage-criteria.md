# Agent-Ready Task Triage Criteria

Criteria for identifying work queue items that an AI agent can complete autonomously with minimal human design input.

---

## Required: All Five Must Pass

### 1. Deterministic Output

The task has one correct outcome, not a design choice.

**Pass examples:**
- "Add a 404 page" — one obvious structure, mirrors existing error pages
- "Replace hardcoded font-sizes with tokens" — mechanical mapping, no judgment
- "Add Ctrl+Enter shortcut to modals" — well-defined behavior

**Fail examples:**
- "Redesign the dashboard layout" — infinite valid outcomes
- "Improve the onboarding flow" — requires UX research
- "Choose scoring thresholds" — requires domain expertise

### 2. Existing Pattern

The codebase already contains a precedent to follow.

**Pass examples:**
- New error page → ForbiddenPage already exists as a template
- New keyboard shortcut hook → useEffect + addEventListener is a standard React pattern
- Wiring an existing shared component (ConfirmModal) into a new location

**Fail examples:**
- First-ever implementation of a pattern (e.g., first drag-and-drop, first WebSocket)
- Integrating an external library not yet in the project
- Building a component type that has no existing analog

### 3. Mechanically Verifiable

Completion can be confirmed with a grep, test run, or deterministic check — not subjective review.

**Pass examples:**
- `grep -r 'font-size:\s*\d' frontend/src/` returns zero matches
- `<Route path="*">` exists in App.js
- Hook is imported and called in target modals

**Fail examples:**
- "Does this look right?" — visual/aesthetic judgment
- "Is the performance acceptable?" — requires benchmarking context
- "Is the UX intuitive?" — requires user testing

### 4. No API Lock / Schema Violations

The task stays within boundaries that don't require explicit permission or cross-system coordination.

**Pass examples:**
- Frontend-only changes (components, styles, hooks, pages)
- Documentation and tooling updates
- CSS token standardization
- Adding props to existing components

**Fail examples:**
- New database tables or columns (schema change)
- New or modified API endpoints (API lock)
- Infrastructure changes (Docker, CI/CD, deployment)
- Changes requiring coordinated backend + frontend work

### 5. No Unresolved Dependencies

All items in the task's `dependsOn` array are status `done`.

**Check:** `node documents/wq-system/wq-cli.js deps <WQ-ID>`

---

## Disqualifiers (Instant Fail)

Any of these make a task unsuitable regardless of the five criteria above:

| Disqualifier | Why |
|--------------|-----|
| Requires visual design judgment | Agent can't evaluate aesthetics |
| Ambiguous acceptance criteria | No way to know when "done" |
| Needs stakeholder taste/preference | Colors, copy, layouts, branding |
| Cross-system coordination | Backend + frontend + infra simultaneously |
| Status is `blocked` | Explicitly paused |
| Has active discussion/debate | Unresolved decisions in handoff docs |

---

## Scoring Rubric

For items that pass all five required criteria, score confidence 1-3:

| Score | Label | Meaning |
|-------|-------|---------|
| 3 | **Auto** | Agent can complete without any human input. Commit and close. |
| 2 | **Light review** | Agent can complete but human should spot-check the result before closing. |
| 1 | **Guided** | Agent can do the work but needs a decision or clarification partway through. |

### Score 3 indicators:
- Pure mechanical replacement (find X, replace with Y)
- Exact template to copy (new page mirroring existing page)
- Wiring existing components together
- Adding a well-defined behavior (keyboard shortcut, confirmation dialog)

### Score 2 indicators:
- Multiple valid token mappings to choose from (closest-match judgment)
- New component using existing patterns but with minor adaptation
- Changes touching many files (high blast radius, low complexity per file)

### Score 1 indicators:
- Task description is clear but spec has open questions
- Requires reading and interpreting a handoff doc to determine scope
- Backwards-compatibility concerns with existing consumers

---

## Output Format

When triaging, present results in three groups:

```markdown
### Agent-Ready (Score 3)
| WQ | Title | Why |
|----|-------|-----|

### Light Review (Score 2)
| WQ | Title | Why | Review needed |
|----|-------|-----|---------------|

### Needs Human Input
| WQ | Title | Blocking reason |
|----|-------|-----------------|
```

---

## Examples From Practice

### Agent-ready (this session):
- **WQ-189** (404 page): Score 3. ForbiddenPage template exists. One route, one component, one CSS file.
- **WQ-147** (Ctrl+Enter): Score 3. Standard useEffect hook. Five modals to wire. Mechanically verifiable.
- **WQ-171** (Font tokens): Score 3. Grep-defined scope. Deterministic mapping. 151 files but zero judgment.

### Light review (this session):
- **WQ-136** (CardPicker onChange): Score 2. API extension is deterministic, but existing consumers need spot-checking for regressions.
- **WQ-168** (Session confirm): Score 2. ConfirmModal pattern exists, but message copy required minor judgment.

### Deferred (this session):
- **WQ-149** (Game Tree): Needs human — visual/UX design, no existing pattern.
- **WQ-074** (PPT Weights): Needs human — domain expertise for scoring model.
- **WQ-133** (Rate Limiting): Needs human — cross-system (infra + backend + frontend).
