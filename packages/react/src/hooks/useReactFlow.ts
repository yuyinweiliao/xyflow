import { useMemo } from 'react';
import {
  boxToRect,
  EdgeRemoveChange,
  evaluateAbsolutePosition,
  getBoundsOfBoxes,
  getElementsToRemove,
  getOverlappingArea,
  isInternalNodeBase,
  isRectObject,
  NodeRemoveChange,
  nodeToBox,
  nodeToRect,
  type Rect,
} from '@xyflow/system';

import useViewportHelper from './useViewportHelper';
import { useStore, useStoreApi } from './useStore';
import { useBatchContext } from '../components/BatchProvider';
import { elementToRemoveChange, isEdge, isNode } from '../utils';
import type { ReactFlowInstance, Node, Edge, InternalNode, ReactFlowState, GeneralHelpers } from '../types';

const selector = (s: ReactFlowState) => !!s.panZoom;

/**
 * Hook for accessing the ReactFlow instance.
 *
 * @public
 * @returns ReactFlowInstance
 */
export function useReactFlow<NodeType extends Node = Node, EdgeType extends Edge = Edge>(): ReactFlowInstance<
  NodeType,
  EdgeType
> {
  const viewportHelper = useViewportHelper();
  const store = useStoreApi();
  const batchContext = useBatchContext();
  const viewportInitialized = useStore(selector);

  const generalHelper = useMemo<GeneralHelpers<NodeType, EdgeType>>(() => {
    const getInternalNode: GeneralHelpers<NodeType, EdgeType>['getInternalNode'] = (id) =>
      store.getState().nodeLookup.get(id) as InternalNode<NodeType>;

    const setNodes: GeneralHelpers<NodeType, EdgeType>['setNodes'] = (payload) => {
      batchContext.nodeQueue.push(payload as NodeType[]);
    };

    const setEdges: GeneralHelpers<NodeType, EdgeType>['setEdges'] = (payload) => {
      batchContext.edgeQueue.push(payload as EdgeType[]);
    };

    const getNodeRect = (node: NodeType | { id: string }): Rect | null => {
      const { nodeLookup, nodeOrigin } = store.getState();

      const nodeToUse = isNode<NodeType>(node) ? node : nodeLookup.get(node.id)!;
      const position = nodeToUse.parentId
        ? evaluateAbsolutePosition(nodeToUse.position, nodeToUse.measured, nodeToUse.parentId, nodeLookup, nodeOrigin)
        : nodeToUse.position;

      const nodeWithPosition = {
        id: nodeToUse.id,
        position,
        width: nodeToUse.measured?.width ?? nodeToUse.width,
        height: nodeToUse.measured?.height ?? nodeToUse.height,
        data: nodeToUse.data,
      };

      return nodeToRect(nodeWithPosition);
    };

    const updateNode: GeneralHelpers<NodeType, EdgeType>['updateNode'] = (
      id,
      nodeUpdate,
      options = { replace: false }
    ) => {
      setNodes((prevNodes) =>
        prevNodes.map((node) => {
          if (node.id === id) {
            const nextNode = typeof nodeUpdate === 'function' ? nodeUpdate(node as NodeType) : nodeUpdate;
            return options.replace && isNode(nextNode) ? (nextNode as NodeType) : { ...node, ...nextNode };
          }

          return node;
        })
      );
    };

    const updateEdge: GeneralHelpers<NodeType, EdgeType>['updateEdge'] = (
      id,
      edgeUpdate,
      options = { replace: false }
    ) => {
      setEdges((prevEdges) =>
        prevEdges.map((edge) => {
          if (edge.id === id) {
            const nextEdge = typeof edgeUpdate === 'function' ? edgeUpdate(edge as EdgeType) : edgeUpdate;
            return options.replace && isEdge(nextEdge) ? (nextEdge as EdgeType) : { ...edge, ...nextEdge };
          }

          return edge;
        })
      );
    };

    return {
      getNodes: () => store.getState().nodes.map((n) => ({ ...n })) as NodeType[],
      getNode: (id) => getInternalNode(id)?.internals.userNode as NodeType,
      getInternalNode,
      getEdges: () => {
        const { edges = [] } = store.getState();
        return edges.map((e) => ({ ...e })) as EdgeType[];
      },
      getEdge: (id) => store.getState().edgeLookup.get(id) as EdgeType,
      setNodes,
      setEdges,
      addNodes: (payload) => {
        const newNodes = Array.isArray(payload) ? payload : [payload];
        batchContext.nodeQueue.push((nodes) => [...nodes, ...newNodes]);
      },
      addEdges: (payload) => {
        const newEdges = Array.isArray(payload) ? payload : [payload];
        batchContext.edgeQueue.push((edges) => [...edges, ...newEdges]);
      },
      toObject: () => {
        const { nodes = [], edges = [], transform } = store.getState();
        const [x, y, zoom] = transform;
        return {
          nodes: nodes.map((n) => ({ ...n })) as NodeType[],
          edges: edges.map((e) => ({ ...e })) as EdgeType[],
          viewport: {
            x,
            y,
            zoom,
          },
        };
      },
      deleteElements: async ({ nodes: nodesToRemove = [], edges: edgesToRemove = [] }) => {
        const {
          nodes,
          edges,
          onNodesDelete,
          onEdgesDelete,
          triggerNodeChanges,
          triggerEdgeChanges,
          onDelete,
          onBeforeDelete,
        } = store.getState();
        const { nodes: matchingNodes, edges: matchingEdges } = await getElementsToRemove({
          nodesToRemove,
          edgesToRemove,
          nodes,
          edges,
          onBeforeDelete,
        });

        const hasMatchingEdges = matchingEdges.length > 0;
        const hasMatchingNodes = matchingNodes.length > 0;

        if (hasMatchingEdges) {
          const edgeChanges: EdgeRemoveChange[] = matchingEdges.map(elementToRemoveChange);

          onEdgesDelete?.(matchingEdges);
          triggerEdgeChanges(edgeChanges);
        }

        if (hasMatchingNodes) {
          const nodeChanges: NodeRemoveChange[] = matchingNodes.map(elementToRemoveChange);

          onNodesDelete?.(matchingNodes);
          triggerNodeChanges(nodeChanges);
        }

        if (hasMatchingNodes || hasMatchingEdges) {
          onDelete?.({ nodes: matchingNodes, edges: matchingEdges });
        }

        return { deletedNodes: matchingNodes, deletedEdges: matchingEdges };
      },
      getIntersectingNodes: (nodeOrRect, partially = true, nodes) => {
        const isRect = isRectObject(nodeOrRect);
        const nodeRect = isRect ? nodeOrRect : getNodeRect(nodeOrRect);
        const hasNodesOption = nodes !== undefined;

        if (!nodeRect) {
          return [];
        }

        return (nodes || store.getState().nodes).filter((n) => {
          const internalNode = store.getState().nodeLookup.get(n.id);

          if (internalNode && !isRect && (n.id === nodeOrRect!.id || !internalNode.internals.positionAbsolute)) {
            return false;
          }

          const currNodeRect = nodeToRect(hasNodesOption ? n : internalNode!);
          const overlappingArea = getOverlappingArea(currNodeRect, nodeRect);
          const partiallyVisible = partially && overlappingArea > 0;

          return partiallyVisible || overlappingArea >= nodeRect.width * nodeRect.height;
        }) as NodeType[];
      },
      isNodeIntersecting: (nodeOrRect, area, partially = true) => {
        const isRect = isRectObject(nodeOrRect);
        const nodeRect = isRect ? nodeOrRect : getNodeRect(nodeOrRect);

        if (!nodeRect) {
          return false;
        }

        const overlappingArea = getOverlappingArea(nodeRect, area);
        const partiallyVisible = partially && overlappingArea > 0;

        return partiallyVisible || overlappingArea >= nodeRect.width * nodeRect.height;
      },
      updateNode,
      updateNodeData: (id, dataUpdate, options = { replace: false }) => {
        updateNode(
          id,
          (node) => {
            const nextData = typeof dataUpdate === 'function' ? dataUpdate(node) : dataUpdate;
            return options.replace ? { ...node, data: nextData } : { ...node, data: { ...node.data, ...nextData } };
          },
          options
        );
      },
      updateEdge,
      updateEdgeData: (id, dataUpdate, options = { replace: false }) => {
        updateEdge(
          id,
          (edge) => {
            const nextData = typeof dataUpdate === 'function' ? dataUpdate(edge) : dataUpdate;
            return options.replace ? { ...edge, data: nextData } : { ...edge, data: { ...edge.data, ...nextData } };
          },
          options
        );
      },
      getNodesBounds: (nodes: (NodeType | InternalNode | string)[]): Rect => {
        if (nodes.length === 0) {
          return { x: 0, y: 0, width: 0, height: 0 };
        }

        const { nodeLookup, nodeOrigin } = store.getState();

        const box = nodes.reduce(
          (currBox, node) => {
            const internalNode =
              typeof node === 'string'
                ? nodeLookup.get(node)
                : !isInternalNodeBase(node)
                ? nodeLookup.get(node.id)
                : node;

            const nodeBox = internalNode ? nodeToBox(internalNode, nodeOrigin) : { x: 0, y: 0, x2: 0, y2: 0 };
            return getBoundsOfBoxes(currBox, nodeBox);
          },
          { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity }
        );

        return boxToRect(box);
      },
      getHandleConnections: ({ type, id, nodeId }) =>
        Array.from(
          store
            .getState()
            .connectionLookup.get(`${nodeId}-${type}-${id ?? null}`)
            ?.values() ?? []
        ),
    };
  }, []);

  return useMemo(() => {
    return {
      ...generalHelper,
      ...viewportHelper,
      viewportInitialized,
    };
  }, [viewportInitialized]);
}
