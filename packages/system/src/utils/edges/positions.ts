import { EdgePosition } from '../../types/edges';
import { ConnectionMode, OnError } from '../../types/general';
import { InternalNodeBase, NodeHandle } from '../../types/nodes';
import { Position } from '../../types/utils';
import { errorMessages } from '../../constants';
import { HandleElement } from '../../types';
import { getNodeDimensions } from '../general';

export type GetEdgePositionParams = {
  id: string;
  sourceNode: InternalNodeBase;
  sourceHandle: string | null;
  targetNode: InternalNodeBase;
  targetHandle: string | null;
  connectionMode: ConnectionMode;
  onError?: OnError;
};

function isNodeInitialized(node: InternalNodeBase): boolean {
  return (
    node &&
    !!(node.internals.handleBounds || node.handles?.length) &&
    !!(node.measured.width || node.width || node.initialWidth)
  );
}

export function getEdgePosition(params: GetEdgePositionParams): EdgePosition | null {
  const { sourceNode, targetNode } = params;

  if (!isNodeInitialized(sourceNode) || !isNodeInitialized(targetNode)) {
    return null;
  }

  const sourceHandleBounds = sourceNode.internals.handleBounds ?? toHandleBounds(sourceNode.handles);
  const targetHandleBounds = targetNode.internals.handleBounds ?? toHandleBounds(targetNode.handles);

  const sourceHandle = getHandle(sourceHandleBounds?.source ?? [], params.sourceHandle);
  const targetHandle = getHandle(
    // when connection type is loose we can define all handles as sources and connect source -> source
    params.connectionMode === ConnectionMode.Strict
      ? targetHandleBounds?.target ?? []
      : (targetHandleBounds?.target ?? []).concat(targetHandleBounds?.source ?? []),
    params.targetHandle
  );
  const sourcePosition = sourceHandle?.position || Position.Bottom;
  const targetPosition = targetHandle?.position || Position.Top;

  if (!sourceHandle || !targetHandle) {
    params.onError?.(
      '008',
      errorMessages['error008'](!sourceHandle ? 'source' : 'target', {
        id: params.id,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      })
    );

    return null;
  }

  const [sourceX, sourceY] = getHandlePosition(sourcePosition, sourceNode, sourceHandle);
  const [targetX, targetY] = getHandlePosition(targetPosition, targetNode, targetHandle);

  return {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };
}

function toHandleBounds(handles?: NodeHandle[]) {
  if (!handles) {
    return null;
  }

  const source = [];
  const target = [];

  for (const handle of handles) {
    // TODO: not allowed to mutate handle.widht, handle.height
    // maybe fixed in getHandlePosition
    // handle.width = handle.width ?? 1;
    // handle.height = handle.height ?? 1;

    if (handle.type === 'source') {
      source.push(handle as HandleElement);
    } else if (handle.type === 'target') {
      target.push(handle as HandleElement);
    }
  }

  return {
    source,
    target,
  };
}

function getHandlePosition(position: Position, node: InternalNodeBase, handle: HandleElement | null = null): number[] {
  const x = (handle?.x ?? 0) + node.internals.positionAbsolute.x;
  const y = (handle?.y ?? 0) + node.internals.positionAbsolute.y;
  const { width = 1, height = 1 } = handle ?? getNodeDimensions(node);

  switch (position) {
    case Position.Top:
      return [x + width / 2, y];
    case Position.Right:
      return [x + width, y + height / 2];
    case Position.Bottom:
      return [x + width / 2, y + height];
    case Position.Left:
      return [x, y + height / 2];
  }
}

function getHandle(bounds: HandleElement[], handleId?: string | null): HandleElement | null {
  if (!bounds) {
    return null;
  }

  // if no handleId is given, we use the first handle, otherwise we check for the id
  return (!handleId ? bounds[0] : bounds.find((d) => d.id === handleId)) || null;
}
