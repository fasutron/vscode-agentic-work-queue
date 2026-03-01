// Parses *TEST_PLAN*.md and *TESTING_CHECKLIST*.md files for tri-state test progress,
// WQ ID associations, and full structured parsing for round-trip editing.
// Format: checklist with - [x] (pass), - [!] (fail), - [ ] (pending).

import type { TestPlanProgress, TestItem, TestRawLine, TestSection, ParsedTestPlan, TestStatus } from './WQItem';
import {
  WORKLIST_ID_FILENAME_REGEX,
  WORKLIST_HEADER_REGEX,
  WQ_ID_EXTRACT_REGEX,
} from '../utils/constants';

// Checkbox patterns for tri-state test items
const PASS_REGEX = /^-\s*\[x\]/i;          // - [x] or - [X]
const FAIL_REGEX = /^-\s*\[!\]/;            // - [!]
const PENDING_REGEX = /^-\s*\[\s\]/;        // - [ ]

/**
 * Parse a test plan markdown file for tri-state progress counts.
 * Counts all `- [x]` (pass), `- [!]` (fail), and `- [ ]` (pending) lines.
 */
export function parseTestPlanProgress(content: string): TestPlanProgress {
  const lines = content.split('\n');
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

/**
 * Extract WQ IDs associated with a test plan file.
 * Uses the same strategies as worklist: filename regex + header line parsing.
 */
export function extractWqIdsFromTestPlan(content: string, filename: string): string[] {
  const ids = new Set<string>();

  // Strategy 1: Extract from filename (e.g. WQ155_Scenario_Editor_TEST_PLAN → WQ-155)
  const filenameMatch = filename.match(WORKLIST_ID_FILENAME_REGEX);
  if (filenameMatch) {
    ids.add(`WQ-${filenameMatch[1]}`);
  }

  // Strategy 2: Extract from header line (e.g. **WQ Item:** WQ-066)
  const headerMatch = content.match(WORKLIST_HEADER_REGEX);
  if (headerMatch) {
    const headerValue = headerMatch[1];
    const idRegex = new RegExp(WQ_ID_EXTRACT_REGEX.source, 'g');
    let idMatch;
    while ((idMatch = idRegex.exec(headerValue)) !== null) {
      ids.add(`WQ-${idMatch[1]}`);
    }
  }

  return Array.from(ids);
}

/**
 * Determine test status from a trimmed checklist line.
 * Returns the status and extracted text, or null if not a test item.
 */
function parseChecklistLine(trimmed: string): { status: TestStatus; text: string } | null {
  if (PASS_REGEX.test(trimmed)) {
    return { status: 'pass', text: trimmed.replace(/^-\s*\[x\]\s*/i, '') };
  }
  if (FAIL_REGEX.test(trimmed)) {
    return { status: 'fail', text: trimmed.replace(/^-\s*\[!\]\s*/, '') };
  }
  if (PENDING_REGEX.test(trimmed)) {
    return { status: 'pending', text: trimmed.replace(/^-\s*\[\s\]\s*/, '') };
  }
  return null;
}

/**
 * Parse a test plan markdown file into a full structured representation.
 * Preserves non-checkbox content as raw lines for round-trip fidelity.
 */
export function parseTestPlanFull(content: string, filename: string): ParsedTestPlan {
  const lines = content.split('\n');
  const wqIds = extractWqIdsFromTestPlan(content, filename);

  let title = '';
  let rawPreamble = '';
  const sections: TestSection[] = [];

  let phase: 'before-h1' | 'preamble' | 'section' = 'before-h1';
  let currentSection: TestSection | null = null;
  const preambleLines: string[] = [];
  let testCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // H1 title
    if (phase === 'before-h1' && /^#\s+/.test(trimmed)) {
      title = trimmed.replace(/^#\s+/, '');
      phase = 'preamble';
      continue;
    }

    // H2 section heading
    if (/^##\s+/.test(trimmed)) {
      if (currentSection) { sections.push(currentSection); }
      const heading = trimmed.replace(/^##\s+/, '');
      currentSection = { heading, items: [] };
      phase = 'section';
      continue;
    }

    if (phase === 'preamble') {
      preambleLines.push(line);
      continue;
    }

    if (phase === 'section' && currentSection) {
      const parsed = parseChecklistLine(trimmed);
      if (parsed) {
        const test: TestItem = {
          id: `test-${testCounter++}`,
          text: parsed.text,
          status: parsed.status,
          section: currentSection.heading,
        };
        currentSection.items.push(test);
      } else {
        const raw: TestRawLine = { type: 'raw', text: line };
        currentSection.items.push(raw);
      }
    }
  }

  // Push final section
  if (currentSection) { sections.push(currentSection); }

  // Trim trailing blank lines from preamble
  while (preambleLines.length > 0 && preambleLines[preambleLines.length - 1].trim() === '') {
    preambleLines.pop();
  }
  rawPreamble = preambleLines.join('\n');

  return { title, wqIds, rawPreamble, sections };
}

/**
 * Serialize a ParsedTestPlan back to markdown.
 * Uses `- [x]` for pass, `- [!]` for fail, `- [ ]` for pending.
 */
export function serializeTestPlan(parsed: ParsedTestPlan): string {
  const lines: string[] = [];

  // H1 title
  lines.push(`# ${parsed.title}`);
  lines.push('');

  // Preamble (metadata block)
  if (parsed.rawPreamble) {
    lines.push(parsed.rawPreamble);
    lines.push('');
  }

  // Sections
  for (const section of parsed.sections) {
    lines.push(`## ${section.heading}`);
    for (const item of section.items) {
      if ('type' in item && item.type === 'raw') {
        lines.push(item.text);
      } else {
        const test = item as TestItem;
        const marker = test.status === 'pass' ? '- [x]'
                     : test.status === 'fail' ? '- [!]'
                     : '- [ ]';
        lines.push(`${marker} ${test.text}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
