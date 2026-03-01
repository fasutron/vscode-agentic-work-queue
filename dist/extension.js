"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode7 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));

// src/services/WQDataService.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// src/models/defaultSettings.ts
var DEFAULT_SETTINGS = {
  statuses: [
    { id: "intake", label: "Intake", system: true, folder: "1-pending", color: "#e5c07b" },
    { id: "ready", label: "Ready", folder: "1-pending", color: "#9ca3af" },
    { id: "active", label: "Active", system: true, folder: "2-in_progress", color: "#61afef" },
    { id: "blocked", label: "Blocked", folder: "2-in_progress", color: "#e06c75" },
    { id: "done", label: "Done", system: true, folder: "3-completed", color: "#98c379" },
    { id: "archive", label: "Archive", system: true, folder: "3-completed", color: "#5c6370" }
  ],
  phases: [
    { id: "pre-beta", label: "Pre-Beta", color: "#e5c07b" },
    { id: "beta", label: "Beta", color: "#61afef" },
    { id: "post-beta", label: "Post-Beta", color: "#9ca3af" },
    { id: "production", label: "Production", color: "#98c379" }
  ],
  tracks: [
    { id: "player", label: "Player", color: "#3b82f6" },
    { id: "coach", label: "Coach", color: "#22c55e" },
    { id: "quiz", label: "Quiz", color: "#a855f7" },
    { id: "infra", label: "Infra", color: "#f97316" },
    { id: "platform", label: "Platform", color: "#6b7280" },
    { id: "production", label: "Production", color: "#ef4444" }
  ],
  transitions: {
    intake: ["ready", "active"],
    ready: ["active"],
    active: ["blocked", "done"],
    blocked: ["active"],
    done: ["archive"]
  }
};

// src/utils/constants.ts
var vscode = __toESM(require("vscode"));
var SYSTEM_STATUS_ICONS = {
  intake: () => new vscode.ThemeIcon("circle-outline", new vscode.ThemeColor("disabledForeground")),
  ready: () => new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.blue")),
  active: () => new vscode.ThemeIcon("play", new vscode.ThemeColor("charts.green")),
  blocked: () => new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground")),
  done: () => new vscode.ThemeIcon("check", new vscode.ThemeColor("charts.green")),
  archive: () => new vscode.ThemeIcon("archive", new vscode.ThemeColor("disabledForeground"))
};
function getStatusIcon(statusId) {
  const factory = SYSTEM_STATUS_ICONS[statusId];
  return factory ? factory() : new vscode.ThemeIcon("circle-outline");
}
function getOrderedIds(settings) {
  return {
    statuses: settings.statuses.map((s) => s.id),
    phases: settings.phases.map((p) => p.id),
    tracks: settings.tracks.map((t) => t.id)
  };
}
function getLabels(settings) {
  return {
    statuses: Object.fromEntries(settings.statuses.map((s) => [s.id, s.label])),
    phases: Object.fromEntries(settings.phases.map((p) => [p.id, p.label])),
    tracks: Object.fromEntries(settings.tracks.map((t) => [t.id, t.label]))
  };
}
var WORKLIST_ID_FILENAME_REGEX = /WQ[_-]?(\d+)/i;
var WORKLIST_HEADER_REGEX = /^\*\*WQ\s+Items?:\*\*\s*(.+)$/m;
var WQ_ID_EXTRACT_REGEX = /WQ-(\d+)/g;

// src/models/WorklistParser.ts
function parseWorklistProgress(content) {
  const lines = content.split("\n");
  let completed = 0;
  let pending = 0;
  let lastCompletedTask;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^-\s*\[x\]/i.test(trimmed)) {
      completed++;
      lastCompletedTask = trimmed.replace(/^-\s*\[x\]\s*/i, "");
    } else if (/^-\s*\[\s\]/.test(trimmed)) {
      pending++;
    }
  }
  return {
    completed,
    pending,
    total: completed + pending,
    lastCompletedTask: lastCompletedTask || void 0
  };
}
function extractWqIdsFromWorklist(content, filename) {
  const ids = /* @__PURE__ */ new Set();
  const filenameMatch = filename.match(WORKLIST_ID_FILENAME_REGEX);
  if (filenameMatch) {
    ids.add(`WQ-${filenameMatch[1]}`);
  }
  const headerMatch = content.match(WORKLIST_HEADER_REGEX);
  if (headerMatch) {
    const headerValue = headerMatch[1];
    const idRegex = new RegExp(WQ_ID_EXTRACT_REGEX.source, "g");
    let idMatch;
    while ((idMatch = idRegex.exec(headerValue)) !== null) {
      ids.add(`WQ-${idMatch[1]}`);
    }
  }
  return Array.from(ids);
}
function parseWorklistFull(content, filename) {
  const lines = content.split("\n");
  const wqIds = extractWqIdsFromWorklist(content, filename);
  let title = "";
  let rawPreamble = "";
  const sections = [];
  let phase = "before-h1";
  let currentSection = null;
  const preambleLines = [];
  let taskCounter = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (phase === "before-h1" && /^#\s+/.test(trimmed)) {
      title = trimmed.replace(/^#\s+/, "");
      phase = "preamble";
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const heading = trimmed.replace(/^##\s+/, "");
      currentSection = { heading, items: [] };
      phase = "section";
      continue;
    }
    if (phase === "preamble") {
      preambleLines.push(line);
      continue;
    }
    if (phase === "section" && currentSection) {
      if (/^-\s*\[x\]/i.test(trimmed)) {
        const text = trimmed.replace(/^-\s*\[x\]\s*/i, "");
        const task = {
          id: `task-${taskCounter++}`,
          text,
          checked: true,
          section: currentSection.heading
        };
        currentSection.items.push(task);
      } else if (/^-\s*\[\s\]/.test(trimmed)) {
        const text = trimmed.replace(/^-\s*\[\s\]\s*/, "");
        const task = {
          id: `task-${taskCounter++}`,
          text,
          checked: false,
          section: currentSection.heading
        };
        currentSection.items.push(task);
      } else {
        const raw = { type: "raw", text: line };
        currentSection.items.push(raw);
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }
  while (preambleLines.length > 0 && preambleLines[preambleLines.length - 1].trim() === "") {
    preambleLines.pop();
  }
  rawPreamble = preambleLines.join("\n");
  return { title, wqIds, rawPreamble, sections };
}
function serializeWorklist(parsed) {
  const lines = [];
  lines.push(`# ${parsed.title}`);
  lines.push("");
  if (parsed.rawPreamble) {
    lines.push(parsed.rawPreamble);
    lines.push("");
  }
  for (const section of parsed.sections) {
    lines.push(`## ${section.heading}`);
    for (const item of section.items) {
      if ("type" in item && item.type === "raw") {
        lines.push(item.text);
      } else {
        const task = item;
        const checkbox = task.checked ? "- [x]" : "- [ ]";
        lines.push(`${checkbox} ${task.text}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/models/TestPlanParser.ts
var PASS_REGEX = /^-\s*\[x\]/i;
var FAIL_REGEX = /^-\s*\[!\]/;
var PENDING_REGEX = /^-\s*\[\s\]/;
function parseTestPlanProgress(content) {
  const lines = content.split("\n");
  let pass = 0;
  let fail = 0;
  let pending = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (PASS_REGEX.test(trimmed)) {
      pass++;
    } else if (FAIL_REGEX.test(trimmed)) {
      fail++;
    } else if (PENDING_REGEX.test(trimmed)) {
      pending++;
    }
  }
  return { pass, fail, pending, total: pass + fail + pending };
}
function extractWqIdsFromTestPlan(content, filename) {
  const ids = /* @__PURE__ */ new Set();
  const filenameMatch = filename.match(WORKLIST_ID_FILENAME_REGEX);
  if (filenameMatch) {
    ids.add(`WQ-${filenameMatch[1]}`);
  }
  const headerMatch = content.match(WORKLIST_HEADER_REGEX);
  if (headerMatch) {
    const headerValue = headerMatch[1];
    const idRegex = new RegExp(WQ_ID_EXTRACT_REGEX.source, "g");
    let idMatch;
    while ((idMatch = idRegex.exec(headerValue)) !== null) {
      ids.add(`WQ-${idMatch[1]}`);
    }
  }
  return Array.from(ids);
}
function parseChecklistLine(trimmed) {
  if (PASS_REGEX.test(trimmed)) {
    return { status: "pass", text: trimmed.replace(/^-\s*\[x\]\s*/i, "") };
  }
  if (FAIL_REGEX.test(trimmed)) {
    return { status: "fail", text: trimmed.replace(/^-\s*\[!\]\s*/, "") };
  }
  if (PENDING_REGEX.test(trimmed)) {
    return { status: "pending", text: trimmed.replace(/^-\s*\[\s\]\s*/, "") };
  }
  return null;
}
function parseTestPlanFull(content, filename) {
  const lines = content.split("\n");
  const wqIds = extractWqIdsFromTestPlan(content, filename);
  let title = "";
  let rawPreamble = "";
  const sections = [];
  let phase = "before-h1";
  let currentSection = null;
  const preambleLines = [];
  let testCounter = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (phase === "before-h1" && /^#\s+/.test(trimmed)) {
      title = trimmed.replace(/^#\s+/, "");
      phase = "preamble";
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const heading = trimmed.replace(/^##\s+/, "");
      currentSection = { heading, items: [] };
      phase = "section";
      continue;
    }
    if (phase === "preamble") {
      preambleLines.push(line);
      continue;
    }
    if (phase === "section" && currentSection) {
      const parsed = parseChecklistLine(trimmed);
      if (parsed) {
        const test = {
          id: `test-${testCounter++}`,
          text: parsed.text,
          status: parsed.status,
          section: currentSection.heading
        };
        currentSection.items.push(test);
      } else {
        const raw = { type: "raw", text: line };
        currentSection.items.push(raw);
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }
  while (preambleLines.length > 0 && preambleLines[preambleLines.length - 1].trim() === "") {
    preambleLines.pop();
  }
  rawPreamble = preambleLines.join("\n");
  return { title, wqIds, rawPreamble, sections };
}
function serializeTestPlan(parsed) {
  const lines = [];
  lines.push(`# ${parsed.title}`);
  lines.push("");
  if (parsed.rawPreamble) {
    lines.push(parsed.rawPreamble);
    lines.push("");
  }
  for (const section of parsed.sections) {
    lines.push(`## ${section.heading}`);
    for (const item of section.items) {
      if ("type" in item && item.type === "raw") {
        lines.push(item.text);
      } else {
        const test = item;
        const marker = test.status === "pass" ? "- [x]" : test.status === "fail" ? "- [!]" : "- [ ]";
        lines.push(`${marker} ${test.text}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// src/services/WQDataService.ts
var WQDataService = class {
  handoffsDir;
  items = [];
  settings = DEFAULT_SETTINGS;
  /** Maps WQ ID → worklist mappings (an item can have multiple worklists) */
  worklistByWqId = /* @__PURE__ */ new Map();
  /** Maps absolute file path → worklist mapping */
  worklistByPath = /* @__PURE__ */ new Map();
  /** Maps WQ ID → test plan mappings */
  testPlanByWqId = /* @__PURE__ */ new Map();
  /** Maps absolute file path → test plan mapping */
  testPlanByPath = /* @__PURE__ */ new Map();
  constructor(handoffsDir) {
    this.handoffsDir = handoffsDir;
    this.reload();
  }
  /**
   * Reload all data from disk. Called on init and on file watcher events.
   */
  reload() {
    this.loadItems();
    this.loadWorklists();
    this.loadTestPlans();
  }
  getItems() {
    return this.items;
  }
  getSettings() {
    return this.settings;
  }
  /**
   * Write updated settings back to work_queue.json.
   * The file watcher will trigger a reload automatically.
   */
  saveSettings(settings) {
    const wqPath = path.join(this.handoffsDir, "work_queue.json");
    try {
      const raw = fs.readFileSync(wqPath, "utf-8");
      const wqFile = JSON.parse(raw);
      wqFile.settings = settings;
      wqFile.lastModified = (/* @__PURE__ */ new Date()).toISOString();
      fs.writeFileSync(wqPath, JSON.stringify(wqFile, null, 2));
      this.settings = settings;
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }
  getItemById(id) {
    return this.items.find((item) => item.id.toLowerCase() === id.toLowerCase());
  }
  /**
   * Get filtered items based on criteria.
   */
  getFilteredItems(filter) {
    return this.items.filter((item) => {
      if (!filter.showDone && item.status === "done") {
        return false;
      }
      if (!filter.showArchived && item.status === "archive") {
        return false;
      }
      if (filter.status && !filter.status.includes(item.status)) {
        return false;
      }
      if (filter.phase && !filter.phase.includes(item.phase)) {
        return false;
      }
      if (filter.track && !filter.track.includes(item.track)) {
        return false;
      }
      if (filter.searchText) {
        const query = filter.searchText.toLowerCase();
        const titleMatch = item.title.toLowerCase().includes(query);
        const tagMatch = item.tags.some((t) => t.toLowerCase().includes(query));
        const idMatch = item.id.toLowerCase().includes(query);
        if (!titleMatch && !tagMatch && !idMatch) {
          return false;
        }
      }
      return true;
    });
  }
  /**
   * Get the primary WORKLIST mapping for a WQ item (first match).
   */
  getWorklistForItem(id) {
    const mappings = this.worklistByWqId.get(id.toUpperCase());
    return mappings?.[0];
  }
  /**
   * Resolve a WQ document's relative path to an absolute path.
   * Falls back to scanning all status folders if the stored path is stale.
   */
  resolveDocumentPath(doc) {
    const directPath = path.join(this.handoffsDir, doc.path);
    if (fs.existsSync(directPath)) {
      return directPath;
    }
    const basename2 = path.basename(doc.path);
    const folders = [...new Set(this.settings.statuses.map((s) => s.folder))];
    for (const folder of folders) {
      const candidate = path.join(this.handoffsDir, folder, basename2);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return void 0;
  }
  /**
   * Get the absolute path to the WORKLIST file for a WQ item.
   */
  resolveWorklistPath(itemId) {
    return this.getWorklistForItem(itemId)?.filePath;
  }
  /**
   * Get the full parsed worklist for a WQ item (individual tasks, not just counts).
   */
  getWorklistDetail(itemId) {
    const mapping = this.getWorklistForItem(itemId);
    if (!mapping) {
      return void 0;
    }
    try {
      const content = fs.readFileSync(mapping.filePath, "utf-8");
      const filename = path.basename(mapping.filePath);
      return parseWorklistFull(content, filename);
    } catch {
      return void 0;
    }
  }
  /**
   * Save an updated ParsedWorklist back to disk.
   */
  saveWorklistDetail(itemId, parsed) {
    const mapping = this.getWorklistForItem(itemId);
    if (!mapping) {
      return false;
    }
    try {
      const markdown = serializeWorklist(parsed);
      fs.writeFileSync(mapping.filePath, markdown, "utf-8");
      return true;
    } catch (e) {
      console.error("Failed to save worklist:", e);
      return false;
    }
  }
  /**
   * Get WQ item IDs that have associated worklist files.
   */
  getWorklistItemIds() {
    return Array.from(this.worklistByWqId.keys());
  }
  // --- Test plan public methods ---
  /**
   * Get the primary test plan mapping for a WQ item (first match).
   */
  getTestPlanForItem(id) {
    const mappings = this.testPlanByWqId.get(id.toUpperCase());
    return mappings?.[0];
  }
  /**
   * Get the absolute path to the test plan file for a WQ item.
   */
  resolveTestPlanPath(itemId) {
    return this.getTestPlanForItem(itemId)?.filePath;
  }
  /**
   * Get the full parsed test plan for a WQ item.
   */
  getTestPlanDetail(itemId) {
    const mapping = this.getTestPlanForItem(itemId);
    if (!mapping) {
      return void 0;
    }
    try {
      const content = fs.readFileSync(mapping.filePath, "utf-8");
      const filename = path.basename(mapping.filePath);
      return parseTestPlanFull(content, filename);
    } catch {
      return void 0;
    }
  }
  /**
   * Save an updated ParsedTestPlan back to disk.
   */
  saveTestPlanDetail(itemId, parsed) {
    const mapping = this.getTestPlanForItem(itemId);
    if (!mapping) {
      return false;
    }
    try {
      const markdown = serializeTestPlan(parsed);
      fs.writeFileSync(mapping.filePath, markdown, "utf-8");
      return true;
    } catch (e) {
      console.error("Failed to save test plan:", e);
      return false;
    }
  }
  /**
   * Get WQ item IDs that have associated test plan files.
   */
  getTestPlanItemIds() {
    return Array.from(this.testPlanByWqId.keys());
  }
  // --- Private methods ---
  loadItems() {
    const wqPath = path.join(this.handoffsDir, "work_queue.json");
    try {
      const raw = fs.readFileSync(wqPath, "utf-8");
      const wqFile = JSON.parse(raw);
      this.items = wqFile.items || [];
      this.settings = wqFile.settings || DEFAULT_SETTINGS;
    } catch {
      this.items = [];
      this.settings = DEFAULT_SETTINGS;
    }
  }
  loadWorklists() {
    this.worklistByWqId.clear();
    this.worklistByPath.clear();
    const worklistFiles = this.discoverWorklistFiles();
    for (const filePath of worklistFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const filename = path.basename(filePath);
        const progress = parseWorklistProgress(content);
        const wqIds = extractWqIdsFromWorklist(content, filename);
        const mapping = {
          filePath,
          wqIds,
          progress
        };
        this.worklistByPath.set(filePath, mapping);
        for (const id of wqIds) {
          const key = id.toUpperCase();
          const existing = this.worklistByWqId.get(key) || [];
          existing.push(mapping);
          this.worklistByWqId.set(key, existing);
        }
      } catch {
      }
    }
  }
  /**
   * Recursively discover all *WORKLIST*.md files under the handoffs directory.
   */
  discoverWorklistFiles() {
    const results = [];
    const matcher = (name) => name.includes("WORKLIST") && name.endsWith(".md");
    this.walkDir(this.handoffsDir, results, matcher);
    return results;
  }
  /**
   * Recursively discover all test plan files under the handoffs directory.
   * Matches: *TEST_PLAN*, *TESTING_CHECKLIST*, *SMOKE_TEST*, *_Tests.md
   * (case-insensitive). Excludes worklist, results, and prompt files.
   */
  discoverTestPlanFiles() {
    const results = [];
    const matcher = (name) => {
      const upper = name.toUpperCase();
      if (!upper.endsWith(".MD"))
        return false;
      if (upper.includes("WORKLIST"))
        return false;
      if (upper.includes("_RESULT") || upper.includes("_PROMPT") || upper.includes("_VECTOR"))
        return false;
      return upper.includes("TEST_PLAN") || upper.includes("TESTING_CHECKLIST") || upper.includes("SMOKE_TEST") || upper.includes("_TESTS.");
    };
    this.walkDir(this.handoffsDir, results, matcher);
    return results;
  }
  loadTestPlans() {
    this.testPlanByWqId.clear();
    this.testPlanByPath.clear();
    const testPlanFiles = this.discoverTestPlanFiles();
    for (const filePath of testPlanFiles) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const filename = path.basename(filePath);
        const progress = parseTestPlanProgress(content);
        const wqIds = extractWqIdsFromTestPlan(content, filename);
        const mapping = {
          filePath,
          wqIds,
          progress
        };
        this.testPlanByPath.set(filePath, mapping);
        for (const id of wqIds) {
          const key = id.toUpperCase();
          const existing = this.testPlanByWqId.get(key) || [];
          existing.push(mapping);
          this.testPlanByWqId.set(key, existing);
        }
      } catch {
      }
    }
  }
  walkDir(dir, results, matcher) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, results, matcher);
      } else if (entry.isFile() && matcher(entry.name)) {
        results.push(fullPath);
      }
    }
  }
};

// src/services/ClaudeCodeService.ts
var vscode2 = __toESM(require("vscode"));
var import_child_process = require("child_process");
var path2 = __toESM(require("path"));
var ClaudeCodeService = class {
  outputChannel;
  workspaceRoot;
  cliPath;
  constructor(workspaceRoot) {
    this.outputChannel = vscode2.window.createOutputChannel("Agentic WQ");
    this.workspaceRoot = workspaceRoot;
    this.cliPath = path2.join(workspaceRoot, "documents", "wq-system", "wq-cli.js");
  }
  /**
   * Change WQ item status. Always uses direct CLI.
   */
  async changeStatus(wqId, newStatus) {
    return this.runCli(wqId, newStatus);
  }
  /**
   * Delegate to Claude Code: copies prompt to clipboard and opens CC sidebar.
   */
  async delegateExplore(item) {
    const docList = item.documents.length > 0 ? `Read the linked documents: ${item.documents.map((d) => d.path).join(", ")}.` : "";
    const prompt = [
      `Explore ${item.id}: ${item.title}`,
      "",
      `Use the Explore agent to analyze the codebase for ${item.id}: ${item.title}.`,
      docList,
      "Identify implementation approach, affected files, dependencies, and risks.",
      "Provide a summary suitable for an implementation handoff."
    ].filter(Boolean).join("\n");
    await this.sendViaCCClipboard(prompt, `Explore ${item.id}`);
  }
  async delegatePlan(item) {
    const docList = item.documents.length > 0 ? `Read the linked documents: ${item.documents.map((d) => d.path).join(", ")}.` : "";
    const prompt = [
      `Plan ${item.id}: ${item.title}`,
      "",
      `Use the Plan agent to create an implementation plan for ${item.id}: ${item.title}.`,
      docList,
      "Produce a step-by-step implementation plan with file paths and estimated effort."
    ].filter(Boolean).join("\n");
    await this.sendViaCCClipboard(prompt, `Plan ${item.id}`);
  }
  /**
   * Edit a WQ item field via CLI (track, phase, priority, effort, etc.)
   */
  async editField(wqId, field, value) {
    return new Promise((resolve) => {
      const label = `${wqId} --${field}=${value}`;
      (0, import_child_process.execFile)("node", [this.cliPath, "edit", wqId, `--${field}=${value}`], {
        cwd: this.workspaceRoot,
        timeout: 15e3
      }, (error, stdout, stderr) => {
        if (error) {
          const msg = stderr || error.message;
          vscode2.window.showErrorMessage(`WQ edit failed: ${msg}`);
          this.outputChannel.appendLine(`[CLI ERROR] ${label}: ${msg}`);
          resolve(false);
        } else {
          this.outputChannel.appendLine(`[CLI] ${label}: ${stdout.trim()}`);
          resolve(true);
        }
      });
    });
  }
  async delegateTriage(phase) {
    const filter = phase || "pre-beta";
    const prompt = `/project:wq triage ${filter}`;
    await this.sendViaCCClipboard(prompt, `Triage ${filter}`);
  }
  // --- Private: Direct CLI execution ---
  async runCli(wqId, newStatus) {
    return new Promise((resolve) => {
      const label = `${wqId} \u2192 ${newStatus}`;
      vscode2.window.withProgress(
        { location: vscode2.ProgressLocation.Notification, title: `WQ: ${label}` },
        () => new Promise((done) => {
          (0, import_child_process.execFile)("node", [this.cliPath, "status", wqId, newStatus], {
            cwd: this.workspaceRoot,
            timeout: 15e3
          }, (error, stdout, stderr) => {
            if (error) {
              const msg = stderr || error.message;
              vscode2.window.showErrorMessage(`WQ status change failed: ${msg}`);
              this.outputChannel.appendLine(`[CLI ERROR] ${label}: ${msg}`);
              resolve(false);
            } else {
              this.outputChannel.appendLine(`[CLI] ${label}: ${stdout.trim()}`);
              resolve(true);
            }
            done();
          });
        })
      );
    });
  }
  // --- Private: Clipboard + CC sidebar ---
  async sendViaCCClipboard(prompt, label) {
    this.outputChannel.appendLine(`
--- ${label} ---`);
    this.outputChannel.appendLine(`> ${prompt}`);
    await vscode2.env.clipboard.writeText(prompt);
    const openSidebar = vscode2.workspace.getConfiguration("purr-wq").get("openCCSidebar", false);
    if (openSidebar) {
      try {
        await vscode2.commands.executeCommand("claude-vscode.sidebar.open");
      } catch {
      }
    }
  }
  dispose() {
    this.outputChannel.dispose();
  }
};

// src/providers/WQTreeProvider.ts
var vscode3 = __toESM(require("vscode"));
var WQTreeItem = class extends vscode3.TreeItem {
  /** Set for item nodes; undefined for group nodes */
  wqItem;
  /** Group key used to retrieve children */
  groupKey;
  constructor(label, collapsibleState) {
    super(label, collapsibleState);
  }
};
var WQTreeProvider = class {
  _onDidChangeTreeData = new vscode3.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  grouping = "phase";
  filterText = "";
  dataService;
  constructor(dataService, defaultGrouping = "phase") {
    this.dataService = dataService;
    this.grouping = defaultGrouping;
  }
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  setGrouping(mode) {
    this.grouping = mode;
    this.refresh();
  }
  getGrouping() {
    return this.grouping;
  }
  setFilter(text) {
    this.filterText = text;
    this.refresh();
  }
  getFilter() {
    return this.filterText;
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (!element) {
      return this.getRootGroups();
    }
    if (element.groupKey) {
      return this.getGroupChildren(element.groupKey);
    }
    return [];
  }
  // --- Private ---
  getVisibleItems() {
    const config = vscode3.workspace.getConfiguration("purr-wq");
    return this.dataService.getFilteredItems({
      showDone: config.get("showDone", false),
      showArchived: config.get("showArchived", false),
      searchText: this.filterText || void 0
    });
  }
  getRootGroups() {
    const items = this.getVisibleItems();
    switch (this.grouping) {
      case "phase":
        return this.groupByPhase(items);
      case "status":
        return this.groupByStatus(items);
      case "track":
        return this.groupByTrack(items);
      case "grade":
        return this.groupByGrade(items);
      default:
        return this.groupByPhase(items);
    }
  }
  groupByPhase(items) {
    const settings = this.dataService.getSettings();
    const { phases } = getOrderedIds(settings);
    const labels = getLabels(settings).phases;
    return phases.map((phase) => {
      const count = items.filter((i) => i.phase === phase).length;
      if (count === 0) {
        return null;
      }
      const node = new WQTreeItem(
        `${labels[phase] || phase} (${count})`,
        vscode3.TreeItemCollapsibleState.Collapsed
      );
      node.groupKey = `phase:${phase}`;
      node.iconPath = new vscode3.ThemeIcon("folder");
      return node;
    }).filter((n) => n !== null);
  }
  groupByStatus(items) {
    const settings = this.dataService.getSettings();
    const { statuses } = getOrderedIds(settings);
    const labels = getLabels(settings).statuses;
    return statuses.map((status) => {
      const count = items.filter((i) => i.status === status).length;
      if (count === 0) {
        return null;
      }
      const node = new WQTreeItem(
        `${labels[status] || status} (${count})`,
        vscode3.TreeItemCollapsibleState.Collapsed
      );
      node.groupKey = `status:${status}`;
      node.iconPath = getStatusIcon(status);
      return node;
    }).filter((n) => n !== null);
  }
  groupByTrack(items) {
    const settings = this.dataService.getSettings();
    const { tracks } = getOrderedIds(settings);
    const labels = getLabels(settings).tracks;
    return tracks.map((track) => {
      const count = items.filter((i) => i.track === track).length;
      if (count === 0) {
        return null;
      }
      const node = new WQTreeItem(
        `${labels[track] || track} (${count})`,
        vscode3.TreeItemCollapsibleState.Collapsed
      );
      node.groupKey = `track:${track}`;
      node.iconPath = new vscode3.ThemeIcon("folder");
      return node;
    }).filter((n) => n !== null);
  }
  groupByGrade(items) {
    const gradeA = items.filter((i) => i.tags.includes("grade-a"));
    const gradeB = items.filter((i) => i.tags.includes("grade-b"));
    const ungraded = items.filter((i) => !i.tags.includes("grade-a") && !i.tags.includes("grade-b"));
    const groups = [];
    if (gradeA.length > 0) {
      const node = new WQTreeItem(
        `Grade A: Critical (${gradeA.length})`,
        vscode3.TreeItemCollapsibleState.Collapsed
      );
      node.groupKey = "grade:a";
      node.iconPath = new vscode3.ThemeIcon("circle-filled", new vscode3.ThemeColor("errorForeground"));
      groups.push(node);
    }
    if (gradeB.length > 0) {
      const node = new WQTreeItem(
        `Grade B: High Value (${gradeB.length})`,
        vscode3.TreeItemCollapsibleState.Collapsed
      );
      node.groupKey = "grade:b";
      node.iconPath = new vscode3.ThemeIcon("circle-filled", new vscode3.ThemeColor("editorWarning.foreground"));
      groups.push(node);
    }
    if (ungraded.length > 0) {
      const node = new WQTreeItem(
        `Ungraded (${ungraded.length})`,
        vscode3.TreeItemCollapsibleState.Collapsed
      );
      node.groupKey = "grade:none";
      node.iconPath = new vscode3.ThemeIcon("folder");
      groups.push(node);
    }
    return groups;
  }
  getGroupChildren(groupKey) {
    const items = this.getVisibleItems();
    const [dimension, value] = groupKey.split(":");
    let filtered;
    switch (dimension) {
      case "phase":
        filtered = items.filter((i) => i.phase === value);
        break;
      case "status":
        filtered = items.filter((i) => i.status === value);
        break;
      case "track":
        filtered = items.filter((i) => i.track === value);
        break;
      case "grade":
        if (value === "a") {
          filtered = items.filter((i) => i.tags.includes("grade-a"));
        } else if (value === "b") {
          filtered = items.filter((i) => i.tags.includes("grade-b"));
        } else {
          filtered = items.filter((i) => !i.tags.includes("grade-a") && !i.tags.includes("grade-b"));
        }
        break;
      default:
        filtered = [];
    }
    filtered.sort((a, b) => a.priority - b.priority);
    return filtered.map((item) => this.createItemNode(item));
  }
  createItemNode(item) {
    const node = new WQTreeItem(item.id, vscode3.TreeItemCollapsibleState.None);
    node.wqItem = item;
    const titleTrunc = item.title.length > 45 ? item.title.slice(0, 42) + "..." : item.title;
    let desc = `${titleTrunc}  P${item.priority}`;
    const worklist = this.dataService.getWorklistForItem(item.id);
    if (worklist && worklist.progress.total > 0) {
      desc += `  [${worklist.progress.completed}/${worklist.progress.total}]`;
    }
    node.description = desc;
    const summary = Array.isArray(item.summary) ? item.summary.join(" ") : item.summary;
    node.tooltip = new vscode3.MarkdownString(
      `**${item.id}: ${item.title}**

${summary}

Status: ${item.status} | Track: ${item.track} | Phase: ${item.phase}

Priority: ${item.priority}` + (item.effort ? ` | Effort: ${item.effort}` : "") + (item.tags.length > 0 ? `

Tags: ${item.tags.join(", ")}` : "")
    );
    node.iconPath = getStatusIcon(item.status);
    const hasDocs = item.documents.length > 0;
    const hasWorklist = !!worklist;
    let ctx = `wqItem.${item.status}`;
    if (hasDocs) {
      ctx += ".hasDoc";
    }
    if (hasWorklist) {
      ctx += ".hasWorklist";
    }
    node.contextValue = ctx;
    return node;
  }
};

// src/providers/WQActiveTreeProvider.ts
var vscode4 = __toESM(require("vscode"));
var ActiveTreeItem = class extends vscode4.TreeItem {
  wqItem;
};
var WQActiveTreeProvider = class {
  _onDidChangeTreeData = new vscode4.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  dataService;
  constructor(dataService) {
    this.dataService = dataService;
  }
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (element) {
      return [];
    }
    const items = this.dataService.getFilteredItems({
      status: ["active", "blocked"],
      showDone: false,
      showArchived: false
    });
    items.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "active" ? -1 : 1;
      }
      return a.priority - b.priority;
    });
    return items.map((item) => this.createItemNode(item));
  }
  createItemNode(item) {
    const node = new ActiveTreeItem(item.id, vscode4.TreeItemCollapsibleState.None);
    node.wqItem = item;
    const titleTrunc = item.title.length > 40 ? item.title.slice(0, 37) + "..." : item.title;
    let desc = titleTrunc;
    const worklist = this.dataService.getWorklistForItem(item.id);
    if (worklist && worklist.progress.total > 0) {
      const pct = Math.round(worklist.progress.completed / worklist.progress.total * 100);
      desc += `  [${worklist.progress.completed}/${worklist.progress.total} ${pct}%]`;
    }
    node.description = desc;
    const summary = Array.isArray(item.summary) ? item.summary.join(" ") : item.summary;
    const tooltipParts = [
      `**${item.id}: ${item.title}**`,
      "",
      summary,
      "",
      `Status: ${item.status} | Track: ${item.track} | Priority: P${item.priority}`
    ];
    if (worklist && worklist.progress.total > 0) {
      tooltipParts.push("", `Progress: ${worklist.progress.completed}/${worklist.progress.total} tasks`);
      if (worklist.progress.lastCompletedTask) {
        tooltipParts.push(`Last completed: ${worklist.progress.lastCompletedTask}`);
      }
    }
    node.tooltip = new vscode4.MarkdownString(tooltipParts.join("\n"));
    node.iconPath = getStatusIcon(item.status);
    const hasDocs = item.documents.length > 0;
    const hasWorklist = !!worklist;
    let ctx = `wqItem.${item.status}`;
    if (hasDocs) {
      ctx += ".hasDoc";
    }
    if (hasWorklist) {
      ctx += ".hasWorklist";
    }
    node.contextValue = ctx;
    return node;
  }
};

// src/providers/WQFileWatcher.ts
var vscode5 = __toESM(require("vscode"));
var WQFileWatcher = class {
  watchers = [];
  debounceTimer;
  onChange;
  debounceMs;
  constructor(workspaceRoot, onChange, debounceMs = 300) {
    this.onChange = onChange;
    this.debounceMs = debounceMs;
    const wqPattern = new vscode5.RelativePattern(
      workspaceRoot,
      "documents/handoffs/work_queue.json"
    );
    const wqWatcher = vscode5.workspace.createFileSystemWatcher(wqPattern);
    wqWatcher.onDidChange(() => this.debouncedRefresh());
    const wlPattern = new vscode5.RelativePattern(
      workspaceRoot,
      "documents/handoffs/**/*WORKLIST*.md"
    );
    const wlWatcher = vscode5.workspace.createFileSystemWatcher(wlPattern);
    wlWatcher.onDidChange(() => this.debouncedRefresh());
    wlWatcher.onDidCreate(() => this.debouncedRefresh());
    wlWatcher.onDidDelete(() => this.debouncedRefresh());
    const tpPattern = new vscode5.RelativePattern(
      workspaceRoot,
      "documents/handoffs/**/*TEST*.md"
    );
    const tpWatcher = vscode5.workspace.createFileSystemWatcher(tpPattern);
    tpWatcher.onDidChange(() => this.debouncedRefresh());
    tpWatcher.onDidCreate(() => this.debouncedRefresh());
    tpWatcher.onDidDelete(() => this.debouncedRefresh());
    this.watchers = [wqWatcher, wlWatcher, tpWatcher];
  }
  debouncedRefresh() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.onChange();
    }, this.debounceMs);
  }
  dispose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watchers.forEach((w) => w.dispose());
  }
};

// src/providers/WQWebviewProvider.ts
var vscode6 = __toESM(require("vscode"));
var crypto = __toESM(require("crypto"));
var WQWebviewProvider = class {
  constructor(extensionUri, dataService, claudeService) {
    this.extensionUri = extensionUri;
    this.dataService = dataService;
    this.claudeService = claudeService;
  }
  panel;
  disposables = [];
  /** Open or reveal the webview panel. */
  open() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode6.window.createWebviewPanel(
      "purrWqBoard",
      "Work Queue",
      vscode6.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode6.Uri.joinPath(this.extensionUri, "dist"),
          vscode6.Uri.joinPath(this.extensionUri, "media")
        ]
      }
    );
    this.panel.iconPath = vscode6.Uri.joinPath(this.extensionUri, "media", "wq-icon.svg");
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      void 0,
      this.disposables
    );
    this.panel.onDidDispose(() => {
      this.panel = void 0;
      for (const d of this.disposables) {
        d.dispose();
      }
      this.disposables = [];
    });
  }
  /** Push updated data to the webview (called by file watcher). */
  pushDataUpdate() {
    this.postMessage({ type: "dataUpdate", data: this.buildPayload() });
  }
  dispose() {
    this.panel?.dispose();
  }
  // --- Private ---
  handleMessage(msg) {
    switch (msg.type) {
      case "ready":
        this.postMessage({ type: "init", data: this.buildPayload() });
        break;
      case "changeStatus": {
        const { itemId, newStatus } = msg.data;
        this.claudeService.changeStatus(itemId, newStatus).then((success) => {
          this.postMessage({ type: "statusChangeResult", data: { itemId, success } });
          if (success) {
            const toastMsg = newStatus === "active" ? `${itemId} started \u2014 prompt copied to clipboard. Paste into Claude Code.` : `${itemId} \u2192 ${newStatus}`;
            this.postMessage({ type: "toast", data: { message: toastMsg } });
          }
        });
        break;
      }
      case "openSpec": {
        const item = this.dataService.getItemById(msg.data.itemId);
        if (item && item.documents.length > 0) {
          const docIdx = msg.data.docIndex ?? 0;
          const targetDoc = item.documents[docIdx] ?? item.documents[0];
          const resolved = this.dataService.resolveDocumentPath(targetDoc);
          if (resolved) {
            vscode6.workspace.openTextDocument(resolved).then(
              (doc) => vscode6.window.showTextDocument(doc, vscode6.ViewColumn.Beside),
              () => vscode6.window.showErrorMessage(`Could not open: ${targetDoc.path}`)
            );
          } else {
            vscode6.window.showErrorMessage(`File not found: ${targetDoc.path}`);
          }
        } else {
          vscode6.window.showInformationMessage(`No documents linked to ${msg.data.itemId}.`);
        }
        break;
      }
      case "openWorklist": {
        const wlPath = this.dataService.resolveWorklistPath(msg.data.itemId);
        if (wlPath) {
          vscode6.workspace.openTextDocument(wlPath).then(
            (doc) => vscode6.window.showTextDocument(doc, vscode6.ViewColumn.Beside),
            () => vscode6.window.showErrorMessage(`Could not open worklist for ${msg.data.itemId}.`)
          );
        } else {
          vscode6.window.showInformationMessage(`No worklist found for ${msg.data.itemId}.`);
        }
        break;
      }
      case "copyId":
        vscode6.env.clipboard.writeText(msg.data.itemId);
        this.postMessage({ type: "toast", data: { message: `Copied ${msg.data.itemId}` } });
        break;
      case "editField": {
        const { itemId, field, value } = msg.data;
        this.claudeService.editField(itemId, field, value).then((success) => {
          if (success) {
            this.postMessage({ type: "toast", data: { message: `${itemId} ${field} \u2192 ${value}` } });
            setTimeout(() => this.pushDataUpdate(), 300);
          }
        });
        break;
      }
      case "delegateExplore": {
        const item = this.dataService.getItemById(msg.data.itemId);
        if (item) {
          this.claudeService.delegateExplore(item);
          this.postMessage({ type: "toast", data: { message: "Explore prompt copied \u2014 paste into Claude Code." } });
        }
        break;
      }
      case "delegatePlan": {
        const item = this.dataService.getItemById(msg.data.itemId);
        if (item) {
          this.claudeService.delegatePlan(item);
          this.postMessage({ type: "toast", data: { message: "Plan prompt copied \u2014 paste into Claude Code." } });
        }
        break;
      }
      case "saveSettings": {
        this.dataService.saveSettings(msg.data.settings);
        this.postMessage({ type: "toast", data: { message: "Settings saved" } });
        setTimeout(() => this.pushDataUpdate(), 200);
        break;
      }
      case "requestWorklistDetail": {
        const detail = this.buildWorklistDetail(msg.data.wqId);
        this.postMessage({ type: "worklistDetail", data: detail });
        break;
      }
      case "saveWorklistTasks": {
        const { wqId, sections } = msg.data;
        const parsed = this.dataService.getWorklistDetail(wqId);
        if (parsed) {
          for (const incoming of sections) {
            const target = parsed.sections.find((s) => s.heading === incoming.heading);
            if (!target) {
              continue;
            }
            const rawLines = target.items.filter((i) => "type" in i && i.type === "raw");
            const newItems = incoming.tasks.map((t) => ({
              id: t.id,
              text: t.text,
              checked: t.checked,
              section: incoming.heading
            }));
            target.items = [...newItems, ...rawLines];
          }
          const success = this.dataService.saveWorklistDetail(wqId, parsed);
          if (success) {
            this.postMessage({ type: "toast", data: { message: "Worklist saved" } });
            setTimeout(() => this.pushDataUpdate(), 300);
          }
        }
        break;
      }
      case "requestTestPlanDetail": {
        const tpDetail = this.buildTestPlanDetail(msg.data.wqId);
        this.postMessage({ type: "testPlanDetail", data: tpDetail });
        break;
      }
      case "saveTestPlanTests": {
        const { wqId, sections: tpSections } = msg.data;
        const tpParsed = this.dataService.getTestPlanDetail(wqId);
        if (tpParsed) {
          for (const incoming of tpSections) {
            const target = tpParsed.sections.find((s) => s.heading === incoming.heading);
            if (!target) {
              continue;
            }
            const rawLines = target.items.filter((i) => "type" in i && i.type === "raw");
            const newItems = incoming.tests.map((t) => ({
              id: t.id,
              text: t.text,
              status: t.status,
              section: incoming.heading
            }));
            target.items = [...newItems, ...rawLines];
          }
          const success = this.dataService.saveTestPlanDetail(wqId, tpParsed);
          if (success) {
            this.postMessage({ type: "toast", data: { message: "Test plan saved" } });
            setTimeout(() => this.pushDataUpdate(), 300);
          }
        }
        break;
      }
      case "createBugFromTest": {
        const { wqId, testText } = msg.data;
        const wlParsed = this.dataService.getWorklistDetail(wqId);
        if (!wlParsed) {
          this.postMessage({ type: "toast", data: { message: `No worklist found for ${wqId} \u2014 create one first.` } });
          break;
        }
        let bugsSection = wlParsed.sections.find((s) => s.heading === "Bugs from Testing");
        if (!bugsSection) {
          bugsSection = { heading: "Bugs from Testing", items: [] };
          wlParsed.sections.push(bugsSection);
        }
        const nextId = `task-${Date.now()}`;
        bugsSection.items.push({
          id: nextId,
          text: `[TEST FAIL] ${testText}`,
          checked: false,
          section: "Bugs from Testing"
        });
        const bugSaved = this.dataService.saveWorklistDetail(wqId, wlParsed);
        if (bugSaved) {
          this.postMessage({ type: "toast", data: { message: `Bug filed to worklist: ${testText}` } });
          setTimeout(() => this.pushDataUpdate(), 300);
        }
        break;
      }
      case "showNotification": {
        const { message, kind } = msg.data;
        if (kind === "error") {
          vscode6.window.showErrorMessage(message);
        } else if (kind === "warning") {
          vscode6.window.showWarningMessage(message);
        } else {
          vscode6.window.showInformationMessage(message);
        }
        break;
      }
    }
  }
  buildPayload() {
    const items = this.dataService.getItems();
    const settings = this.dataService.getSettings();
    const worklists = [];
    const testPlans = [];
    for (const item of items) {
      const wlMapping = this.dataService.getWorklistForItem(item.id);
      if (wlMapping && wlMapping.progress.total > 0) {
        worklists.push({
          wqId: item.id,
          completed: wlMapping.progress.completed,
          pending: wlMapping.progress.pending,
          total: wlMapping.progress.total
        });
      }
      const tpMapping = this.dataService.getTestPlanForItem(item.id);
      if (tpMapping && tpMapping.progress.total > 0) {
        testPlans.push({
          wqId: item.id,
          pass: tpMapping.progress.pass,
          fail: tpMapping.progress.fail,
          pending: tpMapping.progress.pending,
          total: tpMapping.progress.total
        });
      }
    }
    return { items, worklists, settings, testPlans };
  }
  /** Convert a ParsedWorklist to a webview-safe WorklistDetailView. */
  buildWorklistDetail(wqId) {
    const parsed = this.dataService.getWorklistDetail(wqId);
    if (!parsed) {
      return null;
    }
    const sections = [];
    for (const section of parsed.sections) {
      const tasks = [];
      for (const item of section.items) {
        if ("type" in item && item.type === "raw") {
          continue;
        }
        const task = item;
        tasks.push({
          id: task.id,
          text: task.text,
          checked: task.checked,
          section: section.heading
        });
      }
      if (tasks.length > 0) {
        sections.push({ heading: section.heading, tasks });
      }
    }
    return { wqId, title: parsed.title, sections };
  }
  /** Convert a ParsedTestPlan to a webview-safe TestPlanDetailView. */
  buildTestPlanDetail(wqId) {
    const parsed = this.dataService.getTestPlanDetail(wqId);
    if (!parsed) {
      return null;
    }
    const sections = [];
    for (const section of parsed.sections) {
      const tests = [];
      for (const item of section.items) {
        if ("type" in item && item.type === "raw") {
          continue;
        }
        const test = item;
        tests.push({
          id: test.id,
          text: test.text,
          status: test.status,
          section: section.heading
        });
      }
      if (tests.length > 0) {
        sections.push({ heading: section.heading, tests });
      }
    }
    return { wqId, title: parsed.title, sections };
  }
  postMessage(msg) {
    this.panel?.webview.postMessage(msg);
  }
  getHtml(webview) {
    const nonce = crypto.randomBytes(16).toString("hex");
    const scriptUri = webview.asWebviewUri(
      vscode6.Uri.joinPath(this.extensionUri, "dist", "webview", "main.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode6.Uri.joinPath(this.extensionUri, "media", "webview.css")
    );
    const bundledCssUri = webview.asWebviewUri(
      vscode6.Uri.joinPath(this.extensionUri, "dist", "webview", "main.css")
    );
    const dynamicCss = this.buildDynamicCss();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${bundledCssUri}">
  <link rel="stylesheet" href="${cssUri}">
  <style>${dynamicCss}</style>
  <title>Work Queue</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
  /** Generate CSS variables and utility classes from settings. */
  buildDynamicCss() {
    const settings = this.dataService.getSettings();
    const lines = [":root {"];
    for (const s of settings.statuses) {
      lines.push(`  --wq-status-${s.id}: ${s.color};`);
    }
    for (const t of settings.tracks) {
      lines.push(`  --wq-track-${t.id}: ${t.color};`);
    }
    for (const p of settings.phases) {
      lines.push(`  --wq-phase-${p.id}: ${p.color};`);
    }
    lines.push("}");
    for (const s of settings.statuses) {
      lines.push(`.status-${s.id} { background: color-mix(in srgb, var(--wq-status-${s.id}) 20%, transparent); color: var(--wq-status-${s.id}); }`);
    }
    for (const t of settings.tracks) {
      lines.push(`.track-dot-${t.id} { background: var(--wq-track-${t.id}); }`);
    }
    return lines.join("\n");
  }
};

// src/extension.ts
function activate(context) {
  const workspaceRoot = vscode7.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    const emptyProvider = {
      getTreeItem: (el) => el,
      getChildren: () => []
    };
    context.subscriptions.push(
      vscode7.window.createTreeView("wqItems", { treeDataProvider: emptyProvider }),
      vscode7.window.createTreeView("wqActiveWork", { treeDataProvider: emptyProvider })
    );
    return;
  }
  const handoffsDir = path3.join(workspaceRoot, "documents", "handoffs");
  const dataService = new WQDataService(handoffsDir);
  const claudeService = new ClaudeCodeService(workspaceRoot);
  const savedGrouping = context.workspaceState.get("purr-wq.grouping", "phase");
  const itemsProvider = new WQTreeProvider(dataService, savedGrouping);
  const activeProvider = new WQActiveTreeProvider(dataService);
  const webviewProvider = new WQWebviewProvider(context.extensionUri, dataService, claudeService);
  const itemsView = vscode7.window.createTreeView("wqItems", {
    treeDataProvider: itemsProvider,
    showCollapseAll: true
  });
  const activeView = vscode7.window.createTreeView("wqActiveWork", {
    treeDataProvider: activeProvider
  });
  const fileWatcher = new WQFileWatcher(workspaceRoot, () => {
    dataService.reload();
    itemsProvider.refresh();
    activeProvider.refresh();
    webviewProvider.pushDataUpdate();
  });
  const getItem = (treeItem) => {
    return treeItem && "wqItem" in treeItem ? treeItem.wqItem : void 0;
  };
  const refreshCmd = vscode7.commands.registerCommand("purr-wq.refresh", () => {
    dataService.reload();
    itemsProvider.refresh();
    activeProvider.refresh();
  });
  const groupByPhaseCmd = vscode7.commands.registerCommand("purr-wq.groupByPhase", () => {
    setGrouping("phase", context, itemsProvider);
  });
  const groupByStatusCmd = vscode7.commands.registerCommand("purr-wq.groupByStatus", () => {
    setGrouping("status", context, itemsProvider);
  });
  const groupByTrackCmd = vscode7.commands.registerCommand("purr-wq.groupByTrack", () => {
    setGrouping("track", context, itemsProvider);
  });
  const groupByGradeCmd = vscode7.commands.registerCommand("purr-wq.groupByGrade", () => {
    setGrouping("grade", context, itemsProvider);
  });
  const openSpecCmd = vscode7.commands.registerCommand("purr-wq.openSpec", (treeItem) => {
    const item = treeItem?.wqItem;
    if (!item || item.documents.length === 0) {
      vscode7.window.showInformationMessage(`No documents linked to ${item?.id || "this item"}.`);
      return;
    }
    const doc = item.documents[0];
    const resolved = dataService.resolveDocumentPath(doc);
    if (resolved) {
      vscode7.workspace.openTextDocument(resolved).then(
        (d) => vscode7.window.showTextDocument(d),
        () => vscode7.window.showErrorMessage(`Could not open: ${doc.path}`)
      );
    } else {
      vscode7.window.showErrorMessage(`File not found: ${doc.path}`);
    }
  });
  const openWorklistCmd = vscode7.commands.registerCommand("purr-wq.openWorklist", (treeItem) => {
    const item = treeItem?.wqItem;
    if (!item) {
      return;
    }
    const wlPath = dataService.resolveWorklistPath(item.id);
    if (wlPath) {
      vscode7.workspace.openTextDocument(wlPath).then(
        (d) => vscode7.window.showTextDocument(d),
        () => vscode7.window.showErrorMessage(`Could not open worklist for ${item.id}.`)
      );
    } else {
      vscode7.window.showInformationMessage(`No worklist found for ${item.id}.`);
    }
  });
  const copyIdCmd = vscode7.commands.registerCommand("purr-wq.copyId", (treeItem) => {
    const item = treeItem?.wqItem;
    if (item) {
      vscode7.env.clipboard.writeText(item.id);
      vscode7.window.showInformationMessage(`Copied ${item.id} to clipboard.`);
    }
  });
  const filterCmd = vscode7.commands.registerCommand("purr-wq.filterItems", async () => {
    const current = itemsProvider.getFilter();
    const input = await vscode7.window.showInputBox({
      prompt: "Filter WQ items by title, tags, or ID",
      value: current,
      placeHolder: 'e.g. "dashboard", "WQ-065", "frontend"'
    });
    if (input !== void 0) {
      itemsProvider.setFilter(input);
      if (input) {
        itemsView.title = `Items (filtered: "${input}")`;
      } else {
        itemsView.title = "Items";
      }
    }
  });
  const clearFilterCmd = vscode7.commands.registerCommand("purr-wq.clearFilter", () => {
    itemsProvider.setFilter("");
    itemsView.title = "Items";
  });
  const startWorkCmd = vscode7.commands.registerCommand("purr-wq.startWork", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.changeStatus(item.id, "active");
    }
  });
  const markReadyCmd = vscode7.commands.registerCommand("purr-wq.markReady", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.changeStatus(item.id, "ready");
    }
  });
  const markBlockedCmd = vscode7.commands.registerCommand("purr-wq.markBlocked", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.changeStatus(item.id, "blocked");
    }
  });
  const markDoneCmd = vscode7.commands.registerCommand("purr-wq.markDone", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.changeStatus(item.id, "done");
    }
  });
  const archiveCmd = vscode7.commands.registerCommand("purr-wq.archive", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.changeStatus(item.id, "archive");
    }
  });
  const delegateExploreCmd = vscode7.commands.registerCommand("purr-wq.delegateExplore", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.delegateExplore(item);
    }
  });
  const delegatePlanCmd = vscode7.commands.registerCommand("purr-wq.delegatePlan", (treeItem) => {
    const item = getItem(treeItem);
    if (item) {
      claudeService.delegatePlan(item);
    }
  });
  const delegateTriageCmd = vscode7.commands.registerCommand("purr-wq.delegateTriage", () => {
    claudeService.delegateTriage();
  });
  const openBoardCmd = vscode7.commands.registerCommand("purr-wq.openBoard", () => {
    webviewProvider.open();
  });
  context.subscriptions.push(
    itemsView,
    activeView,
    fileWatcher,
    claudeService,
    refreshCmd,
    groupByPhaseCmd,
    groupByStatusCmd,
    groupByTrackCmd,
    groupByGradeCmd,
    openSpecCmd,
    openWorklistCmd,
    copyIdCmd,
    filterCmd,
    clearFilterCmd,
    startWorkCmd,
    markReadyCmd,
    markBlockedCmd,
    markDoneCmd,
    archiveCmd,
    delegateExploreCmd,
    delegatePlanCmd,
    delegateTriageCmd,
    openBoardCmd,
    webviewProvider
  );
}
function setGrouping(mode, context, provider) {
  provider.setGrouping(mode);
  context.workspaceState.update("purr-wq.grouping", mode);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
