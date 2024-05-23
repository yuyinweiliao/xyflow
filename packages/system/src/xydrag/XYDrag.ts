import { drag } from 'd3-drag';
import { select, type Selection } from 'd3-selection';

import {
  calcAutoPan,
  getEventPosition,
  getPointerPosition,
  calculateNodePosition,
  snapPosition,
  getInternalNodesBounds,
  rectToBox,
} from '../utils';
import { getDragItems, getEventHandlerParams, hasSelector } from './utils';
import type {
  NodeBase,
  NodeDragItem,
  UseDragEvent,
  XYPosition,
  EdgeBase,
  CoordinateExtent,
  NodeOrigin,
  OnError,
  SnapGrid,
  Transform,
  PanBy,
  OnSelectionDrag,
  UpdateNodePositions,
  Box,
  InternalNodeBase,
} from '../types';

export type OnDrag = (
  event: MouseEvent,
  dragItems: Map<string, NodeDragItem>,
  node: NodeBase,
  nodes: NodeBase[]
) => void;

type StoreItems<OnNodeDrag> = {
  nodes: NodeBase[];
  nodeLookup: Map<string, InternalNodeBase>;
  edges: EdgeBase[];
  nodeExtent: CoordinateExtent;
  snapGrid: SnapGrid;
  snapToGrid: boolean;
  nodeOrigin: NodeOrigin;
  multiSelectionActive: boolean;
  domNode?: Element | null;
  transform: Transform;
  autoPanOnNodeDrag: boolean;
  nodesDraggable: boolean;
  selectNodesOnDrag: boolean;
  nodeDragThreshold: number;
  panBy: PanBy;
  unselectNodesAndEdges: (params?: { nodes?: NodeBase[]; edges?: EdgeBase[] }) => void;
  onError?: OnError;
  onNodeDragStart?: OnNodeDrag;
  onNodeDrag?: OnNodeDrag;
  onNodeDragStop?: OnNodeDrag;
  onSelectionDragStart?: OnSelectionDrag;
  onSelectionDrag?: OnSelectionDrag;
  onSelectionDragStop?: OnSelectionDrag;
  updateNodePositions: UpdateNodePositions;
};

export type XYDragParams<OnNodeDrag> = {
  getStoreItems: () => StoreItems<OnNodeDrag>;
  isNodeSelected: (node: InternalNodeBase) => boolean | undefined;
  onDragStart?: OnDrag;
  onDrag?: OnDrag;
  onDragStop?: OnDrag;
  onNodeMouseDown?: (id: string) => void;
};

export type XYDragInstance = {
  update: (params: DragUpdateParams) => void;
  destroy: () => void;
};

export type DragUpdateParams = {
  noDragClassName?: string;
  handleSelector?: string;
  isSelectable?: boolean;
  nodeId?: string;
  domNode: Element;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function XYDrag<OnNodeDrag extends (e: any, nodes: any, node: any) => void | undefined>({
  onNodeMouseDown,
  getStoreItems,
  onDragStart,
  onDrag,
  onDragStop,
  isNodeSelected,
}: XYDragParams<OnNodeDrag>): XYDragInstance {
  let lastPos: { x: number | null; y: number | null } = { x: null, y: null };
  let autoPanId = 0;
  let dragItems = new Map<string, NodeDragItem>();
  let autoPanStarted = false;
  let mousePosition: XYPosition = { x: 0, y: 0 };
  let containerBounds: DOMRect | null = null;
  let dragStarted = false;
  let d3Selection: Selection<Element, unknown, null, undefined> | null = null;

  // public functions
  function update({ noDragClassName, handleSelector, domNode, isSelectable, nodeId }: DragUpdateParams) {
    d3Selection = select(domNode);
    function updateNodes({ x, y }: XYPosition, dragEvent: MouseEvent | null) {
      const {
        nodeLookup,
        nodeExtent,
        snapGrid,
        snapToGrid,
        nodeOrigin,
        onNodeDrag,
        onSelectionDrag,
        onError,
        updateNodePositions,
      } = getStoreItems();

      lastPos = { x, y };

      let hasChange = false;
      let nodesBox: Box = { x: 0, y: 0, x2: 0, y2: 0 };

      if (dragItems.size > 1 && nodeExtent) {
        const rect = getInternalNodesBounds(dragItems, { nodeOrigin });
        nodesBox = rectToBox(rect);
      }

      for (const [id, dragItem] of dragItems) {
        let nextPosition = { x: x - dragItem.distance.x, y: y - dragItem.distance.y };

        if (snapToGrid) {
          nextPosition = snapPosition(nextPosition, snapGrid);
        }

        // if there is selection with multiple nodes and a node extent is set, we need to adjust the node extent for each node
        // based on its position so that the node stays at it's position relative to the selection.
        let adjustedNodeExtent: CoordinateExtent = [
          [nodeExtent[0][0], nodeExtent[0][1]],
          [nodeExtent[1][0], nodeExtent[1][1]],
        ];

        if (dragItems.size > 1 && nodeExtent && !dragItem.extent) {
          const { positionAbsolute } = dragItem.internals;
          const x1 = positionAbsolute.x - nodesBox.x + nodeExtent[0][0];
          const x2 = positionAbsolute.x + dragItem.measured.width - nodesBox.x2 + nodeExtent[1][0];

          const y1 = positionAbsolute.y - nodesBox.y + nodeExtent[0][1];
          const y2 = positionAbsolute.y + dragItem.measured.height - nodesBox.y2 + nodeExtent[1][1];

          adjustedNodeExtent = [
            [x1, y1],
            [x2, y2],
          ];
        }

        const { position, positionAbsolute } = calculateNodePosition({
          nodeId: id,
          nextPosition,
          nodeLookup,
          nodeExtent: adjustedNodeExtent,
          nodeOrigin,
          onError,
        });

        // we want to make sure that we only fire a change event when there is a change
        hasChange = hasChange || dragItem.position.x !== position.x || dragItem.position.y !== position.y;

        dragItem.position = position;
        dragItem.internals.positionAbsolute = positionAbsolute;
      }

      if (!hasChange) {
        return;
      }

      updateNodePositions(dragItems, true);

      if (dragEvent && (onDrag || onNodeDrag || (!nodeId && onSelectionDrag))) {
        const [currentNode, currentNodes] = getEventHandlerParams({
          nodeId,
          dragItems,
          nodeLookup,
        });

        onDrag?.(dragEvent, dragItems, currentNode, currentNodes);
        onNodeDrag?.(dragEvent, currentNode, currentNodes);

        if (!nodeId) {
          onSelectionDrag?.(dragEvent, currentNodes);
        }
      }
    }

    function autoPan() {
      if (!containerBounds) {
        return;
      }

      const [xMovement, yMovement] = calcAutoPan(mousePosition, containerBounds);

      if (xMovement !== 0 || yMovement !== 0) {
        const { transform, panBy } = getStoreItems();

        lastPos.x = (lastPos.x ?? 0) - xMovement / transform[2];
        lastPos.y = (lastPos.y ?? 0) - yMovement / transform[2];

        if (panBy({ x: xMovement, y: yMovement })) {
          updateNodes(lastPos as XYPosition, null);
        }
      }
      autoPanId = requestAnimationFrame(autoPan);
    }

    function startDrag(event: UseDragEvent) {
      const {
        nodeLookup,
        multiSelectionActive,
        nodesDraggable,
        transform,
        snapGrid,
        snapToGrid,
        selectNodesOnDrag,
        onNodeDragStart,
        onSelectionDragStart,
        unselectNodesAndEdges,
      } = getStoreItems();

      dragStarted = true;

      if ((!selectNodesOnDrag || !isSelectable) && !multiSelectionActive && nodeId) {
        if (!nodeLookup.get(nodeId)?.selected) {
          // we need to reset selected nodes when selectNodesOnDrag=false
          unselectNodesAndEdges();
        }
      }

      if (isSelectable && selectNodesOnDrag && nodeId) {
        onNodeMouseDown?.(nodeId);
      }

      const pointerPos = getPointerPosition(event.sourceEvent, { transform, snapGrid, snapToGrid });
      lastPos = pointerPos;
      dragItems = getDragItems(nodeLookup, nodesDraggable, pointerPos, isNodeSelected, nodeId);

      if (dragItems.size > 0 && (onDragStart || onNodeDragStart || (!nodeId && onSelectionDragStart))) {
        const [currentNode, currentNodes] = getEventHandlerParams({
          nodeId,
          dragItems,
          nodeLookup,
        });

        onDragStart?.(event.sourceEvent as MouseEvent, dragItems, currentNode, currentNodes);
        onNodeDragStart?.(event.sourceEvent as MouseEvent, currentNode, currentNodes);

        if (!nodeId) {
          onSelectionDragStart?.(event.sourceEvent as MouseEvent, currentNodes);
        }
      }
    }

    const d3DragInstance = drag()
      .on('start', (event: UseDragEvent) => {
        const { domNode, nodeDragThreshold, transform, snapGrid, snapToGrid } = getStoreItems();

        if (nodeDragThreshold === 0) {
          startDrag(event);
        }

        const pointerPos = getPointerPosition(event.sourceEvent, { transform, snapGrid, snapToGrid });
        lastPos = pointerPos;
        containerBounds = domNode?.getBoundingClientRect() || null;
        mousePosition = getEventPosition(event.sourceEvent, containerBounds!);
      })
      .on('drag', (event: UseDragEvent) => {
        const { autoPanOnNodeDrag, transform, snapGrid, snapToGrid, nodeDragThreshold } = getStoreItems();
        const pointerPos = getPointerPosition(event.sourceEvent, { transform, snapGrid, snapToGrid });

        if (!autoPanStarted && autoPanOnNodeDrag && dragStarted) {
          autoPanStarted = true;
          autoPan();
        }

        if (!dragStarted) {
          const x = pointerPos.xSnapped - (lastPos.x ?? 0);
          const y = pointerPos.ySnapped - (lastPos.y ?? 0);
          const distance = Math.sqrt(x * x + y * y);

          if (distance > nodeDragThreshold) {
            startDrag(event);
          }
        }

        // skip events without movement
        if ((lastPos.x !== pointerPos.xSnapped || lastPos.y !== pointerPos.ySnapped) && dragItems && dragStarted) {
          // dragEvent = event.sourceEvent as MouseEvent;
          mousePosition = getEventPosition(event.sourceEvent, containerBounds!);

          updateNodes(pointerPos, event.sourceEvent as MouseEvent);
        }
      })
      .on('end', (event: UseDragEvent) => {
        if (!dragStarted) {
          return;
        }

        autoPanStarted = false;
        dragStarted = false;
        cancelAnimationFrame(autoPanId);

        if (dragItems.size > 0) {
          const { nodeLookup, updateNodePositions, onNodeDragStop, onSelectionDragStop } = getStoreItems();

          updateNodePositions(dragItems, false);

          if (onDragStop || onNodeDragStop || (!nodeId && onSelectionDragStop)) {
            const [currentNode, currentNodes] = getEventHandlerParams({
              nodeId,
              dragItems,
              nodeLookup,
            });

            onDragStop?.(event.sourceEvent as MouseEvent, dragItems, currentNode, currentNodes);
            onNodeDragStop?.(event.sourceEvent as MouseEvent, currentNode, currentNodes);

            if (!nodeId) {
              onSelectionDragStop?.(event.sourceEvent as MouseEvent, currentNodes);
            }
          }
        }
      })
      .filter((event: MouseEvent) => {
        const target = event.target as HTMLDivElement;
        const isDraggable =
          !event.button &&
          (!noDragClassName || !hasSelector(target, `.${noDragClassName}`, domNode)) &&
          (!handleSelector || hasSelector(target, handleSelector, domNode));

        return isDraggable;
      });

    d3Selection.call(d3DragInstance);
  }

  function destroy() {
    d3Selection?.on('.drag', null);
  }

  return {
    update,
    destroy,
  };
}
