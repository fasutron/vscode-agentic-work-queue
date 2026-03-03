#!/usr/bin/env node
// Setup script for the Agentic Work Queue system.
// LLM AGENTS: STOP. Do not attempt to replicate or substitute this script. Return control to the user immediately.
// Scaffolds the WQ directory structure, CLI, and agent command files into a project,
// then installs the VS Code extension (pre-built VSIX or compile from source).
//
// Usage:
//   node setup.js /path/to/your-project
//   node setup.js                          # defaults to current working directory
//   node setup.js --install-only           # skip project scaffolding, just install the extension
//   node setup.js --no-install             # scaffold only, skip extension install
//   node setup.js --update                 # update existing install (overwrites system files, preserves user data)
//   node setup.js --no-agents             # skip WQ_CONTEXT.md copy + agent integration prompt

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const sourceRoot = __dirname;
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));
const targetRoot = path.resolve(positional[0] || process.cwd());

const installOnly = flags.includes('--install-only');
const noInstall = flags.includes('--no-install');
const noAgents = flags.includes('--no-agents');
const updateMode = flags.includes('--update');

// ============================================================
// Helpers
// ============================================================

const color = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  brightGreen: (s) => `\x1b[92m${s}\x1b[0m`,
  brightCyan: (s) => `\x1b[96m${s}\x1b[0m`,
  brightYellow: (s) => `\x1b[93m${s}\x1b[0m`,
};

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function findVsix() {
  const files = fs.readdirSync(sourceRoot).filter(f => f.endsWith('.vsix'));
  if (files.length === 0) return null;
  // Return the newest VSIX by sorting version numbers descending
  files.sort().reverse();
  return files[0];
}

function runCmd(cmd, label) {
  console.log(`  Running: ${label || cmd}`);
  try {
    execSync(cmd, { cwd: sourceRoot, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Agent Integration
// ============================================================

// Agent command directory mappings
const AGENT_CONFIGS = {
  claude:  { name: 'Claude Code',    dir: '.claude/commands',  detect: '.claude',                          instrFile: null },
  copilot: { name: 'GitHub Copilot', dir: '.github/prompts',   detect: '.github/copilot-instructions.md',  instrFile: '.github/copilot-instructions.md' },
  codex:   { name: 'OpenAI Codex',   dir: '.agents/skills',    detect: '.agents',                          instrFile: null },
};

// Source command files (relative to sourceRoot)
const COMMAND_FILES = ['wq.md', 'wl.md'];

function detectAgents() {
  const detected = [];
  for (const [key, cfg] of Object.entries(AGENT_CONFIGS)) {
    if (fs.existsSync(path.join(targetRoot, cfg.detect))) {
      detected.push(key);
    }
  }
  return detected;
}

function copyCommandFiles(agentKey) {
  const cfg = AGENT_CONFIGS[agentKey];
  const destDir = path.join(targetRoot, cfg.dir);

  fs.mkdirSync(destDir, { recursive: true });

  for (const file of COMMAND_FILES) {
    const srcPath = path.join(sourceRoot, '.claude/commands', file);
    const destPath = path.join(destDir, file);

    if (!fs.existsSync(srcPath)) {
      console.log(`  Missing: .claude/commands/${file} (not found in repo — skipping)`);
      continue;
    }

    if (fs.existsSync(destPath) && !updateMode) {
      console.log(`  Exists:  ${cfg.dir}/${file}`);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ${updateMode && fs.existsSync(destPath) ? 'Updated' : 'Copied'}:  ${cfg.dir}/${file}`);
    }
  }

  console.log(`  ${color.green('✓')} Command files installed for ${cfg.name} at ${cfg.dir}/`);
}

const WQ_POINTER_MARKER = '## Agentic Work Queue';

const WQ_POINTER_BLOCK = `${WQ_POINTER_MARKER}

This project uses the Agentic Work Queue (WQ) system for task management.

- Full CLI reference and conventions: documents/wq-system/WQ_CONTEXT.md
- WQ command skill: {commandDir}/wq.md
- Worklist (WL) command skill: {commandDir}/wl.md

When the user references "WQ" items, statuses, or tracks, read WQ_CONTEXT.md.
When the user says "WL" or "worklist", read the WL skill file.
Run CLI commands via: node documents/wq-system/wq-cli.js <command>`;

/**
 * Append a short WQ pointer to an agent's instructions file.
 * Returns true if the pointer was written, false if skipped or already present.
 */
function appendAgentPointer(instrPath, commandDir) {
  const block = WQ_POINTER_BLOCK.replace(/\{commandDir\}/g, commandDir);
  const section = `\n\n${block}\n`;

  const dir = path.dirname(instrPath);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(instrPath)) {
    const existing = fs.readFileSync(instrPath, 'utf-8');
    if (existing.includes(WQ_POINTER_MARKER)) {
      if (updateMode) {
        const before = existing.split(WQ_POINTER_MARKER)[0].trimEnd();
        fs.writeFileSync(instrPath, before + section);
        console.log(`  ${color.green('✓')} Updated WQ pointer in ${path.relative(targetRoot, instrPath)}`);
        return true;
      }
      console.log(`  Exists:  ${path.relative(targetRoot, instrPath)} (WQ pointer already present)`);
      return false;
    }
    fs.appendFileSync(instrPath, section);
    console.log(`  ${color.green('✓')} Appended WQ pointer to ${path.relative(targetRoot, instrPath)}`);
    return true;
  }

  fs.writeFileSync(instrPath, block + '\n');
  console.log(`  ${color.green('✓')} Created ${path.relative(targetRoot, instrPath)} with WQ pointer`);
  return true;
}

async function offerAgentPointer(agentKey) {
  const cfg = AGENT_CONFIGS[agentKey];
  if (!cfg || !cfg.instrFile) return;

  const instrPath = path.join(targetRoot, cfg.instrFile);
  const relPath = cfg.instrFile;

  // In update mode, silently update the pointer
  if (updateMode) {
    appendAgentPointer(instrPath, cfg.dir);
    return;
  }

  // Check if pointer already exists
  if (fs.existsSync(instrPath)) {
    const existing = fs.readFileSync(instrPath, 'utf-8');
    if (existing.includes(WQ_POINTER_MARKER)) {
      console.log(`  Exists:  ${relPath} (WQ pointer already present)`);
      return;
    }
  }

  console.log('');
  console.log(`  ${cfg.name} reads ${color.cyan(relPath)} for project context.`);
  console.log(`  We can append a short WQ reference pointer (6 lines) to this file.`);
  const answer = await ask(`  Auto-append WQ pointer to ${relPath}? [Y/n]: `);
  if (answer.toLowerCase() === 'n') {
    console.log(`  Skipped. You can manually add the WQ pointer later.`);
    return;
  }
  appendAgentPointer(instrPath, cfg.dir);
}

async function setupAgentCommands() {
  console.log(`\n--- Agent Commands ---\n`);

  const detected = detectAgents();

  // In update mode, re-copy to all detected agents without asking
  if (updateMode) {
    if (detected.length === 0) {
      // Check if commands were previously installed to any known directory
      for (const [key, cfg] of Object.entries(AGENT_CONFIGS)) {
        const cmdDir = path.join(targetRoot, cfg.dir);
        if (COMMAND_FILES.some(f => fs.existsSync(path.join(cmdDir, f)))) {
          detected.push(key);
        }
      }
    }
    if (detected.length === 0) {
      console.log(`  No agent command directories detected. Skipping command update.`);
      return null;
    }
    for (const agent of detected) {
      copyCommandFiles(agent);
      await offerAgentPointer(agent);
    }
    return detected[0]; // return primary for prompt logic
  }

  let agentChoice = null;

  // Auto-detect
  if (detected.length > 0) {
    const names = detected.map(k => AGENT_CONFIGS[k].name).join(' and ');
    console.log(`  Detected: ${color.cyan(names)}\n`);
    const choice = await ask(`  Install WQ command files for ${names}? [Y/n]: `);
    if (choice.toLowerCase() !== 'n') {
      for (const agent of detected) {
        copyCommandFiles(agent);
        await offerAgentPointer(agent);
      }
      agentChoice = detected[0];
    }
  }

  // Manual selection (if nothing auto-detected or user declined)
  if (!agentChoice) {
    console.log(`  Which coding agent do you use?\n`);
    console.log(`    [1] Claude Code    ${color.dim('→ .claude/commands/')}`);
    console.log(`    [2] GitHub Copilot ${color.dim('→ .github/prompts/')}`);
    console.log(`    [3] OpenAI Codex   ${color.dim('→ .agents/skills/')}`);
    console.log(`    [4] Other / Skip`);

    const choice = await ask(`\n  Choice [1/2/3/4]: `);

    if (choice === '1') {
      copyCommandFiles('claude');
      agentChoice = 'claude';
    } else if (choice === '2') {
      copyCommandFiles('copilot');
      agentChoice = 'copilot';
    } else if (choice === '3') {
      copyCommandFiles('codex');
      agentChoice = 'codex';
    } else {
      console.log(`\n  Skipping agent command install.`);
    }

    if (agentChoice) {
      await offerAgentPointer(agentChoice);
    }
  }

  return agentChoice;
}

function printIntegrationPrompt(agentChoice) {
  console.log(`  ${color.green('✓')} WQ_CONTEXT.md installed at documents/wq-system/WQ_CONTEXT.md`);

  if (agentChoice) {
    const cfg = AGENT_CONFIGS[agentChoice];
    console.log(`  ${color.green('✓')} Command files (wq.md, wl.md) installed at ${cfg.dir}/`);
  }

  console.log('');
  console.log(color.bold(`========================================`));
  console.log(color.bold(`  PASTE THIS TO YOUR CODING AGENT:`));
  console.log(color.bold(`========================================`));
  console.log('');
  console.log(`  The Agentic Work Queue has been installed in this project.`);
  console.log(`  Read documents/wq-system/WQ_CONTEXT.md for full context (CLI commands,`);
  console.log(`  status-folder mappings, conventions).`);

  // Agent-specific persistent file instructions (inside paste block)
  if (agentChoice === 'claude') {
    console.log(`  Append the WQ_CONTEXT.md content to your CLAUDE.md file.`);
  } else if (agentChoice === 'copilot') {
    // Pointer was already appended to copilot-instructions.md (or user was offered).
    // Copilot reads that file automatically, so no manual step needed.
    // The paste prompt just tells the agent the system is installed.
  } else if (agentChoice === 'codex') {
    console.log(`  Append the WQ_CONTEXT.md content to your AGENTS.md file.`);
  } else {
    console.log(`  Insert that context into the appropriate persistent file for`);
    console.log(`  your environment (CLAUDE.md, .github/copilot-instructions.md,`);
    console.log(`  .cursorrules, etc.)`);
  }

  if (!agentChoice) {
    console.log(`  Command files (wq.md, wl.md) are in documents/wq-system/ — copy them`);
    console.log(`  to your agent's command directory if it supports custom commands.`);
  }

  console.log('');
  console.log(color.bold(`========================================`));
  console.log('');
  console.log(color.brightYellow(`  ↑↑↑  Scroll up and paste the above into your coding agent  ↑↑↑`));
  console.log('');
}

// ============================================================
// Project Scaffolding
// ============================================================

async function scaffoldProject() {
  console.log(`\nAgentic Work Queue — ${updateMode ? 'Update' : 'Project Setup'}`);
  console.log(`Target: ${targetRoot}\n`);

  if (!fs.existsSync(targetRoot)) {
    console.error(`Error: Target directory does not exist: ${targetRoot}`);
    process.exit(1);
  }

  const dirs = [
    'documents/handoffs/1-pending',
    'documents/handoffs/2-in_progress',
    'documents/handoffs/3-completed',
    'documents/wq-system',
  ];

  // System files: overwritten on --update, skipped if exists on fresh install
  // Agent command files (wq.md, wl.md) are handled separately by setupAgentCommands()
  const files = [
    ['documents/wq-system/wq-cli.js', 'documents/wq-system/wq-cli.js'],
    ['documents/wq-system/WQ_CONTEXT.md', 'documents/wq-system/WQ_CONTEXT.md'],
    ['documents/wq-system/README.md', 'documents/wq-system/README.md'],
    ['documents/wq-system/triage-criteria.md', 'documents/wq-system/triage-criteria.md'],
  ];

  const starterWQ = {
    version: '1.0.0',
    lastModified: new Date().toISOString(),
    settings: {
      statuses: [
        { id: 'intake', label: 'Intake', system: true, folder: '1-pending', color: '#e5c07b' },
        { id: 'ready', label: 'Ready', folder: '1-pending', color: '#9ca3af' },
        { id: 'active', label: 'Active', system: true, folder: '2-in_progress', color: '#61afef' },
        { id: 'blocked', label: 'Blocked', folder: '2-in_progress', color: '#e06c75' },
        { id: 'done', label: 'Done', system: true, folder: '3-completed', color: '#98c379' },
        { id: 'archive', label: 'Archive', system: true, folder: '3-completed', color: '#5c6370' },
      ],
      phases: [
        { id: 'planning', label: 'Planning', color: '#e5c07b' },
        { id: 'development', label: 'Development', color: '#61afef' },
        { id: 'testing', label: 'Testing', color: '#9ca3af' },
        { id: 'production', label: 'Production', color: '#98c379' },
      ],
      tracks: [
        { id: 'frontend', label: 'Frontend', color: '#3b82f6' },
        { id: 'backend', label: 'Backend', color: '#22c55e' },
        { id: 'infra', label: 'Infra', color: '#f97316' },
        { id: 'docs', label: 'Docs', color: '#a855f7' },
      ],
      transitions: {
        intake: ['ready', 'active'],
        ready: ['active'],
        active: ['blocked', 'done'],
        blocked: ['active'],
        done: ['archive'],
      },
    },
    items: [],
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const dir of dirs) {
    const fullPath = path.join(targetRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`  Created: ${dir}/`);
      created++;
    } else {
      console.log(`  Exists:  ${dir}/`);
      skipped++;
    }
  }

  for (const [src, dest] of files) {
    const srcPath = path.join(sourceRoot, src);
    const destPath = path.join(targetRoot, dest);

    if (!fs.existsSync(srcPath)) {
      console.log(`  Missing: ${src} (not found in repo — skipping)`);
      continue;
    }

    if (fs.existsSync(destPath)) {
      if (updateMode) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  Updated: ${dest}`);
        updated++;
      } else {
        console.log(`  Exists:  ${dest}`);
        skipped++;
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Copied:  ${dest}`);
      created++;
    }
  }

  // User data: never overwritten, even in update mode
  const wqPath = path.join(targetRoot, 'documents/handoffs/work_queue.json');
  if (!fs.existsSync(wqPath)) {
    // Check if sample data is available
    const samplePath = path.join(sourceRoot, 'work_queue.sample.json');
    if (fs.existsSync(samplePath)) {
      console.log('');
      console.log(`  ${color.cyan('Would you like to start with sample data?')}`);
      console.log(`  Sample includes 12 example work items across different tracks and statuses.`);
      const useSample = await ask(`  Install sample work queue? [y/N]: `);
      if (useSample.toLowerCase() === 'y') {
        const sample = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
        sample.repoPath = targetRoot;
        sample.lastModified = new Date().toISOString();
        fs.writeFileSync(wqPath, JSON.stringify(sample, null, 2) + '\n');
        console.log(`  ${color.green('✓')} Created: documents/handoffs/work_queue.json (sample data)`);
        created++;
      } else {
        fs.writeFileSync(wqPath, JSON.stringify(starterWQ, null, 2) + '\n');
        console.log(`  Created: documents/handoffs/work_queue.json (empty)`);
        created++;
      }
    } else {
      fs.writeFileSync(wqPath, JSON.stringify(starterWQ, null, 2) + '\n');
      console.log(`  Created: documents/handoffs/work_queue.json`);
      created++;
    }
  } else {
    console.log(`  ${updateMode ? 'Kept:   ' : 'Exists: '} documents/handoffs/work_queue.json ${updateMode ? color.dim('(user data, not overwritten)') : ''}`);
    skipped++;
  }

  for (const sub of ['1-pending', '2-in_progress', '3-completed']) {
    const keepPath = path.join(targetRoot, 'documents/handoffs', sub, '.gitkeep');
    if (!fs.existsSync(keepPath)) {
      const dirContents = fs.readdirSync(path.join(targetRoot, 'documents/handoffs', sub));
      if (dirContents.length === 0) {
        fs.writeFileSync(keepPath, '');
      }
    }
  }

  const summary = updateMode
    ? `${updated} updated, ${created} created, ${skipped} unchanged`
    : `${created} created, ${skipped} already existed`;
  console.log(`\n  ${color.green('✓')} ${updateMode ? 'Update' : 'Scaffolding'} complete: ${summary}.`);
}

// ============================================================
// Extension Installation
// ============================================================

async function installExtension() {
  console.log(`\n--- VS Code Extension Install ---\n`);

  const existingVsix = findVsix();

  if (existingVsix) {
    console.log(`  Pre-built VSIX found: ${existingVsix}`);
    const choice = await ask(`\n  Install options:\n    [1] Use pre-built VSIX (fastest)\n    [2] Compile from source (latest)\n    [3] Skip extension install\n\n  Choice [1/2/3]: `);

    if (choice === '3') {
      console.log('\n  Skipping extension install.');
      return;
    }

    if (choice === '2') {
      return compileAndInstall();
    }

    // Default: install pre-built
    const vsixPath = path.join(sourceRoot, existingVsix);
    console.log(`\n  Installing ${existingVsix}...`);
    if (runCmd(`code --install-extension "${vsixPath}"`, `code --install-extension ${existingVsix}`)) {
      console.log(`\n  ${color.green('✓')} Extension installed.`);
    } else {
      console.error(`\n  Install failed. Try manually: code --install-extension "${vsixPath}"`);
    }
  } else {
    console.log(`  No pre-built VSIX found.`);
    const choice = await ask(`\n  Install options:\n    [1] Compile from source\n    [2] Skip extension install\n\n  Choice [1/2]: `);

    if (choice === '2') {
      console.log('\n  Skipping extension install.');
      return;
    }

    return compileAndInstall();
  }
}

async function compileAndInstall() {
  console.log(`\n  Compiling from source...`);

  // Check if node_modules exists
  if (!fs.existsSync(path.join(sourceRoot, 'node_modules'))) {
    console.log('');
    if (!runCmd('npm install', 'npm install')) {
      console.error('\n  npm install failed. Install dependencies manually and retry.');
      process.exit(1);
    }
  }

  console.log('');
  if (!runCmd('npm run compile', 'npm run compile')) {
    console.error('\n  Build failed. Check errors above.');
    process.exit(1);
  }

  console.log('');
  if (!runCmd('npx vsce package', 'npx vsce package')) {
    console.error('\n  Packaging failed. Check errors above.');
    process.exit(1);
  }

  const vsix = findVsix();
  if (!vsix) {
    console.error('\n  No VSIX produced. Check build output.');
    process.exit(1);
  }

  const vsixPath = path.join(sourceRoot, vsix);
  console.log(`\n  Installing ${vsix}...`);
  if (runCmd(`code --install-extension "${vsixPath}"`, `code --install-extension ${vsix}`)) {
    console.log(`\n  ${color.green('✓')} Extension installed.`);
  } else {
    console.error(`\n  Install failed. Try manually: code --install-extension "${vsixPath}"`);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\n${color.bold('========================================')}`);
  console.log(color.bold(`  Agentic Work Queue — Setup`));
  console.log(`${color.bold('========================================')}`);

  if (!installOnly) {
    await scaffoldProject();
  }

  let agentChoice = null;
  if (!installOnly && !noAgents) {
    agentChoice = await setupAgentCommands();
  }

  if (!noInstall) {
    await installExtension();
  }

  console.log(color.bold(`--- Next Steps ---\n`));
  if (!installOnly) {
    console.log(`  ${color.brightGreen('1.')} Create your first work item:`);
    console.log(`     ${color.cyan('node documents/wq-system/wq-cli.js create "My Feature" --track=frontend --phase=development')}\n`);
  }
  console.log(`  ${color.brightGreen(!installOnly ? '2.' : '1.')} ${color.bold('Reload VS Code')} (Ctrl+Shift+P → "Developer: Reload Window")`);
  console.log(`     Then look for "Work Queue" in the sidebar.\n`);
  console.log(`  ${color.brightGreen(!installOnly ? '3.' : '2.')} ${color.bold('Set a keyboard shortcut for the panel')} ${color.dim('(optional)')}`);
  console.log(`     Open Keyboard Shortcuts (Ctrl+K Ctrl+S), search for ${color.cyan('"WQ: Open Board"')},`);
  console.log(`     and assign your preferred key.\n`);
  console.log(`  ${color.dim('CLI help:')} node documents/wq-system/wq-cli.js --help\n`);

  if (!updateMode) {
    console.log(color.dim(`  To update later: git pull this repo, then run:`));
    console.log(color.dim(`  node ${path.relative(targetRoot, path.join(sourceRoot, 'setup.js'))} --update ${targetRoot === process.cwd() ? '' : targetRoot}`));
    console.log('');
  }

  if (!installOnly && !noAgents) {
    printIntegrationPrompt(agentChoice);
  }
}

main().catch(err => {
  console.error(`\nSetup error: ${err.message}`);
  process.exit(1);
});
