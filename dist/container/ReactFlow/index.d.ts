import React, { CSSProperties, ReactNode, SVGAttributes } from 'react';
import { Elements, NodeTypesType, EdgeTypesType, GridType, OnLoadFunc } from '../../types';
import '../../style.css';
export interface ReactFlowProps {
    elements: Elements;
    style?: CSSProperties;
    className?: string;
    children?: ReactNode[];
    onElementClick: () => void;
    onElementsRemove: (elements: Elements) => void;
    onNodeDragStop: () => void;
    onConnect: () => void;
    onLoad: OnLoadFunc;
    onMove: () => void;
    nodeTypes: NodeTypesType;
    edgeTypes: EdgeTypesType;
    connectionLineType: string;
    connectionLineStyle: SVGAttributes<{}>;
    deleteKeyCode: number;
    selectionKeyCode: number;
    showBackground: boolean;
    backgroundGap: number;
    backgroundColor: string;
    backgroundType: GridType;
}
declare const ReactFlow: {
    ({ style, onElementClick, elements, children, nodeTypes, edgeTypes, onLoad, onMove, onElementsRemove, onConnect, onNodeDragStop, connectionLineType, connectionLineStyle, deleteKeyCode, selectionKeyCode, showBackground, backgroundGap, backgroundType, backgroundColor }: ReactFlowProps): JSX.Element;
    displayName: string;
    defaultProps: {
        onElementClick: () => void;
        onElementsRemove: () => void;
        onNodeDragStop: () => void;
        onConnect: () => void;
        onLoad: () => void;
        onMove: () => void;
        nodeTypes: {
            input: ({ data, style }: import("../../types").NodeProps) => JSX.Element;
            default: ({ data, style }: import("../../types").NodeProps) => JSX.Element;
            output: ({ data, style }: import("../../types").NodeProps) => JSX.Element;
        };
        edgeTypes: {
            default: React.MemoExoticComponent<({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style }: import("../../types").EdgeBezierProps) => JSX.Element>;
            straight: React.MemoExoticComponent<({ sourceX, sourceY, targetX, targetY, style }: import("../../types").EdgeProps) => JSX.Element>;
            step: React.MemoExoticComponent<({ sourceX, sourceY, targetX, targetY, style }: import("../../types").EdgeProps) => JSX.Element>;
        };
        connectionLineType: string;
        connectionLineStyle: {};
        deleteKeyCode: number;
        selectionKeyCode: number;
        backgroundColor: string;
        backgroundGap: number;
        showBackground: boolean;
        backgroundType: GridType;
    };
};
export default ReactFlow;
