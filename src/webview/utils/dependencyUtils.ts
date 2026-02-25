// Dependency chain traversal, cycle detection, and impact calculation.
// Ported from work-queue-viewer/client/src/utils/dependencyUtils.js

import type { WQItem } from '../../models/WQItem';

export interface DepTreeNode {
  id: string;
  title: string;
  status: string;
  track?: string;
  children: DepTreeNode[];
}

export interface DepSatisfaction {
  satisfied: boolean;
  pending: number;
  done: number;
  total: number;
}

export interface Impact {
  direct: number;
  transitive: number;
  total: number;
}

/** Recursive upstream chain (items this depends on). */
export function getUpstreamChain(itemId: string, allItems: WQItem[], visited = new Set<string>()): DepTreeNode[] {
  if (visited.has(itemId)) { return []; }
  visited.add(itemId);

  const item = allItems.find(i => i.id === itemId);
  if (!item || !item.dependsOn || item.dependsOn.length === 0) { return []; }

  return item.dependsOn.map(depId => {
    const dep = allItems.find(i => i.id === depId);
    if (!dep) {
      return { id: depId, title: '(not found)', status: 'unknown', children: [] };
    }
    return {
      id: dep.id,
      title: dep.title,
      status: dep.status,
      track: dep.track,
      children: getUpstreamChain(depId, allItems, new Set(visited)),
    };
  });
}

/** Recursive downstream chain (items blocked by this). */
export function getDownstreamChain(itemId: string, allItems: WQItem[], visited = new Set<string>()): DepTreeNode[] {
  if (visited.has(itemId)) { return []; }
  visited.add(itemId);

  const blocked = allItems.filter(i => i.dependsOn?.includes(itemId));
  return blocked.map(b => ({
    id: b.id,
    title: b.title,
    status: b.status,
    track: b.track,
    children: getDownstreamChain(b.id, allItems, new Set(visited)),
  }));
}

/** True if adding newDepId as a dependency of itemId would create a cycle. */
export function detectCycle(itemId: string, newDepId: string, allItems: WQItem[]): boolean {
  if (itemId === newDepId) { return true; }

  const visited = new Set<string>();
  function hasPath(current: string, target: string): boolean {
    if (current === target) { return true; }
    if (visited.has(current)) { return false; }
    visited.add(current);
    const item = allItems.find(i => i.id === current);
    return item?.dependsOn?.some(d => hasPath(d, target)) ?? false;
  }

  return hasPath(newDepId, itemId);
}

/** Check whether all direct dependencies of an item are satisfied (done). */
export function checkDependenciesSatisfied(item: WQItem, allItems: WQItem[]): DepSatisfaction {
  if (!item.dependsOn || item.dependsOn.length === 0) {
    return { satisfied: true, pending: 0, done: 0, total: 0 };
  }

  let done = 0;
  let pending = 0;
  for (const depId of item.dependsOn) {
    const dep = allItems.find(i => i.id === depId);
    if (dep && dep.status === 'done') { done++; } else { pending++; }
  }
  return { satisfied: pending === 0, pending, done, total: item.dependsOn.length };
}

/** Flatten a dependency tree to a unique list. */
export function flattenTree(tree: DepTreeNode[], seen = new Set<string>()): Array<{ id: string; title: string; status: string; track?: string }> {
  const result: Array<{ id: string; title: string; status: string; track?: string }> = [];
  for (const node of tree) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      result.push({ id: node.id, title: node.title, status: node.status, track: node.track });
      result.push(...flattenTree(node.children || [], seen));
    }
  }
  return result;
}

/** Impact score: how many downstream tasks does this item block? */
export function calculateImpact(itemId: string, allItems: WQItem[]): Impact {
  const directlyBlocked = allItems.filter(i => i.dependsOn?.includes(itemId));
  const downstream = flattenTree(getDownstreamChain(itemId, allItems));
  return {
    direct: directlyBlocked.length,
    transitive: downstream.length - directlyBlocked.length,
    total: downstream.length,
  };
}

/** Impact level classification. */
export function getImpactLevel(total: number): 'critical' | 'high' | 'medium' | 'none' {
  if (total >= 5) { return 'critical'; }
  if (total >= 3) { return 'high'; }
  if (total >= 1) { return 'medium'; }
  return 'none';
}
