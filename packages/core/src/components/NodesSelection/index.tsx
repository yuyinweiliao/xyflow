/**
 * The nodes selection rectangle gets displayed when a user
 * made a selection with on or several nodes
 */

import React, { memo, useRef, MouseEvent, KeyboardEvent, useEffect } from 'react';
import cc from 'classcat';
import shallow from 'zustand/shallow';

import { useStore, useStoreApi } from '../../store';
import { Node, ReactFlowState } from '../../types';
import { getRectOfNodes } from '../../utils/graph';
import useDrag from '../../hooks/useDrag';
import { arrowKeyDiffs } from '../Nodes/wrapNode';
import useUpdateNode from '../../hooks/useUpdateNode';

export interface NodesSelectionProps {
  onSelectionContextMenu?: (event: MouseEvent, nodes: Node[]) => void;
  noPanClassName?: string;
}

const selector = (s: ReactFlowState) => ({
  transformString: `translate(${s.transform[0]}px,${s.transform[1]}px) scale(${s.transform[2]})`,
  userSelectionActive: s.userSelectionActive,
  ...getRectOfNodes(Array.from(s.nodeInternals.values()).filter((n) => n.selected)),
});

const bboxSelector = (s: ReactFlowState) => {
  const selectedNodes = Array.from(s.nodeInternals.values()).filter((n) => n.selected);
  return getRectOfNodes(selectedNodes);
};

function NodesSelection({ onSelectionContextMenu, noPanClassName }: NodesSelectionProps) {
  const store = useStoreApi();
  const { transformString, userSelectionActive } = useStore(selector, shallow);
  const { width, height, x: left, y: top } = useStore(bboxSelector, shallow);
  const { updatePositions } = useUpdateNode();

  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nodeRef.current?.focus();
  }, []);

  useDrag({
    nodeRef,
  });

  if (userSelectionActive || !width || !height) {
    return null;
  }

  const onContextMenu = onSelectionContextMenu
    ? (event: MouseEvent) => {
        const selectedNodes = Array.from(store.getState().nodeInternals.values()).filter((n) => n.selected);
        onSelectionContextMenu(event, selectedNodes);
      }
    : undefined;

  const onKeyDown = (event: KeyboardEvent) => {
    if (arrowKeyDiffs.hasOwnProperty(event.key)) {
      updatePositions(arrowKeyDiffs[event.key]);
    }
  };

  return (
    <div
      className={cc(['react-flow__nodesselection', 'react-flow__container', noPanClassName])}
      style={{
        transform: transformString,
      }}
    >
      <div
        ref={nodeRef}
        className="react-flow__nodesselection-rect"
        onContextMenu={onContextMenu}
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{
          width,
          height,
          top,
          left,
        }}
      />
    </div>
  );
}

export default memo(NodesSelection);
