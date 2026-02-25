// Parses *WORKLIST*.md files for checkbox progress counts, WQ ID associations,
// and full structured parsing for round-trip editing.

import type { WorklistProgress, WorklistTask, WorklistRawLine, WorklistSection, ParsedWorklist } from './WQItem';
import {
  WORKLIST_ID_FILENAME_REGEX,
  WORKLIST_HEADER_REGEX,
  WQ_ID_EXTRACT_REGEX,
} from '../utils/constants';

/**
 * Parse a WORKLIST markdown file for checkbox progress.
 * Counts all `- [x]` (completed) and `- [ ]` (pending) lines regardless of section.
 */
export function parseWorklistProgress(content: string): WorklistProgress {
  const lines = content.split('\n');
  let completed = 0;
  let pending = 0;
  let lastCompletedTask: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^-\s*\[x\]/i.test(trimmed)) {
      completed++;
      lastCompletedTask = trimmed.replace(/^-\s*\[x\]\s*/i, '');
    } else if (/^-\s*\[\s\]/.test(trimmed)) {
      pending++;
    }
  }

  return {
    completed,
    pending,
    total: completed + pending,
    lastCompletedTask: lastCompletedTask || undefined,
  };
}

/**
 * Extract WQ IDs associated with a WORKLIST file.
 * Uses two strategies: filename regex, then header line parsing.
 * Returns normalized IDs like ["WQ-155"].
 */
export function extractWqIdsFromWorklist(content: string, filename: string): string[] {
  const ids = new Set<string>();

  // Strategy 1: Extract from filename (e.g. WQ155_Scenario_Editor → WQ-155)
  const filenameMatch = filename.match(WORKLIST_ID_FILENAME_REGEX);
  if (filenameMatch) {
    ids.add(`WQ-${filenameMatch[1]}`);
  }

  // Strategy 2: Extract from header line (e.g. **WQ Item:** WQ-066 or **WQ Items:** WQ-189, WQ-136)
  const headerMatch = content.match(WORKLIST_HEADER_REGEX);
  if (headerMatch) {
    const headerValue = headerMatch[1];
    // Reset regex lastIndex for global pattern
    const idRegex = new RegExp(WQ_ID_EXTRACT_REGEX.source, 'g');
    let idMatch;
    while ((idMatch = idRegex.exec(headerValue)) !== null) {
      ids.add(`WQ-${idMatch[1]}`);
    }
  }

  return Array.from(ids);
}

/**
 * Parse a WORKLIST markdown file into a full structured representation.
 * Preserves non-checkbox content for round-trip fidelity.
 */
export function parseWorklistFull(content: string, filename: string): ParsedWorklist {
  const lines = content.split('\n');
  const wqIds = extractWqIdsFromWorklist(content, filename);

  let title = '';
  let rawPreamble = '';
  const sections: WorklistSection[] = [];

  let phase: 'before-h1' | 'preamble' | 'section' = 'before-h1';
  let currentSection: WorklistSection | null = null;
  const preambleLines: string[] = [];
  let taskCounter = 0;

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
      // Checkbox task
      if (/^-\s*\[x\]/i.test(trimmed)) {
        const text = trimmed.replace(/^-\s*\[x\]\s*/i, '');
        const task: WorklistTask = {
          id: `task-${taskCounter++}`,
          text,
          checked: true,
          section: currentSection.heading,
        };
        currentSection.items.push(task);
      } else if (/^-\s*\[\s\]/.test(trimmed)) {
        const text = trimmed.replace(/^-\s*\[\s\]\s*/, '');
        const task: WorklistTask = {
          id: `task-${taskCounter++}`,
          text,
          checked: false,
          section: currentSection.heading,
        };
        currentSection.items.push(task);
      } else {
        // Non-checkbox line (prose, sub-headings, blank lines, etc.)
        const raw: WorklistRawLine = { type: 'raw', text: line };
        currentSection.items.push(raw);
      }
    }
  }

  // Push final section
  if (currentSection) { sections.push(currentSection); }

  // Trim trailing blank lines from preamble but preserve internal structure
  while (preambleLines.length > 0 && preambleLines[preambleLines.length - 1].trim() === '') {
    preambleLines.pop();
  }
  rawPreamble = preambleLines.join('\n');

  return { title, wqIds, rawPreamble, sections };
}

/**
 * Serialize a ParsedWorklist back to markdown.
 * Round-trips cleanly: parse → serialize produces equivalent output.
 */
export function serializeWorklist(parsed: ParsedWorklist): string {
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
        const task = item as WorklistTask;
        const checkbox = task.checked ? '- [x]' : '- [ ]';
        lines.push(`${checkbox} ${task.text}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
