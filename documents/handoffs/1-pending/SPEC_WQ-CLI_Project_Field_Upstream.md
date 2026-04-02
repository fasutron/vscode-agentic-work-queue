# SPEC: WQ CLI — Project Field Support (Upstream)

**Target repo:** [vscode-agentic-work-queue](https://github.com/fasutron/vscode-agentic-work-queue)
**Requested by:** MH4K workspace (WQ-006 dependency)
**Date:** 2026-04-02

---

## Problem

The WQ CLI currently has no concept of "project." In a multi-project workspace (like MH4K, which spans SPIN, Pan-GEM, WONDER, and shared infrastructure), all WQ items appear in a single flat list with no way to scope operations by project. This makes it hard to:

- Filter work queues to show only one project's items
- Enforce that new items are tagged to a project
- Generate per-project views or dashboards

The fix belongs upstream because project scoping is a generic capability that benefits any multi-project workspace using the WQ system.

---

## Requirements

### 1. New `project` field on WQ items

Add an optional `project` string field to WQ items. It sits alongside `track`, `phase`, and `tags`.

```json
{
  "id": "WQ-006",
  "title": "Multi-Project Workspace Architecture",
  "project": "coordination",
  "track": "infra",
  "phase": "planning",
  ...
}
```

**Backward compatibility:** Items without a `project` field continue to work. All existing commands behave identically when `project` is absent.

### 2. New `projects` setting in `work_queue.json`

Add an optional `projects` array to the `settings` block, following the same pattern as `statuses`, `tracks`, and `phases`:

```json
{
  "settings": {
    "projects": [
      { "id": "spin", "label": "SPIN", "color": "#ec4899" },
      { "id": "pangem", "label": "Pan-GEM", "color": "#14b8a6" },
      { "id": "wonder", "label": "WONDER", "color": "#6366f1" },
      { "id": "shared", "label": "Shared", "color": "#eab308" },
      { "id": "infra", "label": "Infrastructure", "color": "#f97316" },
      { "id": "coordination", "label": "Coordination", "color": "#a855f7" }
    ]
  }
}
```

When `projects` is defined, `project` values are validated against this list (same as tracks/phases).

When `projects` is absent, the `project` field is freeform text (no validation).

### 3. New `requireProject` setting (boolean, default `false`)

```json
{
  "settings": {
    "requireProject": true,
    "projects": [ ... ]
  }
}
```

When `true`, `wq create` requires `--project=<value>`. When `false` or absent, `--project` is optional on create. This lets multi-project workspaces enforce project tagging without breaking single-project users.

### 4. `--project` flag on CLI commands

#### `create`

```bash
# When requireProject is true:
wq create "Title" --track=backend --phase=dev --project=spin

# When requireProject is false:
wq create "Title" --track=backend --phase=dev              # OK, no project
wq create "Title" --track=backend --phase=dev --project=spin  # Also OK
```

Validation: if `settings.projects` exists, validate against the list. If not, accept any string.

#### `list`

```bash
wq list --project=spin           # Filter to SPIN items only
wq list active --project=spin    # Combine with status filter
wq list --project=spin,pangem    # Multiple projects (comma-separated)
```

**Implementation note:** `cmdList` currently takes a single positional filter arg and checks if it matches a status, track, or phase. The `--project` flag should be parsed via `parseArgs()` as a named flag, so it can combine with the existing positional filter. This avoids breaking the current `wq list active` syntax.

When filtering by project, add a `Project` column to the table output. When not filtering (or when any items have a `project` field), also show the column.

#### `view`

Display `project` in the output, between Status and Track:

```
**Status**: active (files in 2-in_progress/)
**Project**: spin
**Track**: spin-backend | **Phase**: planning
```

Only show the line if the item has a `project` field.

#### `edit`

```bash
wq edit WQ-006 --project=coordination
```

Add `'project'` to the `simpleFields` array (line ~336 in current code). Add validation against `VALID_PROJECTS` if `settings.projects` is defined, same pattern as track/phase validation.

#### `deps`

No changes needed. Dependencies are project-agnostic (cross-project deps are valid).

#### `find`

No changes needed.

#### `normalize`

No changes needed.

### 5. `getWQSettings()` changes

Extract `VALID_PROJECTS` from `settings.projects` array. Add `requireProject` boolean. Return both in the settings object.

```javascript
function getWQSettings(wq) {
  if (wq && wq.settings) {
    const s = wq.settings;
    return {
      STATUS_FOLDER: Object.fromEntries((s.statuses || []).map(e => [e.id, e.folder])),
      VALID_STATUSES: (s.statuses || []).map(e => e.id),
      VALID_TRACKS: (s.tracks || []).map(e => e.id),
      VALID_PHASES: (s.phases || []).map(e => e.id),
      VALID_PROJECTS: (s.projects || []).map(e => e.id),
      REQUIRE_PROJECT: s.requireProject || false,
    };
  }
  return {
    STATUS_FOLDER: DEFAULT_STATUS_FOLDER,
    VALID_STATUSES: Object.keys(DEFAULT_STATUS_FOLDER),
    VALID_TRACKS: DEFAULT_VALID_TRACKS,
    VALID_PHASES: DEFAULT_VALID_PHASES,
    VALID_PROJECTS: [],
    REQUIRE_PROJECT: false,
  };
}
```

### 6. Help text updates

Add `--project=` to create options, edit options, and list options. Add projects to the footer alongside statuses/tracks/phases:

```
Projects: spin, pangem, wonder, shared, infra, coordination
```

Only show this line if `settings.projects` is defined.

---

## Changes by Function (Reference: current wq-cli.js)

| Function | Line(s) | Change |
|----------|---------|--------|
| `getWQSettings()` | ~41-57 | Add `VALID_PROJECTS`, `REQUIRE_PROJECT` extraction |
| `cmdCreate()` | ~138-209 | Add `--project` parsing, validation, add to `newItem` object (~line 163-178) |
| `cmdList()` | ~474-515 | Switch from `const [filter] = args` to `parseArgs(args)`. Add `--project` filter. Add Project column to table when relevant. |
| `cmdView()` | ~408-471 | Add `**Project**: ${item.project}` line after Status line |
| `cmdEdit()` | ~305-406 | Add `'project'` to `simpleFields` array (~line 336). Add validation against `VALID_PROJECTS` (~line 326-333 pattern) |
| Help text | ~759-812 | Add `--project=` to create/edit/list options. Add Projects line to footer. |

---

## Backward Compatibility Checklist

- [ ] Existing `work_queue.json` files without `projects` setting continue to work
- [ ] Existing items without `project` field continue to work in all commands
- [ ] `wq create` without `--project` works when `requireProject` is false or absent
- [ ] `wq list` without `--project` shows all items (current behavior)
- [ ] `wq list active` (positional filter) continues to work unchanged
- [ ] `wq view` on items without `project` field shows no Project line
- [ ] `wq edit` without `--project` doesn't clear existing project field
- [ ] No new runtime dependencies

---

## Test Scenarios

### Single-project workspace (no projects setting)

```bash
# All existing commands work identically
wq create "Task" --track=frontend --phase=dev        # OK, no project
wq list                                               # No Project column
wq view WQ-001                                        # No Project line
```

### Multi-project workspace (projects defined, requireProject: false)

```bash
wq create "Task" --track=backend --phase=dev                    # OK
wq create "Task" --track=backend --phase=dev --project=spin     # OK
wq create "Task" --track=backend --phase=dev --project=invalid  # ERROR: invalid project
wq list --project=spin                                           # Filtered, Project column shown
wq list                                                          # All items, Project column shown
```

### Multi-project workspace (projects defined, requireProject: true)

```bash
wq create "Task" --track=backend --phase=dev                    # ERROR: --project required
wq create "Task" --track=backend --phase=dev --project=spin     # OK
```

---

## Out of Scope

These are NOT part of this spec:

- **Per-project handoff directories** — handoffs stay in the shared status folders (1-pending/, 2-in_progress/, 3-completed/). Project-specific handoff routing is a future consideration.
- **Project-specific WQ files** — all items stay in one `work_queue.json`. Splitting into per-project files would break cross-project dependency tracking.
- **Dashboard integration** — WQ-009 (Task Dashboard) will consume the project field, but that's a separate item.
- **VSCode extension UI changes** — the extension's webview can use the project field for filtering, but UI changes are a separate PR.

---

## Implementation Notes

This is a small, self-contained change. The pattern for adding `project` mirrors how `track` and `phase` already work:
1. Setting in `work_queue.json` defines valid values
2. `getWQSettings()` extracts them
3. `cmdCreate()` validates and sets the field
4. `cmdEdit()` allows updating it
5. `cmdList()` filters by it
6. `cmdView()` displays it

The only non-trivial part is `cmdList()`, which currently uses a positional arg for filtering. The `--project` flag needs `parseArgs()` support, which means changing from `const [filter] = args` to `const parsed = parseArgs(args); const filter = parsed._positional[0];` and then adding `const projectFilter = parsed.project;` for the named flag. This is a clean change that doesn't break the positional filter.
