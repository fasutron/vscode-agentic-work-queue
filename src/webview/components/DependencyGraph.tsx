// Dependency graph view with ReactFlow + dagre layout.
// Ported from work-queue-viewer — VS Code theme integration.

import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Handle,
  Position,
  Panel
} from 'reactflow';
import type { WQItem, WQSettings } from '../../models/WQItem';
import { calculateTimelineLayout, buildTrackColors, buildStatusColors, getGraphDimensions } from '../utils/graphLayout';
import type { ColorEntry } from '../utils/graphLayout';

interface Props {
  items: WQItem[];
  settings: WQSettings;
  onItemClick: (item: WQItem) => void;
}

/** Info for the blocker popover — which node was clicked and where. */
interface BlockerPopover {
  sourceId: string;
  sourceTitle: string;
  blockedItems: WQItem[];
  x: number;
  y: number;
}

const FALLBACK_COLOR: ColorEntry = { bg: 'var(--vscode-descriptionForeground)', border: 'var(--vscode-descriptionForeground)', dot: 'var(--vscode-descriptionForeground)' };

/** Detect any dependency cycle in the full item set. */
function findCycleInGraph(items: WQItem[]): string[] | null {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();

  for (const item of items) {
    if (visited.has(item.id)) continue;
    const stack = [item.id];
    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (!visited.has(current)) {
        visited.add(current);
        inStack.add(current);
      }
      const currentItem = items.find(i => i.id === current);
      const deps = currentItem?.dependsOn || [];
      let pushed = false;
      for (const dep of deps) {
        if (!items.some(i => i.id === dep)) continue;
        if (inStack.has(dep)) {
          const cycle = [dep, current];
          let walker = current;
          while (walker !== dep && parent.has(walker)) {
            walker = parent.get(walker)!;
            cycle.push(walker);
          }
          return cycle.reverse();
        }
        if (!visited.has(dep)) {
          parent.set(dep, current);
          stack.push(dep);
          pushed = true;
          break;
        }
      }
      if (!pushed) {
        inStack.delete(current);
        stack.pop();
      }
    }
  }
  return null;
}

/** Collect all nodes in the dependency path from/to a given node. */
function getDependencyPath(nodeId: string, items: WQItem[]): Set<string> {
  const path = new Set<string>();
  path.add(nodeId);

  // Upstream: items this depends on
  function walkUp(id: string) {
    const item = items.find(i => i.id === id);
    for (const dep of item?.dependsOn || []) {
      if (!path.has(dep) && items.some(i => i.id === dep)) {
        path.add(dep);
        walkUp(dep);
      }
    }
  }

  // Downstream: items that depend on this
  function walkDown(id: string) {
    for (const item of items) {
      if (item.dependsOn?.includes(id) && !path.has(item.id)) {
        path.add(item.id);
        walkDown(item.id);
      }
    }
  }

  walkUp(nodeId);
  walkDown(nodeId);
  return path;
}

// Custom node component — dark card with track-color left border.
// Color maps are passed via data prop to avoid module-level dependency.
function WorkItemNode({ data, selected }: any) {
  const trackColors: Record<string, ColorEntry> = data._trackColors || {};
  const statusColors: Record<string, ColorEntry> = data._statusColors || {};
  const trackColor = trackColors[data.track] || FALLBACK_COLOR;
  const statusColor = statusColors[data.status] || FALLBACK_COLOR;
  const isHighlighted = data.isHighlighted;
  const isDimmed = data.isDimmed;

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onBlockerClick && data.blocksCount > 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      data.onBlockerClick(data.id, rect);
    }
  };

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '6px',
        border: `1px solid ${isHighlighted ? statusColor.border : 'var(--vscode-panel-border)'}`,
        borderLeft: `4px solid ${trackColor.dot}`,
        background: 'var(--vscode-editorWidget-background)',
        minWidth: '190px',
        maxWidth: '210px',
        cursor: 'pointer',
        opacity: isDimmed ? 0.3 : 1,
        boxShadow: selected
          ? '0 0 0 2px var(--vscode-focusBorder)'
          : isHighlighted
            ? `0 0 12px ${statusColor.border}`
            : 'none',
        transition: 'opacity 0.3s, box-shadow 0.3s'
      }}
    >
      <Handle type="source" position={Position.Top} style={{ width: 10, height: 10, background: 'var(--vscode-panel-border)', border: '2px solid var(--vscode-editorWidget-background)' }} />
      <Handle type="target" position={Position.Bottom} style={{ width: 10, height: 10, background: 'var(--vscode-panel-border)', border: '2px solid var(--vscode-editorWidget-background)' }} />

      {/* Header: status dot + ID + blocker badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontFamily: 'var(--vscode-editor-font-family)', color: 'var(--vscode-descriptionForeground)' }}>
            {data.id}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {data.blocksCount > 0 && (
            <span
              onClick={handleBadgeClick}
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: '3px',
                background: data.blocksCount >= 3 ? `var(--wq-status-blocked)` : `var(--wq-status-intake)`,
                color: 'var(--vscode-editor-background)',
                fontWeight: 700,
                lineHeight: '14px',
                cursor: 'pointer'
              }}
              title={`Click to see blocked tasks`}
            >
              {data.blocksCount >= 3 ? '\uD83D\uDD25' : '\u26A0'}{data.blocksCount}
            </span>
          )}
          <span
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: '3px',
              background: `color-mix(in srgb, ${trackColor.dot} 20%, transparent)`,
              color: trackColor.dot,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            {data.track}
          </span>
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 12,
        color: 'var(--vscode-editor-foreground)',
        fontWeight: 500,
        marginBottom: 4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: '16px'
      }}>
        {data.title}
      </div>

      {/* Footer: status + effort + deps */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>
        <span style={{
          padding: '1px 6px',
          borderRadius: '3px',
          background: `color-mix(in srgb, ${statusColor.dot} 15%, transparent)`,
          color: statusColor.dot,
          fontWeight: 500,
          textTransform: 'capitalize'
        }}>
          {data.status}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {data.dependsOnCount > 0 && <span>{'\u2191'}{data.dependsOnCount}</span>}
          {data.effort && <span>{data.effort}</span>}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { workItem: WorkItemNode };

function DependencyGraphInner({ items, settings, onItemClick }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [phaseColumns, setPhaseColumns] = useState<any[]>([]);
  const [highlightedPath, setHighlightedPath] = useState<Set<string> | null>(null);
  const [popover, setPopover] = useState<BlockerPopover | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build color maps from settings
  const trackColors = useMemo(() => buildTrackColors(settings), [settings]);
  const statusColors = useMemo(() => buildStatusColors(settings), [settings]);
  const phaseOrder = useMemo(() => settings.phases.map(p => p.id), [settings]);
  const phaseLabels = useMemo(() => Object.fromEntries(settings.phases.map(p => [p.id, p.label])), [settings]);

  // Close popover on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopover(null);
        setHighlightedPath(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Callback passed into each node's data for blocker badge clicks
  const handleBlockerClick = useCallback((sourceId: string, badgeRect: DOMRect) => {
    const source = items.find(i => i.id === sourceId);
    if (!source) return;

    const blocked = items.filter(i => i.dependsOn?.includes(sourceId));
    if (blocked.length === 0) return;

    // Get position relative to container
    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = badgeRect.right - (containerRect?.left || 0) + 8;
    const y = badgeRect.top - (containerRect?.top || 0);

    // Highlight the full dependency path from this node
    const path = getDependencyPath(sourceId, items);
    setHighlightedPath(path.size > 1 ? path : null);

    setPopover({
      sourceId,
      sourceTitle: source.title,
      blockedItems: blocked,
      x,
      y
    });
  }, [items]);

  // Recalculate layout when items or settings change
  useEffect(() => {
    try {
      const layout = calculateTimelineLayout(items, {}, phaseOrder);
      setNodes(layout.nodes);
      setEdges(layout.edges);
      setPhaseColumns(layout.phaseColumns);
    } catch (err) {
      console.error('Graph layout failed:', err);
    }
  }, [items, phaseOrder]);

  // Inject the color maps and blocker callback into every node's data
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, onBlockerClick: handleBlockerClick, _trackColors: trackColors, _statusColors: statusColors }
    })));
  }, [handleBlockerClick, trackColors, statusColors]);

  // Apply highlight/dim to nodes and edges when a node is selected
  useEffect(() => {
    if (!highlightedPath) {
      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, isHighlighted: false, isDimmed: false, onBlockerClick: handleBlockerClick, _trackColors: trackColors, _statusColors: statusColors }
      })));
      setEdges(eds => eds.map(e => ({
        ...e,
        style: { ...e.style, opacity: 1 },
        animated: items.find(i => i.id === e.source)?.status !== 'done'
      })));
      return;
    }

    setNodes(nds => nds.map(n => ({
      ...n,
      data: {
        ...n.data,
        isHighlighted: highlightedPath.has(n.id),
        isDimmed: !highlightedPath.has(n.id),
        onBlockerClick: handleBlockerClick,
        _trackColors: trackColors,
        _statusColors: statusColors
      }
    })));

    setEdges(eds => eds.map(e => {
      const inPath = highlightedPath.has(e.source) && highlightedPath.has(e.target);
      return {
        ...e,
        style: {
          ...e.style,
          opacity: inPath ? 1 : 0.1,
          stroke: inPath ? 'var(--vscode-textLink-foreground)' : e.style?.stroke,
          strokeWidth: inPath ? 3 : e.style?.strokeWidth
        },
        animated: inPath
      };
    }));
  }, [highlightedPath, items, handleBlockerClick, trackColors, statusColors]);

  const dimensions = useMemo(() => getGraphDimensions(phaseColumns, nodes), [phaseColumns, nodes]);

  const handleNodeClick = useCallback((_: any, node: any) => {
    const item = items.find(i => i.id === node.id);
    if (!item) return;

    // If popover is open, clicking a node navigates to it and closes popover
    if (popover) {
      setPopover(null);
      setHighlightedPath(null);
      onItemClick(item);
      return;
    }

    // Toggle path highlighting
    if (highlightedPath?.has(node.id) && highlightedPath.size > 1) {
      setHighlightedPath(null);
      onItemClick(item);
    } else {
      const path = getDependencyPath(node.id, items);
      setHighlightedPath(path.size > 1 ? path : null);
      onItemClick(item);
    }
  }, [items, onItemClick, highlightedPath, popover]);

  const handlePaneClick = useCallback(() => {
    setPopover(null);
    setHighlightedPath(null);
  }, []);

  // Navigate to a blocked item from the popover
  const handlePopoverItemClick = useCallback((item: WQItem) => {
    setPopover(null);
    setHighlightedPath(null);
    onItemClick(item);
  }, [onItemClick]);

  // Detect cycles
  const cycle = useMemo(() => {
    try { return findCycleInGraph(items); }
    catch { return null; }
  }, [items]);

  if (items.length === 0) {
    return <div className="empty-state">No items to display</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        style={{ background: 'var(--vscode-editor-background)' }}
      >
        <Background color="var(--vscode-panel-border)" gap={20} size={1} />
        <Controls
          showInteractive={false}
          style={{
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '6px'
          }}
        />
        <MiniMap
          style={{
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '6px'
          }}
          nodeColor={(node: any) => {
            const tc = (node.data && trackColors[node.data.track]) || FALLBACK_COLOR;
            return tc.dot;
          }}
        />

        {/* Legend */}
        <Panel position="top-right">
          <div style={{
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: 11,
            lineHeight: '20px'
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--vscode-editor-foreground)' }}>Tracks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 8 }}>
              {settings.tracks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: trackColors[t.id]?.dot }} />
                  <span style={{ color: 'var(--vscode-descriptionForeground)', textTransform: 'capitalize' }}>{t.label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--vscode-editor-foreground)' }}>Status</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 8 }}>
              {settings.statuses.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[s.id]?.dot }} />
                  <span style={{ color: 'var(--vscode-descriptionForeground)', textTransform: 'capitalize' }}>{s.label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--vscode-editor-foreground)' }}>Icons</div>
            <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
              <div>{'\uD83D\uDD25'}N = Critical blocker (3+)</div>
              <div>{'\u26A0'}N = Blocks N tasks</div>
              <div>{'\u2191'}N = Has N dependencies</div>
            </div>
          </div>
        </Panel>

        {/* Phase swimlanes */}
        {phaseColumns.length > 0 && (
          <Panel position="top-left" style={{ background: 'transparent', margin: 0, padding: 0 }}>
            <svg style={{ position: 'absolute', top: 0, left: 0, width: dimensions.width, height: dimensions.height, pointerEvents: 'none' }}>
              {phaseColumns.map(col => (
                <g key={col.phase}>
                  <rect
                    x={col.x - 20}
                    y={0}
                    width={col.width + 40}
                    height={dimensions.height}
                    fill="none"
                    stroke="var(--vscode-panel-border)"
                    strokeWidth={1}
                    strokeDasharray="8,4"
                    opacity={0.5}
                  />
                  <text
                    x={col.x + col.width / 2}
                    y={28}
                    textAnchor="middle"
                    fill={`var(--wq-phase-${col.phase}, var(--vscode-descriptionForeground))`}
                    fontSize={13}
                    fontWeight={600}
                    fontFamily="var(--vscode-font-family)"
                  >
                    {phaseLabels[col.phase] || col.phase}
                  </text>
                </g>
              ))}
            </svg>
          </Panel>
        )}

        {/* Cycle warning */}
        {cycle && (
          <Panel position="top-center">
            <div style={{
              background: 'var(--vscode-inputValidation-errorBackground)',
              border: '1px solid var(--vscode-inputValidation-errorBorder)',
              color: 'var(--vscode-errorForeground)',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: 12,
              fontWeight: 500
            }}>
              Dependency cycle: {cycle.join(' \u2192 ')}
            </div>
          </Panel>
        )}

        {/* Stats */}
        <Panel position="bottom-right">
          <div style={{
            background: 'var(--vscode-editorWidget-background)',
            border: '1px solid var(--vscode-panel-border)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: 11,
            color: 'var(--vscode-descriptionForeground)'
          }}>
            {items.length} items {'\u2022'} {edges.length} dependencies
            {highlightedPath && ` \u2022 ${highlightedPath.size} in path`}
          </div>
        </Panel>
      </ReactFlow>

      {/* Blocker popover — shown when clicking a fire/warning badge */}
      {popover && (
        <>
          {/* Backdrop to catch clicks outside */}
          <div
            onClick={() => { setPopover(null); setHighlightedPath(null); }}
            style={{
              position: 'absolute', inset: 0, zIndex: 10
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: popover.x,
              top: popover.y,
              zIndex: 11,
              background: 'var(--vscode-editorWidget-background)',
              border: '1px solid var(--vscode-focusBorder)',
              borderRadius: '6px',
              padding: '10px 0',
              minWidth: 220,
              maxWidth: 320,
              maxHeight: 300,
              overflowY: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '0 12px 8px',
              borderBottom: '1px solid var(--vscode-panel-border)',
              marginBottom: 4
            }}>
              <div style={{
                fontSize: 11,
                color: 'var(--vscode-descriptionForeground)',
                marginBottom: 2
              }}>
                {popover.sourceId}
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--vscode-editor-foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {popover.sourceTitle}
              </div>
              <div style={{
                fontSize: 11,
                color: popover.blockedItems.length >= 3 ? 'var(--wq-status-blocked)' : 'var(--wq-status-intake)',
                fontWeight: 600,
                marginTop: 4
              }}>
                {popover.blockedItems.length >= 3 ? '\uD83D\uDD25' : '\u26A0'} Blocks {popover.blockedItems.length} task{popover.blockedItems.length !== 1 ? 's' : ''}:
              </div>
            </div>

            {/* Blocked items list */}
            {popover.blockedItems.map(item => {
              const tc = trackColors[item.track] || FALLBACK_COLOR;
              const sc = statusColors[item.status] || FALLBACK_COLOR;
              return (
                <div
                  key={item.id}
                  onClick={() => handlePopoverItemClick(item)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--vscode-textLink-foreground)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.id} — {item.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', display: 'flex', gap: 8, marginTop: 1 }}>
                      <span style={{ textTransform: 'capitalize' }}>{item.status}</span>
                      <span style={{ color: tc.dot, textTransform: 'capitalize' }}>{item.track}</span>
                      <span>{item.phase}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>{'\u2192'}</span>
                </div>
              );
            })}

            {/* Footer hint */}
            <div style={{
              padding: '6px 12px 2px',
              borderTop: '1px solid var(--vscode-panel-border)',
              marginTop: 4,
              fontSize: 10,
              color: 'var(--vscode-descriptionForeground)',
              fontStyle: 'italic'
            }}>
              Click to navigate {'\u2022'} Esc to close
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DependencyGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner {...props} />
    </ReactFlowProvider>
  );
}
