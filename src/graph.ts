import { distance2D, randomId } from "./utils"
import { AudioPlugin } from "./plugins/plugin"
import type AudioGraphNode from "./nodes/node";
import { InputGraphNode } from "./nodes/input.node";
import { OutputGraphNode } from "./nodes/output.node";
import { createContextMenu } from "./contextmenu";

export enum GraphNodeType {
    Input = "input",
    Output = "output",
    Plugin = "plugin",
}

export type GraphNode = {
    id: string;
    type: string;
    position: { x: number; y: number };
    instance: AudioGraphNode;
    connections: Record<string, number>;
};

export type GraphState = {
    selectedNode?: GraphNode;
    draggingAnchor?: { x: number; y: number };
    linking?: {
        nodeSourceId: string;
        isSourceInput: boolean;
        mouseX: number;
        mouseY: number;
    };
    nodes: GraphNode[];
}

const GRAPH_CONFIG = {
    NODE_WIDTH: 150,
    NODE_HEIGHT: 50,
    CONNECTOR_GAP: 15,
    CONNECTOR_RADIUS: 5,
    CONNNECTOR_RADIUS_HOVERED: 8,
}

type InitGraphConfig = {
    audioContext: AudioContext,
    onUpdate: (graph: GraphState) => any;
}

export const initGraph = (config: InitGraphConfig) => {
    const graph: GraphState = {
        nodes: [
            {
                type: GraphNodeType.Input,
                id: randomId(),
                instance: new InputGraphNode(config.audioContext),
                position: { x: 0, y: 0 },
                connections: {}
            },
            {
                type: GraphNodeType.Output,
                id: randomId(),
                instance: new OutputGraphNode(config.audioContext),
                position: { x: 0, y: 0 },
                connections: {}
            },
        ],
    };
    const [inputGraphNode, outputGraphNode] = graph.nodes;
    inputGraphNode.connections[outputGraphNode.id] = 1;

    const hoveredNode = {
        isConnector: false,
        isInput: false,
        nodeId: "",
    };

    const pluginWindowEl = document.getElementById("audio-plugin")!;
    const graphCanvas = document.getElementById("graph")! as HTMLCanvasElement;
    const graphCtx = graphCanvas!.getContext("2d")!;

    createContextMenu(graphCanvas,
        () => !!graph.selectedNode,
        [
            {
                key: "delete",
                displayText: "Delete node",
                canShow: () => graph.selectedNode?.type === GraphNodeType.Plugin,
                handler: () => {
                    if (!graph.selectedNode) return;
                    if (graph.selectedNode.type !== GraphNodeType.Plugin) return;
                    console.log("Deleting:", graph.selectedNode, graph.nodes);
                    const map = new Map<string, GraphNode>();
                    let deleteIdx = -1;
                    graph.nodes.forEach((node, index) => {
                        map.set(node.id, node);
                        if (node.id === graph.selectedNode!.id) {
                            deleteIdx = index;
                            return;
                        }
                        if (graph.selectedNode!.id in node.connections) {
                            try {
                                node.instance.output.disconnect(graph.selectedNode!.instance.input);
                            } catch (error) {
                                // ignore error because the nodes are not connected yet
                            }
                            delete node.connections[graph.selectedNode!.id];
                        }
                    });
                    for (const nodeId in graph.selectedNode.connections) {
                        const nextNode = map.get(nodeId);
                        if (!nextNode) continue;
                        try {
                            graph.selectedNode.instance.output.disconnect(nextNode.instance.input);
                        } catch (error) {
                            // ignore error, not connected yet
                        }
                    }
                    delete graph.selectedNode;
                    graph.nodes.splice(deleteIdx, 1);
                    pluginWindowEl.innerHTML = "";
                },
            }
        ]
    );

    const renderGraph = () => {
        graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

        for (const node of graph.nodes) {
            const selected = graph.selectedNode?.id === node.id;

            // draw node box and small dots for connectors (for input is on the left, for output is on the right
            graphCtx.beginPath();
            graphCtx.fillStyle = "transparent";
            graphCtx.strokeStyle = selected ? "steelblue" : "#555";
            graphCtx.roundRect(node.position.x, node.position.y, GRAPH_CONFIG.NODE_WIDTH, GRAPH_CONFIG.NODE_HEIGHT, 5);
            graphCtx.closePath();
            graphCtx.stroke();
            graphCtx.fill();

            const isConnectorHovered = hoveredNode.isConnector && hoveredNode.nodeId === node.id
            if (node.type !== GraphNodeType.Input) {
                const radius = isConnectorHovered && hoveredNode.isInput ? GRAPH_CONFIG.CONNNECTOR_RADIUS_HOVERED
                    : GRAPH_CONFIG.CONNECTOR_RADIUS;

                // input dot
                graphCtx.fillStyle = "#555555";
                graphCtx.beginPath();
                graphCtx.arc(
                    node.position.x - GRAPH_CONFIG.CONNECTOR_GAP,
                    node.position.y + GRAPH_CONFIG.NODE_HEIGHT / 2,
                    radius, 0, Math.PI * 2
                );
                graphCtx.fill();
            }
            if (node.type !== GraphNodeType.Output) {
                const radius = isConnectorHovered && !hoveredNode.isInput ? GRAPH_CONFIG.CONNNECTOR_RADIUS_HOVERED
                    : GRAPH_CONFIG.CONNECTOR_RADIUS;

                // output dot
                graphCtx.fillStyle = "#555555";
                graphCtx.beginPath();
                graphCtx.arc(
                    node.position.x + GRAPH_CONFIG.NODE_WIDTH + GRAPH_CONFIG.CONNECTOR_GAP,
                    node.position.y + GRAPH_CONFIG.NODE_HEIGHT / 2,
                    radius, 0, Math.PI * 2
                );
                graphCtx.fill();
            }

            // draw node label
            graphCtx.fillStyle = "#FFFFFF";
            graphCtx.font = "14px Arial";
            const nodeName = node.instance.name
            graphCtx.fillText(nodeName, node.position.x + 10, node.position.y + 25);

            // draw connections
            for (const targetId in node.connections) {
                const targetNode = graph.nodes.find((n) => n.id === targetId);
                if (targetNode) {
                    const startX = node.position.x + GRAPH_CONFIG.NODE_WIDTH + GRAPH_CONFIG.CONNECTOR_GAP;
                    const startY = node.position.y + GRAPH_CONFIG.NODE_HEIGHT / 2;
                    const endX = targetNode.position.x - GRAPH_CONFIG.CONNECTOR_GAP;
                    const endY = targetNode.position.y + GRAPH_CONFIG.NODE_HEIGHT / 2;
                    const cp1X = startX + GRAPH_CONFIG.NODE_HEIGHT;
                    const cp1Y = startY;
                    const cp2X = endX - GRAPH_CONFIG.NODE_HEIGHT;
                    const cp2Y = endY;

                    graphCtx.strokeStyle = "#888888";

                    graphCtx.beginPath();
                    graphCtx.moveTo(startX, startY);
                    graphCtx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
                    graphCtx.stroke();
                }
            }
        }

        if (graph.linking) {
            const { NODE_WIDTH, NODE_HEIGHT, CONNECTOR_GAP } = GRAPH_CONFIG;
            const nodeSource = graph.nodes.find(node => node.id === graph.linking!.nodeSourceId)!;
            const startX = !graph.linking.isSourceInput
                ? nodeSource.position.x + NODE_WIDTH + CONNECTOR_GAP
                : nodeSource.position.x - CONNECTOR_GAP;
            const startY = nodeSource.position.y + NODE_HEIGHT / 2;

            graphCtx.strokeStyle = "steelblue";
            graphCtx.beginPath();
            graphCtx.moveTo(startX, startY);
            graphCtx.lineTo(graph.linking.mouseX, graph.linking.mouseY);
            graphCtx.stroke();
        }
        requestAnimationFrame(renderGraph);
    };
    renderGraph();

    const inGraphNode = (x: number, y: number): GraphNode | null => {
        for (const node of graph.nodes) {
            const { x: nodeX, y: nodeY } = node.position;
            if (nodeX <= x && nodeX + GRAPH_CONFIG.NODE_WIDTH >= x
                && nodeY <= y && nodeY + GRAPH_CONFIG.NODE_HEIGHT >= y) {
                return node;
            }
        }
        return null;
    }
    const inGraphNodeConnector = (x: number, y: number) => {
        const radius = GRAPH_CONFIG.CONNNECTOR_RADIUS_HOVERED;

        for (const node of graph.nodes) {
            const { x: nodeX, y: nodeY } = node.position;

            if (node.type !== GraphNodeType.Input) {
                const inputDistance = distance2D(
                    x, y,
                    nodeX - GRAPH_CONFIG.CONNECTOR_GAP,
                    nodeY + GRAPH_CONFIG.NODE_HEIGHT / 2
                )
                if (inputDistance <= radius) {
                    return { node, input: true };
                }
            }

            if (node.type !== GraphNodeType.Output) {
                const outputDistance = distance2D(
                    x, y,
                    nodeX + GRAPH_CONFIG.NODE_WIDTH + GRAPH_CONFIG.CONNECTOR_GAP,
                    nodeY + GRAPH_CONFIG.NODE_HEIGHT / 2
                )
                if (outputDistance <= radius) {
                    return { node, input: false };
                }
            }
        }

        return null;
    }

    const displayGraphNodeUI = (node: GraphNode) => {
        node.instance.render(pluginWindowEl);
    };

    const setCursorType = (type: "default" | "grabbing" | "pointer") => {
        graphCanvas.style.cursor = type;
    };

    graphCanvas.addEventListener("mousedown", (ev: any) => {
        const { offsetX, offsetY } = ev;

        const insideConnector = inGraphNodeConnector(offsetX, offsetY);
        if (insideConnector) {
            graph.linking = {
                nodeSourceId: insideConnector.node.id,
                isSourceInput: insideConnector.input,
                mouseX: offsetX,
                mouseY: offsetY,
            };
            setCursorType("grabbing");
            return;
        }

        const insideNode = inGraphNode(offsetX, offsetY);
        if (insideNode) {
            setCursorType("grabbing");
            if (graph.selectedNode?.id !== insideNode.id) {
                displayGraphNodeUI(insideNode);
            }
            graph.selectedNode = insideNode;
            graph.draggingAnchor = {
                x: offsetX - insideNode.position.x,
                y: offsetY - insideNode.position.y,
            };
            return;
        }

        delete graph.selectedNode;
        // TODO: This is the bad way to implement this, consider using 'hide()' and 'show()' functions
        pluginWindowEl.innerHTML = "";
    });

    graphCanvas.addEventListener("mousemove", (ev: any) => {
        const { offsetX, offsetY } = ev;

        const insideConnector = inGraphNodeConnector(offsetX, offsetY);
        if (insideConnector) {
            hoveredNode.nodeId = insideConnector.node.id;
            hoveredNode.isInput = insideConnector.input;
            hoveredNode.isConnector = true;
            graphCanvas.style.cursor = "pointer";
        } else {
            hoveredNode.isConnector = false;
            const insideNode = inGraphNode(offsetX, offsetY);
            if (insideNode) {
                graphCanvas.style.cursor = "pointer";
                hoveredNode.nodeId = insideNode.id;
            } else {
                graphCanvas.style.cursor = "default";
                hoveredNode.nodeId = "";
            }
        }

        if (graph.linking) {
            graph.linking.mouseX = offsetX;
            graph.linking.mouseY = offsetY;
            setCursorType("grabbing");
        }

        if (graph.draggingAnchor && graph.selectedNode) {
            graph.selectedNode.position.x = offsetX - graph.draggingAnchor.x;
            graph.selectedNode.position.y = offsetY - graph.draggingAnchor.y;
        }
    });

    const createConnection = (input: GraphNode, output: GraphNode) => {
        console.log("Creating new connection between", input, output);

        // reconnecting removes the connection
        if (input.connections[output.id]) {
            if (input.type === GraphNodeType.Plugin && input.instance) {
                input.instance.output.disconnect();
            }
            delete input.connections[output.id]
            config.onUpdate(graph);
            return true;
        }

        // find circular dependencies using DFS
        const stack: string[] = [output.id];
        const visited = new Set<string>();
        while (stack.length) {
            const nodeId = stack.pop();
            if (!nodeId) continue;
            if (nodeId === input.id) {
                console.warn("The connection between nodes (%s -> %s) will cause a circular dependency", input.id, output.id);
                return false;
            }
            if (!visited.has(nodeId)) {
                visited.add(nodeId);
                const node = graph.nodes.find(node => node.id === nodeId);
                stack.push(...Object.keys(node!.connections));
                continue;
            }
        }

        input.connections[output.id] = 1;
        config.onUpdate(graph);

        return true;
    };

    graphCanvas.addEventListener("mouseup", (ev: any) => {
        const { offsetX, offsetY } = ev;
        if (graph.draggingAnchor && graph.selectedNode) {
            setCursorType("default");
            delete graph.draggingAnchor;
        }

        if (graph.linking) {
            const insideConnector = inGraphNodeConnector(offsetX, offsetY);
            const nodeSource = graph.nodes.find(node => node.id === graph.linking!.nodeSourceId);
            const { isSourceInput } = graph.linking;

            if (insideConnector && nodeSource && insideConnector.input !== graph.linking.isSourceInput) {
                if (!isSourceInput) {
                    createConnection(nodeSource, insideConnector.node);
                } else {
                    createConnection(insideConnector.node, nodeSource);
                }
            }
            delete graph.linking;
        }
    });

    const onResize = () => {
        graphCanvas.width = document.body.clientWidth - 20;
        graphCanvas.height = 350;

        inputGraphNode.position.x = 50;
        inputGraphNode.position.y = graphCanvas.height / 2;

        outputGraphNode.position.x = graphCanvas.width - 200;
        outputGraphNode.position.y = graphCanvas.height / 2;
    };
    onResize();
    window.addEventListener("resize", onResize);

    return {
        apply(source: AudioNode, destination: AudioDestinationNode) {
            inputGraphNode.instance.output.disconnect();
            outputGraphNode.instance.output.connect(destination);
            source.connect(inputGraphNode.instance.input);

            for (const node of graph.nodes) {
                if (node.type === GraphNodeType.Output) continue;
                const leftNode = node.instance.output;
                for (const childId in node.connections) {
                    const child = graph.nodes.find(n => n.id === childId);
                    if (!child || child.type === GraphNodeType.Input) {
                        // invalid connection
                        delete node.connections[childId];
                        continue;
                    }
                    const rightNode = child.instance.input;
                    leftNode.connect(rightNode);
                }
            }
        },
        addPlugin(plugin: AudioPlugin) {
            const newNode: GraphNode = {
                id: randomId(),
                type: GraphNodeType.Plugin,
                position: {
                    x: graphCanvas.width / 2,
                    y: graphCanvas.height / 2,
                },
                instance: plugin,
                connections: {},
            };
            graph.nodes.push(newNode);
            return true;
        },
    }
}
