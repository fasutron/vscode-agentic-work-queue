#!/usr/bin/env node
/**
 * Work Queue CLI
 *
 * Manages work_queue.json with CRUD operations.
 * Designed to be portable across projects using the WQ system.
 *
 * Usage:
 *   node wq-cli.js create "Title" --track=coach --phase=pre-beta
 *   node wq-cli.js status WQ-065 active
 *   node wq-cli.js edit WQ-065 --priority=5 --tags="ui,frontend"
 *   node wq-cli.js view WQ-065
 *   node wq-cli.js list [filter]
 *   node wq-cli.js next-id
 */

const fs = require('fs');
const path = require('path');

// Paths relative to this script's location
const SCRIPT_DIR = __dirname;
const WQ_PATH = path.join(SCRIPT_DIR, '../handoffs/work_queue.json');
const HANDOFFS_DIR = path.join(SCRIPT_DIR, '../handoffs');

// Hardcoded fallbacks when work_queue.json has no settings block
const DEFAULT_STATUS_FOLDER = {
  intake: '1-pending',
  ready: '1-pending',
  active: '2-in_progress',
  blocked: '2-in_progress',
  done: '3-completed',
  archive: '3-completed',
};
const DEFAULT_VALID_TRACKS = ['player', 'coach', 'quiz', 'infra', 'platform', 'production'];
const DEFAULT_VALID_PHASES = ['pre-beta', 'beta', 'post-beta', 'production'];

/**
 * Read validation lists from work_queue.json settings, with hardcoded fallback.
 * Called at the start of each command — not cached as module-level constants.
 */
function getWQSettings(wq) {
  if (wq && wq.settings) {
    const s = wq.settings;
    return {
      STATUS_FOLDER: Object.fromEntries((s.statuses || []).map(e => [e.id, e.folder])),
      VALID_STATUSES: (s.statuses || []).map(e => e.id),
      VALID_TRACKS: (s.tracks || []).map(e => e.id),
      VALID_PHASES: (s.phases || []).map(e => e.id),
    };
  }
  return {
    STATUS_FOLDER: DEFAULT_STATUS_FOLDER,
    VALID_STATUSES: Object.keys(DEFAULT_STATUS_FOLDER),
    VALID_TRACKS: DEFAULT_VALID_TRACKS,
    VALID_PHASES: DEFAULT_VALID_PHASES,
  };
}

// ============================================================
// UTILITIES
// ============================================================

function loadWQ() {
  if (!fs.existsSync(WQ_PATH)) {
    console.error(`Error: work_queue.json not found at ${WQ_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(WQ_PATH, 'utf8'));
}

function saveWQ(wq) {
  wq.lastModified = new Date().toISOString();
  fs.writeFileSync(WQ_PATH, JSON.stringify(wq, null, 2));
}

function findItem(wq, id) {
  const normalized = id.toUpperCase();
  return wq.items.find(item => item.id.toUpperCase() === normalized);
}

function getNextId(wq) {
  const maxId = wq.items.reduce((max, item) => {
    const num = parseInt(item.id.replace('WQ-', ''));
    return num > max ? num : max;
  }, 0);
  return `WQ-${maxId + 1}`;
}

function parseArgs(args) {
  const result = { _positional: [] };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('='); // Handle values with = in them

      if (value === '') {
        result[key] = true;
      } else if (value.includes(',')) {
        result[key] = value.split(',').map(v => v.trim());
      } else {
        result[key] = value;
      }
    } else {
      result._positional.push(arg);
    }
  }

  return result;
}

function folderForStatus(status, statusFolder) {
  return (statusFolder || DEFAULT_STATUS_FOLDER)[status] || '1-pending';
}

// ============================================================
// COMMANDS
// ============================================================

function cmdCreate(args) {
  const parsed = parseArgs(args);
  const title = parsed._positional[0];

  if (!title) {
    console.error('Error: Title is required');
    console.error('Usage: wq-cli.js create "Title" --track=coach --phase=pre-beta');
    process.exit(1);
  }

  const wq = loadWQ();
  const cfg = getWQSettings(wq);

  if (!parsed.track || !cfg.VALID_TRACKS.includes(parsed.track)) {
    console.error(`Error: --track is required. Valid: ${cfg.VALID_TRACKS.join(', ')}`);
    process.exit(1);
  }

  if (!parsed.phase || !cfg.VALID_PHASES.includes(parsed.phase)) {
    console.error(`Error: --phase is required. Valid: ${cfg.VALID_PHASES.join(', ')}`);
    process.exit(1);
  }
  const ts = new Date().toISOString();
  const id = getNextId(wq);

  const newItem = {
    id,
    title,
    summary: parsed.summary || '',
    status: 'intake',
    track: parsed.track,
    phase: parsed.phase,
    priority: parseInt(parsed.priority) || 50,
    effort: parsed.effort || null,
    tags: Array.isArray(parsed.tags) ? parsed.tags : (parsed.tags ? [parsed.tags] : []),
    documents: [],
    dependsOn: Array.isArray(parsed.depends) ? parsed.depends : (parsed.depends ? [parsed.depends] : []),
    blocks: [],
    createdAt: ts,
    updatedAt: ts,
  };

  // Handle document creation
  if (parsed['doc-type']) {
    const docType = parsed['doc-type'];
    const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, '_');
    const prefix = docType.toUpperCase();
    const filename = `${prefix}_${safeTitle}.md`;
    const docPath = `1-pending/${filename}`;
    const fullPath = path.join(HANDOFFS_DIR, docPath);

    // Create stub document
    const stub = `# ${title}\n\n**WQ:** ${id}\n**Status:** intake\n\n## Overview\n\n_TODO: Add description_\n`;
    fs.writeFileSync(fullPath, stub);

    newItem.documents.push({ type: docType, path: docPath });
    console.log(`Created document: ${docPath}`);
  }

  wq.items.push(newItem);
  saveWQ(wq);

  console.log(`\n✅ Created ${id}: "${title}"`);
  console.log(`   Track: ${newItem.track} | Phase: ${newItem.phase} | Priority: ${newItem.priority}`);
  console.log(`   Status: intake | Folder: 1-pending/`);

  // Output JSON for programmatic use
  if (parsed.json) {
    console.log(JSON.stringify(newItem, null, 2));
  }

  return newItem;
}

function cmdStatus(args) {
  const [id, newStatus] = args;

  if (!id || !newStatus) {
    console.error('Usage: wq-cli.js status WQ-065 active');
    process.exit(1);
  }

  const wq = loadWQ();
  const cfg = getWQSettings(wq);

  if (!cfg.VALID_STATUSES.includes(newStatus)) {
    console.error(`Error: Invalid status. Valid: ${cfg.VALID_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const item = findItem(wq, id);

  if (!item) {
    console.error(`Error: Item ${id} not found`);
    process.exit(1);
  }

  const oldStatus = item.status;
  const oldFolder = folderForStatus(oldStatus, cfg.STATUS_FOLDER);
  const newFolder = folderForStatus(newStatus, cfg.STATUS_FOLDER);

  // Check dependencies if moving to active
  if (newStatus === 'active' && item.dependsOn.length > 0) {
    const incomplete = item.dependsOn.filter(depId => {
      const dep = findItem(wq, depId);
      return dep && dep.status !== 'done';
    });

    if (incomplete.length > 0) {
      console.log('\n⚠️  DEPENDENCY WARNING');
      console.log(`${id} depends on incomplete items:`);
      for (const depId of incomplete) {
        const dep = findItem(wq, depId);
        console.log(`  - ${depId}: "${dep?.title}" (status: ${dep?.status})`);
      }
      console.log('\nProceeding anyway...');
    }
  }

  // Move documents if folder changed
  if (oldFolder !== newFolder) {
    for (const doc of item.documents) {
      const oldPath = path.join(HANDOFFS_DIR, doc.path);
      const filename = path.basename(doc.path);
      const newPath = path.join(HANDOFFS_DIR, newFolder, filename);

      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        doc.path = `${newFolder}/${filename}`;
        console.log(`Moved: ${filename} → ${newFolder}/`);
      }
    }
  }

  item.status = newStatus;
  item.updatedAt = new Date().toISOString();
  saveWQ(wq);

  console.log(`\n✅ ${id} status: ${oldStatus} → ${newStatus}`);

  if (oldFolder !== newFolder) {
    console.log(`   Files moved to: ${newFolder}/`);
  }

  // Remind about completion summary
  if (newStatus === 'done') {
    console.log('\n📝 Remember to add completion summary to the handoff file.');
    console.log('   See HANDOFF_PROTOCOL.md Section 7 for format.');

    // Check for unblocked items
    const unblocked = wq.items.filter(other =>
      other.dependsOn.includes(id) && other.status !== 'done'
    );
    if (unblocked.length > 0) {
      console.log('\n🔓 Unblocked items:');
      for (const u of unblocked) {
        console.log(`   - ${u.id}: "${u.title}"`);
      }
    }
  }
}

function cmdEdit(args) {
  const parsed = parseArgs(args);
  const id = parsed._positional[0];

  if (!id) {
    console.error('Usage: wq-cli.js edit WQ-065 --priority=5 --tags="ui,frontend"');
    process.exit(1);
  }

  const wq = loadWQ();
  const cfg = getWQSettings(wq);
  const item = findItem(wq, id);

  if (!item) {
    console.error(`Error: Item ${id} not found`);
    process.exit(1);
  }

  const changes = [];

  // Validate track/phase if provided
  if (parsed.track !== undefined && !cfg.VALID_TRACKS.includes(parsed.track)) {
    console.error(`Error: Invalid track "${parsed.track}". Valid: ${cfg.VALID_TRACKS.join(', ')}`);
    process.exit(1);
  }
  if (parsed.phase !== undefined && !cfg.VALID_PHASES.includes(parsed.phase)) {
    console.error(`Error: Invalid phase "${parsed.phase}". Valid: ${cfg.VALID_PHASES.join(', ')}`);
    process.exit(1);
  }

  // Simple field updates
  const simpleFields = ['title', 'summary', 'effort', 'track', 'phase'];
  for (const field of simpleFields) {
    if (parsed[field] !== undefined) {
      changes.push(`${field}: "${item[field]}" → "${parsed[field]}"`);
      item[field] = parsed[field];
    }
  }

  // Priority (numeric)
  if (parsed.priority !== undefined) {
    const newPriority = parseInt(parsed.priority);
    changes.push(`priority: ${item.priority} → ${newPriority}`);
    item.priority = newPriority;
  }

  // Tags (replace or add)
  if (parsed.tags !== undefined) {
    const newTags = Array.isArray(parsed.tags) ? parsed.tags : [parsed.tags];
    changes.push(`tags: [${item.tags.join(', ')}] → [${newTags.join(', ')}]`);
    item.tags = newTags;
  }
  if (parsed['add-tag']) {
    const tag = parsed['add-tag'];
    if (!item.tags.includes(tag)) {
      item.tags.push(tag);
      changes.push(`tags: added "${tag}"`);
    }
  }

  // Dependencies (replace or add)
  if (parsed.depends !== undefined) {
    const newDeps = Array.isArray(parsed.depends) ? parsed.depends : [parsed.depends];
    changes.push(`dependsOn: [${item.dependsOn.join(', ')}] → [${newDeps.join(', ')}]`);
    item.dependsOn = newDeps;
  }
  if (parsed['add-depends']) {
    const dep = parsed['add-depends'];
    if (!item.dependsOn.includes(dep)) {
      item.dependsOn.push(dep);
      changes.push(`dependsOn: added "${dep}"`);
    }
  }

  // Add document
  if (parsed['add-doc']) {
    const [type, docPath] = parsed['add-doc'].split(':');
    item.documents.push({ type, path: docPath });
    changes.push(`documents: added ${type}:${docPath}`);
  }

  if (changes.length === 0) {
    console.log('No changes specified.');
    process.exit(0);
  }

  item.updatedAt = new Date().toISOString();
  saveWQ(wq);

  console.log(`\n✅ Updated ${id}:`);
  for (const change of changes) {
    console.log(`   ${change}`);
  }
}

function cmdView(args) {
  const [id] = args;

  if (!id) {
    console.error('Usage: wq-cli.js view WQ-065');
    process.exit(1);
  }

  const wq = loadWQ();
  const cfg = getWQSettings(wq);
  const item = findItem(wq, id);

  if (!item) {
    console.error(`Error: Item ${id} not found`);
    process.exit(1);
  }

  const folder = folderForStatus(item.status, cfg.STATUS_FOLDER);

  console.log(`\n## ${item.id}: ${item.title}\n`);
  console.log(`**Status**: ${item.status} (files in ${folder}/)`);
  console.log(`**Track**: ${item.track} | **Phase**: ${item.phase}`);
  console.log(`**Priority**: ${item.priority}${item.effort ? ` | **Effort**: ${item.effort}` : ''}`);

  if (item.summary) {
    console.log(`\n**Summary**:\n${item.summary}`);
  }

  if (item.tags.length > 0) {
    console.log(`\n**Tags**: ${item.tags.join(', ')}`);
  }

  if (item.dependsOn.length > 0) {
    console.log('\n**Dependencies**:');
    for (const depId of item.dependsOn) {
      const dep = findItem(wq, depId);
      const status = dep ? (dep.status === 'done' ? '✅' : '⏳') : '❓';
      console.log(`  - ${depId}: "${dep?.title || 'Unknown'}" ${status} ${dep?.status || ''}`);
    }
  }

  if (item.blocks.length > 0) {
    console.log('\n**Blocks**:');
    for (const blockId of item.blocks) {
      const blocked = findItem(wq, blockId);
      console.log(`  - ${blockId}: "${blocked?.title || 'Unknown'}" (${blocked?.status || 'unknown'})`);
    }
  }

  if (item.documents.length > 0) {
    console.log('\n**Documents**:');
    for (const doc of item.documents) {
      console.log(`  - [${doc.type}] ${doc.path}`);
    }
  }

  console.log(`\n**Created**: ${item.createdAt?.slice(0, 10)} | **Updated**: ${item.updatedAt?.slice(0, 10)}`);
}

function cmdList(args) {
  const [filter] = args;
  const wq = loadWQ();
  const cfg = getWQSettings(wq);

  let items = wq.items;
  let filterLabel = 'all active';

  if (filter) {
    if (cfg.VALID_STATUSES.includes(filter)) {
      items = items.filter(i => i.status === filter);
      filterLabel = `status=${filter}`;
    } else if (cfg.VALID_TRACKS.includes(filter)) {
      items = items.filter(i => i.track === filter);
      filterLabel = `track=${filter}`;
    } else if (cfg.VALID_PHASES.includes(filter)) {
      items = items.filter(i => i.phase === filter);
      filterLabel = `phase=${filter}`;
    } else {
      console.error(`Unknown filter: ${filter}`);
      console.error(`Valid: ${[...cfg.VALID_STATUSES, ...cfg.VALID_TRACKS, ...cfg.VALID_PHASES].join(', ')}`);
      process.exit(1);
    }
  } else {
    // Default: non-done, non-archived
    items = items.filter(i => !['done', 'archive'].includes(i.status));
  }

  // Sort by priority
  items.sort((a, b) => a.priority - b.priority);

  console.log(`\n## Work Queue: ${filterLabel}\n`);
  console.log('| ID | Title | Track | Phase | Priority | Status |');
  console.log('|----|-------|-------|-------|----------|--------|');

  for (const item of items) {
    const title = item.title.length > 35 ? item.title.slice(0, 32) + '...' : item.title;
    console.log(`| ${item.id} | ${title} | ${item.track} | ${item.phase} | ${item.priority} | ${item.status} |`);
  }

  console.log(`\nTotal: ${items.length} items`);
}

function cmdNextId() {
  const wq = loadWQ();
  console.log(getNextId(wq));
}

function cmdDeps(args) {
  const parsed = parseArgs(args);
  const id = parsed._positional[0];
  const wq = loadWQ();

  // Mode: --blocked (show all items with unmet dependencies)
  if (parsed.blocked) {
    const blocked = wq.items.filter(item => {
      if (['done', 'archive'].includes(item.status)) return false;
      if (!item.dependsOn || item.dependsOn.length === 0) return false;

      return item.dependsOn.some(depId => {
        const dep = findItem(wq, depId);
        return !dep || dep.status !== 'done';
      });
    });

    if (blocked.length === 0) {
      console.log('\n✅ No items with unmet dependencies.');
      return;
    }

    console.log('\n## Items with Unmet Dependencies\n');
    for (const item of blocked) {
      console.log(`**${item.id}**: ${item.title}`);
      console.log(`  Status: ${item.status}`);
      console.log('  Waiting on:');
      for (const depId of item.dependsOn) {
        const dep = findItem(wq, depId);
        if (!dep || dep.status !== 'done') {
          const status = dep ? dep.status : 'NOT FOUND';
          console.log(`    - ${depId}: ${dep?.title || 'Unknown'} (${status})`);
        }
      }
      console.log('');
    }
    console.log(`Total: ${blocked.length} items blocked`);
    return;
  }

  // Mode: deps WQ-XXX (show what this item depends on)
  // Mode: deps WQ-XXX --reverse (show what depends on this item)
  if (!id) {
    console.error('Usage:');
    console.error('  wq-cli.js deps WQ-065              # What does WQ-065 depend on?');
    console.error('  wq-cli.js deps WQ-065 --reverse    # What depends on WQ-065?');
    console.error('  wq-cli.js deps --blocked           # Show all items with unmet deps');
    process.exit(1);
  }

  const item = findItem(wq, id);
  if (!item) {
    console.error(`Error: Item ${id} not found`);
    process.exit(1);
  }

  if (parsed.reverse) {
    // Find items that depend on this one
    const dependents = wq.items.filter(other =>
      other.dependsOn && other.dependsOn.includes(item.id)
    );

    console.log(`\n## Items that depend on ${item.id}: "${item.title}"\n`);

    if (dependents.length === 0) {
      console.log('No items depend on this one.');
      return;
    }

    for (const dep of dependents) {
      const status = dep.status === 'done' ? '✅' : '⏳';
      console.log(`  ${status} ${dep.id}: "${dep.title}" (${dep.status})`);
    }
    console.log(`\nTotal: ${dependents.length} dependents`);
  } else {
    // Show what this item depends on
    console.log(`\n## Dependencies for ${item.id}: "${item.title}"\n`);

    if (!item.dependsOn || item.dependsOn.length === 0) {
      console.log('No dependencies.');
      return;
    }

    let unmetCount = 0;
    for (const depId of item.dependsOn) {
      const dep = findItem(wq, depId);
      const isDone = dep && dep.status === 'done';
      const status = isDone ? '✅' : '⏳';
      if (!isDone) unmetCount++;
      console.log(`  ${status} ${depId}: "${dep?.title || 'Unknown'}" (${dep?.status || 'NOT FOUND'})`);
    }

    console.log(`\nTotal: ${item.dependsOn.length} dependencies (${unmetCount} unmet)`);
  }
}

function cmdFind(args) {
  const parsed = parseArgs(args);
  const searchPath = parsed._positional[0];

  if (!searchPath) {
    console.error('Usage: wq-cli.js find <path-or-filename>');
    console.error('');
    console.error('Examples:');
    console.error('  wq-cli.js find SPEC_Hand_Browser.md');
    console.error('  wq-cli.js find 1-pending/SPEC_Hand_Browser.md');
    console.error('  wq-cli.js find documents/handoffs/1-pending/SPEC_Hand_Browser.md');
    process.exit(1);
  }

  const wq = loadWQ();
  const cfg = getWQSettings(wq);

  // Normalize the search path - extract just the filename or relative path
  const normalizedSearch = searchPath
    .replace(/\\/g, '/')  // Normalize Windows paths
    .replace(/^.*documents\/handoffs\//, '')  // Remove absolute prefix
    .toLowerCase();

  const filename = path.basename(normalizedSearch);

  const matches = [];

  for (const item of wq.items) {
    if (!item.documents || item.documents.length === 0) continue;

    for (const doc of item.documents) {
      if (!doc.path) continue;  // Skip documents without paths

      const docPath = doc.path.toLowerCase();
      const docFilename = path.basename(docPath);

      // Match on filename or full relative path
      if (docFilename === filename || docPath === normalizedSearch || docPath.endsWith(normalizedSearch)) {
        matches.push({
          item,
          doc,
          matchType: docFilename === filename ? 'filename' : 'path'
        });
      }
    }
  }

  if (matches.length === 0) {
    console.log(`\n❌ No WQ item found with document: ${searchPath}`);
    console.log('\nTip: Try searching by filename only, e.g.:');
    console.log(`  wq-cli.js find ${path.basename(searchPath)}`);
    return;
  }

  console.log(`\n## WQ Items for: ${searchPath}\n`);

  for (const match of matches) {
    const { item, doc } = match;
    const folder = folderForStatus(item.status, cfg.STATUS_FOLDER);

    console.log(`**${item.id}**: ${item.title}`);
    console.log(`  Status: ${item.status} (${folder}/)`);
    console.log(`  Track: ${item.track} | Phase: ${item.phase}`);
    console.log(`  Document: [${doc.type}] ${doc.path}`);
    if (item.summary) {
      console.log(`  Summary: ${item.summary.slice(0, 80)}${item.summary.length > 80 ? '...' : ''}`);
    }
    console.log('');
  }

  if (matches.length > 1) {
    console.log(`⚠️  Multiple matches found (${matches.length}). Document may be linked to multiple WQ items.`);
  }
}

// ============================================================
// MAIN
// ============================================================

const [,, command, ...args] = process.argv;

// Lazy settings for help text (avoid crashing if work_queue.json is missing)
const helpCfg = getWQSettings(fs.existsSync(WQ_PATH) ? JSON.parse(fs.readFileSync(WQ_PATH, 'utf8')) : null);

switch (command) {
  case 'create':
    cmdCreate(args);
    break;
  case 'status':
    cmdStatus(args);
    break;
  case 'edit':
    cmdEdit(args);
    break;
  case 'view':
    cmdView(args);
    break;
  case 'list':
    cmdList(args);
    break;
  case 'next-id':
    cmdNextId();
    break;
  case 'deps':
    cmdDeps(args);
    break;
  case 'find':
    cmdFind(args);
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    console.log(`
Work Queue CLI

Usage:
  wq-cli.js create "Title" --track=<track> --phase=<phase> [options]
  wq-cli.js status <WQ-ID> <new-status>
  wq-cli.js edit <WQ-ID> [options]
  wq-cli.js view <WQ-ID>
  wq-cli.js list [filter]
  wq-cli.js deps <WQ-ID> [--reverse]
  wq-cli.js deps --blocked
  wq-cli.js find <path-or-filename>
  wq-cli.js next-id

Create Options:
  --track=       Required. ${helpCfg.VALID_TRACKS.join(' | ')}
  --phase=       Required. ${helpCfg.VALID_PHASES.join(' | ')}
  --summary=     Brief description
  --priority=    Number (lower = higher priority, default: 50)
  --effort=      Estimate: "2h", "1d", "3d", "1w"
  --tags=        Comma-separated tags
  --depends=     Comma-separated WQ IDs
  --doc-type=    Create stub document: brief | spec | notes

Edit Options:
  --title=       New title
  --summary=     New summary
  --track=       New track (${helpCfg.VALID_TRACKS.join(' | ')})
  --phase=       New phase (${helpCfg.VALID_PHASES.join(' | ')})
  --priority=    New priority
  --effort=      New effort estimate
  --tags=        Replace tags (comma-separated)
  --add-tag=     Add single tag
  --depends=     Replace dependencies
  --add-depends= Add single dependency
  --add-doc=     Add document (format: type:path)

Deps Options:
  --reverse      Show items that depend ON this item (reverse lookup)
  --blocked      Show all items with unmet dependencies

Find:
  Looks up which WQ item(s) a handoff document belongs to.
  Accepts filename, relative path, or full path.

Statuses: ${helpCfg.VALID_STATUSES.join(', ')}
Tracks: ${helpCfg.VALID_TRACKS.join(', ')}
Phases: ${helpCfg.VALID_PHASES.join(', ')}
`);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Run with --help for usage');
    process.exit(1);
}
