// Dagre-based graph layout utilities for dependency visualization.
// Ported from work-queue-viewer/client/src/utils/graphLayout.js

import * as dagre from 'dagre';
import { MarkerType } from 'reactflow';
import type { WQItem } from '../../models/WQItem';
import type { WQSettings } from '../../models/WQItem';

/**
 * Calculate downstream impact for an item (how many tasks it blocks, recursively)
 */
function calculateDownstreamImpact(itemId: string, allItems: WQItem[], visited = new Set<string>()): number {
  if (visited.has(itemId)) return 0;
  visited.add(itemId);

  // Find items that depend on this item
  const directlyBlocked = allItems.filter(i => i.dependsOn?.includes(itemId));
  let total = directlyBlocked.length;

  // Recursively count transitive dependencies
  for (const blocked of directlyBlocked) {
    total += calculateDownstreamImpact(blocked.id, allItems, visited);
  }

  return total;
}

export interface ColorEntry { bg: string; border: string; dot: string; }

/** Build track color map from settings, using namespaced CSS vars. */
export function buildTrackColors(settings: WQSettings): Record<string, ColorEntry> {
  const map: Record<string, ColorEntry> = {};
  for (const t of settings.tracks) {
    const v = `var(--wq-track-${t.id})`;
    map[t.id] = { bg: v, border: v, dot: v };
  }
  return map;
}

/** Build status color map from settings, using namespaced CSS vars. */
export function buildStatusColors(settings: WQSettings): Record<string, ColorEntry> {
  const map: Record<string, ColorEntry> = {};
  for (const s of settings.statuses) {
    const v = `var(--wq-status-${s.id})`;
    map[s.id] = { bg: v, border: v, dot: v };
  }
  return map;
}

/** Fallback color entry for unknown values. */
const FALLBACK_COLOR: ColorEntry = { bg: 'var(--vscode-descriptionForeground)', border: 'var(--vscode-descriptionForeground)', dot: 'var(--vscode-descriptionForeground)' };

export interface GraphLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  phaseGap?: number;
  nodeGapX?: number;
  nodeGapY?: number;
  headerHeight?: number;
}

export interface PhaseColumn {
  phase: string;
  x: number;
  width: number;
  items: WQItem[];
  graph?: dagre.graphlib.Graph;
}

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    id: string;
    title: string;
    status: string;
    track: string;
    phase: string;
    effort?: string;
    dependsOnCount: number;
    blocksCount: number;
    impactTotal?: number;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  animated: boolean;
  sourceHandle: string;
  targetHandle: string;
  style: {
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
  };
  markerEnd: {
    type: MarkerType;
    width: number;
    height: number;
    color: string;
  };
  data: {
    isCrossPhase: boolean;
    edgeLength: number;
    showChevrons: boolean;
    edgeColor: string;
    offset: number;
  };
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  phaseColumns: PhaseColumn[];
}

/**
 * Calculate node positions using phase-based timeline layout with dagre.
 * phaseOrder defaults to DEFAULT_SETTINGS order if not provided.
 */
export function calculateTimelineLayout(items: WQItem[], options: GraphLayoutOptions = {}, phaseOrder?: string[]): GraphLayout {
  const {
    nodeWidth = 200,
    nodeHeight = 80,
    phaseGap = 100,
    nodeGapX = 40,
    nodeGapY = 30,
    headerHeight = 60
  } = options;

  const effectivePhaseOrder = phaseOrder || ['pre-beta', 'beta', 'post-beta', 'production'];

  if (!items || items.length === 0) {
    return { nodes: [], edges: [], phaseColumns: [] };
  }

  // Group items by phase
  const itemsByPhase: Record<string, WQItem[]> = {};
  effectivePhaseOrder.forEach(phase => {
    itemsByPhase[phase] = items.filter(item => item.phase === phase);
  });

  // Also handle items with unknown phases
  const knownPhaseItems = new Set(effectivePhaseOrder.flatMap(p => (itemsByPhase[p] || []).map(i => i.id)));
  const unknownPhaseItems = items.filter(i => !knownPhaseItems.has(i.id));
  if (unknownPhaseItems.length > 0) {
    itemsByPhase['other'] = unknownPhaseItems;
  }

  // Calculate phase column positions
  const phaseColumns: PhaseColumn[] = [];
  let currentX = 50;

  const phases = [...effectivePhaseOrder];
  if (itemsByPhase['other']?.length > 0) {
    phases.push('other');
  }

  phases.forEach(phase => {
    const phaseItems = itemsByPhase[phase] || [];
    if (phaseItems.length === 0 && phase !== 'other') {
      // Still create column for empty phases
      phaseColumns.push({
        phase,
        x: currentX,
        width: nodeWidth + nodeGapX * 2,
        items: []
      });
      currentX += nodeWidth + nodeGapX * 2 + phaseGap;
      return;
    }

    // Create dagre graph for this phase
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'TB',
      nodesep: nodeGapY,
      ranksep: nodeGapY,
      marginx: nodeGapX,
      marginy: nodeGapX
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    phaseItems.forEach(item => {
      g.setNode(item.id, { width: nodeWidth, height: nodeHeight });
    });

    // Add edges for dependencies within this phase
    phaseItems.forEach(item => {
      if (item.dependsOn) {
        item.dependsOn.forEach(depId => {
          if (phaseItems.some(i => i.id === depId)) {
            g.setEdge(item.id, depId);
          }
        });
      }
    });

    // Run dagre layout
    dagre.layout(g);

    // Get layout bounds
    let maxX = 0;
    let maxY = 0;
    g.nodes().forEach(nodeId => {
      const node = g.node(nodeId);
      maxX = Math.max(maxX, node.x + nodeWidth / 2);
      maxY = Math.max(maxY, node.y + nodeHeight / 2);
    });

    const columnWidth = Math.max(maxX + nodeGapX, nodeWidth + nodeGapX * 2);

    phaseColumns.push({
      phase,
      x: currentX,
      width: columnWidth,
      items: phaseItems,
      graph: g
    });

    currentX += columnWidth + phaseGap;
  });

  // Calculate impact scores
  const impactScores = new Map<string, number>();
  items.forEach(item => {
    const impact = calculateDownstreamImpact(item.id, items);
    impactScores.set(item.id, impact);
  });

  const IMPACT_THRESHOLD = 3;
  const IMPACT_OFFSET_PER_DEP = 25;

  function calculateImpactOffset(itemId: string) {
    const impact = impactScores.get(itemId) || 0;
    if (impact < IMPACT_THRESHOLD) return 0;
    return (impact - IMPACT_THRESHOLD + 1) * IMPACT_OFFSET_PER_DEP;
  }

  // Generate final node positions
  const nodes: GraphNode[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();

  phaseColumns.forEach(column => {
    if (!column.graph) return;

    column.graph.nodes().forEach(nodeId => {
      const layoutNode = column.graph!.node(nodeId);
      const item = items.find(i => i.id === nodeId);
      if (!item) return;

      const x = column.x + layoutNode.x;
      const impactOffset = calculateImpactOffset(nodeId);
      const y = headerHeight + layoutNode.y + impactOffset;

      nodePositions.set(nodeId, { x, y });

      nodes.push({
        id: nodeId,
        type: 'workItem',
        position: { x, y },
        data: {
          id: item.id,
          title: item.title,
          status: item.status,
          track: item.track,
          phase: item.phase,
          effort: item.effort ?? undefined,
          dependsOnCount: item.dependsOn?.length || 0,
          blocksCount: items.filter(i => i.dependsOn?.includes(item.id)).length,
          impactTotal: impactScores.get(item.id)
        }
      });
    });
  });

  // Generate edges
  const edges: GraphEdge[] = [];
  const sourceEdgeCounts = new Map<string, number>();
  const targetEdgeCounts = new Map<string, number>();
  const sourceEdgeIndex = new Map<string, number>();
  const targetEdgeIndex = new Map<string, number>();

  // First pass: count edges
  items.forEach(item => {
    if (item.dependsOn) {
      item.dependsOn.forEach(depId => {
        if (items.some(i => i.id === depId)) {
          sourceEdgeCounts.set(depId, (sourceEdgeCounts.get(depId) || 0) + 1);
          targetEdgeCounts.set(item.id, (targetEdgeCounts.get(item.id) || 0) + 1);
        }
      });
    }
  });

  // Second pass: create edges
  const EDGE_OFFSET_SPACING = 40;

  items.forEach(item => {
    if (item.dependsOn) {
      item.dependsOn.forEach(depId => {
        if (items.some(i => i.id === depId)) {
          const parentItem = items.find(i => i.id === depId);
          const isCrossPhase = parentItem?.phase !== item.phase;

          const sourceCount = sourceEdgeCounts.get(depId) || 1;
          const targetCount = targetEdgeCounts.get(item.id) || 1;
          const srcIndex = sourceEdgeIndex.get(depId) || 0;
          const tgtIndex = targetEdgeIndex.get(item.id) || 0;

          sourceEdgeIndex.set(depId, srcIndex + 1);
          targetEdgeIndex.set(item.id, tgtIndex + 1);

          const sourceOffset = (srcIndex - (sourceCount - 1) / 2) * EDGE_OFFSET_SPACING;
          const targetOffset = (tgtIndex - (targetCount - 1) / 2) * EDGE_OFFSET_SPACING;
          const edgeOffset = Math.abs(sourceOffset) > Math.abs(targetOffset) ? sourceOffset : targetOffset;

          const sourcePos = nodePositions.get(depId);
          const targetPos = nodePositions.get(item.id);
          const edgeLength = sourcePos && targetPos
            ? Math.sqrt(Math.pow(targetPos.x - sourcePos.x, 2) + Math.pow(targetPos.y - sourcePos.y, 2))
            : 0;

          const edgeColor = isCrossPhase ? '#6366f1' : '#6b7280';

          edges.push({
            id: `${depId}->${item.id}`,
            source: depId,
            target: item.id,
            type: 'smoothstep',
            animated: parentItem?.status !== 'done',
            sourceHandle: 'source',
            targetHandle: 'target',
            style: {
              stroke: edgeColor,
              strokeWidth: isCrossPhase ? 3 : 2,
              strokeDasharray: parentItem?.status === 'done' ? undefined : '5,5'
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: edgeColor
            },
            data: {
              isCrossPhase,
              edgeLength,
              showChevrons: edgeLength > 150,
              edgeColor,
              offset: edgeOffset
            }
          });
        }
      });
    }
  });

  return { nodes, edges, phaseColumns };
}

/**
 * Calculate total graph dimensions
 */
export function getGraphDimensions(phaseColumns: PhaseColumn[], nodes: { position: { x: number; y: number } }[]) {
  if (phaseColumns.length === 0) return { width: 800, height: 600 };

  const lastColumn = phaseColumns[phaseColumns.length - 1];
  const width = lastColumn.x + lastColumn.width + 50;

  let maxY = 0;
  nodes.forEach(node => {
    maxY = Math.max(maxY, node.position.y + 100);
  });

  return { width, height: Math.max(maxY + 50, 400) };
}
