import type {
  Dimensions,
  XYPosition,
  CoordinateExtent,
  Box,
  Rect,
  NodeBase,
  NodeOrigin,
  SnapGrid,
  Transform,
  InternalNodeBase,
  NodeLookup,
} from '../types';
import { type Viewport } from '../types';
import { getNodePositionWithOrigin, isInternalNodeBase } from './graph';

export const clamp = (val: number, min = 0, max = 1): number => Math.min(Math.max(val, min), max);

export const clampPosition = (
  position: XYPosition = { x: 0, y: 0 },
  extent: CoordinateExtent,
  dimensions: Partial<Dimensions>
) => ({
  x: clamp(position.x, extent[0][0], extent[1][0] - (dimensions?.width ?? 0)),
  y: clamp(position.y, extent[0][1], extent[1][1] - (dimensions?.height ?? 0)),
});

/**
 * Calculates the velocity of panning when the mouse is close to the edge of the canvas
 * @internal
 * @param value - One dimensional poition of the mouse (x or y)
 * @param min - Minimal position on canvas before panning starts
 * @param max - Maximal position on canvas before panning starts
 * @returns - A number between 0 and 1 that represents the velocity of panning
 */
const calcAutoPanVelocity = (value: number, min: number, max: number): number => {
  if (value < min) {
    return clamp(Math.abs(value - min), 1, min) / min;
  } else if (value > max) {
    return -clamp(Math.abs(value - max), 1, min) / min;
  }

  return 0;
};

export const calcAutoPan = (
  pos: XYPosition,
  bounds: Dimensions,
  speed: number = 15,
  distance: number = 40
): number[] => {
  const xMovement = calcAutoPanVelocity(pos.x, distance, bounds.width - distance) * speed;
  const yMovement = calcAutoPanVelocity(pos.y, distance, bounds.height - distance) * speed;

  return [xMovement, yMovement];
};

export const getBoundsOfBoxes = (box1: Box, box2: Box): Box => ({
  x: Math.min(box1.x, box2.x),
  y: Math.min(box1.y, box2.y),
  x2: Math.max(box1.x2, box2.x2),
  y2: Math.max(box1.y2, box2.y2),
});

export const rectToBox = ({ x, y, width, height }: Rect): Box => ({
  x,
  y,
  x2: x + width,
  y2: y + height,
});

export const boxToRect = ({ x, y, x2, y2 }: Box): Rect => ({
  x,
  y,
  width: x2 - x,
  height: y2 - y,
});

export const nodeToRect = (node: InternalNodeBase | NodeBase, nodeOrigin: NodeOrigin = [0, 0]): Rect => {
  const { x, y } = isInternalNodeBase(node)
    ? node.internals.positionAbsolute
    : getNodePositionWithOrigin(node, nodeOrigin);

  return {
    x,
    y,
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0,
  };
};

export const nodeToBox = (node: InternalNodeBase | NodeBase, nodeOrigin: NodeOrigin = [0, 0]): Box => {
  const { x, y } = isInternalNodeBase(node)
    ? node.internals.positionAbsolute
    : getNodePositionWithOrigin(node, nodeOrigin);

  return {
    x,
    y,
    x2: x + (node.measured?.width ?? node.width ?? node.initialWidth ?? 0),
    y2: y + (node.measured?.height ?? node.height ?? node.initialHeight ?? 0),
  };
};

export const getBoundsOfRects = (rect1: Rect, rect2: Rect): Rect =>
  boxToRect(getBoundsOfBoxes(rectToBox(rect1), rectToBox(rect2)));

export const getOverlappingArea = (rectA: Rect, rectB: Rect): number => {
  const xOverlap = Math.max(0, Math.min(rectA.x + rectA.width, rectB.x + rectB.width) - Math.max(rectA.x, rectB.x));
  const yOverlap = Math.max(0, Math.min(rectA.y + rectA.height, rectB.y + rectB.height) - Math.max(rectA.y, rectB.y));

  return Math.ceil(xOverlap * yOverlap);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isRectObject = (obj: any): obj is Rect =>
  isNumeric(obj.width) && isNumeric(obj.height) && isNumeric(obj.x) && isNumeric(obj.y);

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export const isNumeric = (n: any): n is number => !isNaN(n) && isFinite(n);

// used for a11y key board controls for nodes and edges

export const devWarn = (id: string, message: string) => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[React Flow]: ${message} Help: https://reactflow.dev/error#${id}`);
  }
};

export const snapPosition = (position: XYPosition, snapGrid: SnapGrid = [1, 1]): XYPosition => {
  return {
    x: snapGrid[0] * Math.round(position.x / snapGrid[0]),
    y: snapGrid[1] * Math.round(position.y / snapGrid[1]),
  };
};

export const pointToRendererPoint = (
  { x, y }: XYPosition,
  [tx, ty, tScale]: Transform,
  snapToGrid = false,
  snapGrid: SnapGrid = [1, 1]
): XYPosition => {
  const position: XYPosition = {
    x: (x - tx) / tScale,
    y: (y - ty) / tScale,
  };

  return snapToGrid ? snapPosition(position, snapGrid) : position;
};

export const rendererPointToPoint = ({ x, y }: XYPosition, [tx, ty, tScale]: Transform): XYPosition => {
  return {
    x: x * tScale + tx,
    y: y * tScale + ty,
  };
};

/**
 * Returns a viewport that encloses the given bounds with optional padding.
 * @public
 * @remarks You can determine bounds of nodes with {@link getNodesBounds} and {@link getBoundsOfRects}
 * @param bounds - Bounds to fit inside viewport
 * @param width - Width of the viewport
 * @param height  - Height of the viewport
 * @param minZoom - Minimum zoom level of the resulting viewport
 * @param maxZoom - Maximum zoom level of the resulting viewport
 * @param padding - Optional padding around the bounds
 * @returns A transforned {@link Viewport} that encloses the given bounds which you can pass to e.g. {@link setViewport}
 * @example
 * const { x, y, zoom } = getViewportForBounds(
  { x: 0, y: 0, width: 100, height: 100},
  1200, 800, 0.5, 2);
 */
export const getViewportForBounds = (
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding: number
): Viewport => {
  const xZoom = width / (bounds.width * (1 + padding));
  const yZoom = height / (bounds.height * (1 + padding));
  const zoom = Math.min(xZoom, yZoom);
  const clampedZoom = clamp(zoom, minZoom, maxZoom);
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  const x = width / 2 - boundsCenterX * clampedZoom;
  const y = height / 2 - boundsCenterY * clampedZoom;

  return { x, y, zoom: clampedZoom };
};

export const isMacOs = () => typeof navigator !== 'undefined' && navigator?.userAgent?.indexOf('Mac') >= 0;

export function isCoordinateExtent(extent?: CoordinateExtent | 'parent'): extent is CoordinateExtent {
  return extent !== undefined && extent !== 'parent';
}

export function getNodeDimensions(node: {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  initialWidth?: number;
  initialHeight?: number;
}): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0,
  };
}

export function nodeHasDimensions<NodeType extends NodeBase = NodeBase>(node: NodeType): boolean {
  return (
    (node.measured?.width ?? node.width ?? node.initialWidth) !== undefined &&
    (node.measured?.height ?? node.height ?? node.initialHeight) !== undefined
  );
}

/**
 * Convert child position to aboslute position
 *
 * @internal
 * @param position
 * @param parentId
 * @param nodeLookup
 * @param nodeOrigin
 * @returns an internal node with an absolute position
 */
export function evaluateAbsolutePosition(
  position: XYPosition,
  dimensions: { width?: number; height?: number } = { width: 0, height: 0 },
  parentId: string,
  nodeLookup: NodeLookup,
  nodeOrigin: NodeOrigin
): XYPosition {
  let nextParentId: string | undefined = parentId;
  const positionAbsolute = { ...position };

  while (nextParentId) {
    const parent = nodeLookup.get(nextParentId);
    nextParentId = parent?.parentId;

    if (parent) {
      const origin = parent.origin || nodeOrigin;
      positionAbsolute.x += parent.internals.positionAbsolute.x - (dimensions.width ?? 0) * origin[0];
      positionAbsolute.y += parent.internals.positionAbsolute.y - (dimensions.height ?? 0) * origin[1];
    }
  }

  return positionAbsolute;
}
