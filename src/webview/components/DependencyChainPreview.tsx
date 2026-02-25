// Upstream/downstream dependency tree visualization.
// Ported from work-queue-viewer/client/src/components/DependencyChainPreview.jsx

import type { WQItem } from '../../models/WQItem';
import {
  getUpstreamChain,
  getDownstreamChain,
  checkDependenciesSatisfied,
  type DepTreeNode,
} from '../utils/dependencyUtils';

interface Props {
  item: WQItem;
  allItems: WQItem[];
  onItemClick: (item: WQItem | DepTreeNode) => void;
}

function TreeNode({ node, depth, onItemClick }: { node: DepTreeNode; depth: number; onItemClick: Props['onItemClick'] }) {
  return (
    <div>
      <div
        className="dep-node"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        onClick={() => onItemClick(node)}
      >
        {depth > 0 && <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{'\u203A'}</span>}
        <span className="dep-node-id">{node.id}</span>
        <span className="dep-node-title">{node.title}</span>
        <span className={`status-badge status-${node.status}`}>{node.status}</span>
      </div>
      {node.children?.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} onItemClick={onItemClick} />
      ))}
    </div>
  );
}

export default function DependencyChainPreview({ item, allItems, onItemClick }: Props) {
  if (!item?.id) { return null; }

  const upstream = getUpstreamChain(item.id, allItems);
  const downstream = getDownstreamChain(item.id, allItems);
  const depStatus = checkDependenciesSatisfied(item, allItems);

  if (upstream.length === 0 && downstream.length === 0) {
    return (
      <div className="dep-chain">
        <div className="empty-state" style={{ padding: '24px 0' }}>
          No dependencies — this item is independent
        </div>
      </div>
    );
  }

  return (
    <div className="dep-chain">
      <div className="section-title">Dependency Chain</div>

      {/* Satisfaction summary */}
      {item.dependsOn && item.dependsOn.length > 0 && (
        <div className={`dep-status-summary ${depStatus.satisfied ? 'satisfied' : 'pending'}`}>
          {depStatus.satisfied
            ? `All ${depStatus.total} dependencies satisfied`
            : `${depStatus.pending} of ${depStatus.total} dependencies pending`}
        </div>
      )}

      {/* Upstream */}
      {upstream.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="dep-section-label">{'\u2191'} Upstream (must complete first)</div>
          <div className="dep-tree">
            {upstream.map(node => (
              <TreeNode key={node.id} node={node} depth={0} onItemClick={onItemClick} />
            ))}
          </div>
        </div>
      )}

      {/* Downstream */}
      {downstream.length > 0 && (
        <div>
          <div className="dep-section-label">{'\u2193'} Downstream (blocked by this)</div>
          <div className="dep-tree">
            {downstream.map(node => (
              <TreeNode key={node.id} node={node} depth={0} onItemClick={onItemClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
