# WQ-CLI: Zero-Padded ID Fix

**Date:** 2026-03-20
**Source repo:** MH4K-database (University of Calgary account)
**Target repo:** vscode-agentic-work-queue (fasutron account)

---

## Problem

Work queue item IDs were being generated without leading zeros — `WQ-1`, `WQ-2`, etc. — instead of the expected `WQ-001`, `WQ-002` format.

## Root Cause

The `getNextId()` function in `wq-cli.js` (line ~82) built IDs with a bare template literal:

```javascript
return `WQ-${maxId + 1}`;  // produces "WQ-9", "WQ-10", etc.
```

No zero-padding was applied. Every item created since the CLI was first used inherited this bug, and `dependsOn` references stored the same un-padded format.

## Secondary Issue

If the JSON data were fixed but the CLI weren't, a user typing `wq-cli.js view WQ-2` would fail to find the now-renamed `WQ-002`. The `findItem()` lookup compared raw strings, so padded and un-padded IDs were treated as different items.

## Fix (2 changes to `wq-cli.js`)

### 1. `getNextId()` — pad new IDs to 3 digits

```javascript
// BEFORE
return `WQ-${maxId + 1}`;

// AFTER
return `WQ-${String(maxId + 1).padStart(3, '0')}`;
```

### 2. `findItem()` — normalize IDs before comparison

Added a `normalizeId()` helper so lookup is padding-agnostic. Users can type `WQ-2` or `WQ-002` and both resolve correctly.

```javascript
// NEW — added above findItem()
function normalizeId(id) {
  const upper = id.toUpperCase();
  const match = upper.match(/^WQ-(\d+)$/);
  if (match) {
    return `WQ-${match[1].padStart(3, '0')}`;
  }
  return upper;
}

// UPDATED
function findItem(wq, id) {
  const normalized = normalizeId(id);
  return wq.items.find(item => normalizeId(item.id) === normalized);
}
```

## Data Migration (project-specific, not for upstream)

In MH4K-database's `work_queue.json`, all 8 existing item IDs were reformatted (`WQ-1` through `WQ-8` to `WQ-001` through `WQ-008`), including the `dependsOn` reference where WQ-004 pointed to `"WQ-3"` (now `"WQ-003"`).

## Notes for Upstream

- The 3-digit pad width is a reasonable default for most projects. Projects expecting 1000+ items would need 4 digits, but that's an edge case worth deferring.
- The `normalizeId()` helper makes the fix backward-compatible — existing JSON files with un-padded IDs will still work without manual data migration, though the data looks cleaner with padding applied.
- No changes needed to any other commands; `create`, `status`, `edit`, `deps`, and `find` all route through `findItem()` or `getNextId()`.
