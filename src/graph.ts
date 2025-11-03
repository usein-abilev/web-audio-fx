import { distance2D, randomId } from "./utils"
import { AudioPlugin } from "./plugins/plugin"
import type AudioGraphNode from "./nodes/node";
import { InputGraphNode } from "./nodes/input.node";
import { OutputGraphNode } from "./nodes/output.node";
import { createContextMenu } from "./contextmenu";
import PLUGINS from "./plugins";

export enum GraphNodeType {
    Input = "input",
    Output = "output",
    Plugin = "plugin",
    Bus = "bus",
}

type Position2D = { x: number; y: number; };

type GraphNodeBase = {
    id: string;
    position: Position2D;
    connections: Record<string, number>;
};

export type GraphNode =
    | GraphNodeBase & { type: GraphNodeType.Plugin; instance: AudioPlugin; }
    | GraphNodeBase & { type: GraphNodeType.Input | GraphNodeType.Output | GraphNodeType.Bus; instance: AudioGraphNode; }

const GRAPH_CONFIG = {
    NODE_WIDTH: 150,
    NODE_HEIGHT: 50,
    CONNECTOR_GAP: 15,
    CONNECTOR_RADIUS: 5,
    CONNNECTOR_RADIUS_HOVERED: 10,
}

type InitGraphConfig = {
    audioContext: AudioContext,
    onUpdate: (graph: AudioProcessingGraph) => any;
}

type AudioProcessingGraphConfig = {
    audioContext: AudioContext,
    graphCanvas: HTMLCanvasElement;
    onUpdate: (graph: AudioProcessingGraph) => any;
    onNewInputNode: (inputNode: GraphNode) => any;
};

export class AudioProcessingGraph {
    public nodes: GraphNode[];
    public outputGraphNode: GraphNode;
    public masterGraphNode: GraphNode;

    // TODO: UI related, move to separate module/class/function
    public draggingAnchor?: Position2D;
    public selectedNode?: GraphNode;
    public linking?: {
        nodeSourceId: string;
        isSourceInput: boolean;
        mouseX: number;
        mouseY: number;
    };

    private nextInputNodePosition: Position2D = { x: 50, y: 100 };
    private focusedNodeChain?: GraphNode;

    constructor(private config: AudioProcessingGraphConfig) {
        this.masterGraphNode = {
            id: randomId(),
            type: GraphNodeType.Bus,
            instance: new InputGraphNode(config.audioContext, "Master Node"),
            position: { x: config.graphCanvas.width / 2, y: config.graphCanvas.height / 2 },
            connections: {},
        };
        this.outputGraphNode = {
            id: randomId(),
            type: GraphNodeType.Output,
            instance: new OutputGraphNode(config.audioContext),
            position: { x: config.graphCanvas.width - GRAPH_CONFIG.NODE_WIDTH - 50, y: config.graphCanvas.height / 2 },
            connections: {}
        };

        this.nodes = [
            this.masterGraphNode,
            this.outputGraphNode,
        ];

        this.createConnection(this.masterGraphNode, this.outputGraphNode);
        this.outputGraphNode.instance.output.connect(config.audioContext.destination);
    }

    /**
        * Focuses on specific node chain by hidding other nodes which isn't related to the node
    */
    focusNodeChain(node: GraphNode) {
        this.focusedNodeChain = node;
        // TODO: Hide unfocused nodes using BFS/DFS
    }

    getBuses() {
        return this.nodes.filter(node => node.type === GraphNodeType.Bus);
    }

    addInput(instance: InputGraphNode, connectToId?: string) {
        const node = {
            id: randomId(),
            type: GraphNodeType.Input,
            instance: instance as any,
            position: this.nextInputNodePosition,
            connections: {},
        };
        this.nextInputNodePosition = {
            x: this.nextInputNodePosition.x,
            y: this.nextInputNodePosition.y + GRAPH_CONFIG.NODE_HEIGHT + 10,
        }
        this.nodes.push(node);
        this.config.onNewInputNode(node);

        if (typeof connectToId === "string") {
            const target = this.nodes.find(node => node.id === connectToId);
            if (target) {
                this.createConnection(node, target);
            } else {
                console.warn("Unable to create connection between nodes", { instance, connectToId });
            }
        }

        return true;
    }

    addPlugin(plugin: AudioPlugin) {
        const node = {
            id: randomId(),
            type: GraphNodeType.Plugin,
            position: {
                x: this.config.graphCanvas.width / 2,
                y: this.config.graphCanvas.height / 2,
            },
            instance: plugin,
            connections: {},
        };
        this.nodes.push(node);
        return true;
    }

    analyze(connect: (node: AudioNode) => any) {
        connect(this.outputGraphNode.instance.output);
    }

    createConnection(source: GraphNode, target: GraphNode) {
        console.log("Creating new connection between", source, target);

        // reconnecting removes the connection
        if (source.connections[target.id]) {
            source.instance.output.disconnect(target.instance.input);
            delete source.connections[target.id]
            this.config.onUpdate(this);
            return true;
        }

        // find circular dependencies using DFS
        const stack: string[] = [target.id];
        const visited = new Set<string>();
        while (stack.length) {
            const nodeId = stack.pop();
            if (!nodeId) continue;
            if (nodeId === source.id) {
                console.warn("The connection between nodes (%s -> %s) will cause a circular dependency", source.id, target.id);
                return false;
            }
            if (!visited.has(nodeId)) {
                visited.add(nodeId);
                const node = this.nodes.find(node => node.id === nodeId);
                stack.push(...Object.keys(node!.connections));
                continue;
            }
        }

        source.connections[target.id] = 1;
        source.instance.output.connect(target.instance.input);
        this.config.onUpdate(this);

        return true;
    }
}

export const initGraph = (config: InitGraphConfig) => {
    const pluginWindowEl = document.getElementById("audio-plugin")!;
    const graphCanvas = document.getElementById("graph")! as HTMLCanvasElement;
    const graphCtx = graphCanvas!.getContext("2d")!;

    const onResize = () => {
        graphCanvas.width = document.body.clientWidth - 20;
        graphCanvas.height = 450;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const graph = new AudioProcessingGraph({
        audioContext: config.audioContext,
        onUpdate: config.onUpdate,
        graphCanvas,
        onNewInputNode: () => updateChannelSelector(),
    });

    const getChannels = () => {
        return graph.nodes.filter((node) => node.type === GraphNodeType.Input || node.type === GraphNodeType.Bus);
    }

    const channelSelector = document.getElementById("channel-select")! as HTMLSelectElement;
    channelSelector.addEventListener("change", (ev: any) => {
        const channels = getChannels();
        const channel = channels.find((p) => p.id === ev.target?.value);
        if (!channel) return;
        graph.focusNodeChain(channel);
        console.log("Selected channel:", channel);
    });

    const updateChannelSelector = () => {
        const channels = getChannels();

        channelSelector.innerHTML = "";
        for (const channel of channels) {
            const option = document.createElement("option");
            option.value = channel.id;
            option.innerText = channel.instance.name;
            channelSelector.add(option);
        }
    }

    // Initialize Plugin List Selector
    (() => {
        const pluginSelector = document.getElementById("add-plugin-select")! as HTMLSelectElement;

        for (const plugin of PLUGINS) {
            const option = document.createElement("option");
            option.value = plugin.id;
            option.innerText = plugin.name;
            pluginSelector.add(option);
        }

        pluginSelector.addEventListener("change", (ev: any) => {
            const plugin = PLUGINS.find((p) => p.id === ev.target?.value);
            if (!plugin) return;
            console.log("Adding plugin:", plugin);
            graph.addPlugin(plugin.getInstance(config.audioContext));
            pluginSelector.value = "";
        });
    })();

    const hoveredNode = {
        isConnector: false,
        isInput: false,
        nodeId: "",
    };

    createContextMenu(graphCanvas,
        () => !!graph.selectedNode,
        [
            {
                key: "bypass",
                displayText: () => {
                    if (graph.selectedNode?.type === GraphNodeType.Plugin) {
                        return graph.selectedNode.instance.bypass ? "Activate node" : "Bypass node";
                    }
                    return "";
                },
                canShow: () => graph.selectedNode?.type === GraphNodeType.Plugin,
                handler: () => {
                    if (!graph.selectedNode) return;
                    const plugin = graph.selectedNode.instance as AudioPlugin;
                    plugin.setBypass(!plugin.bypass);
                },
            },
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
        requestAnimationFrame(renderGraph);
        graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

        for (const node of graph.nodes) {
            const selected = graph.selectedNode?.id === node.id;

            graphCtx.save();
            graphCtx.globalAlpha = node.type === GraphNodeType.Plugin && node.instance.bypass ? 0.5 : 1;

            // draw node box and small dots for connectors (for input is on the left, for output is on the right
            graphCtx.beginPath();
            graphCtx.fillStyle = "transparent";
            graphCtx.strokeStyle = selected ? "steelblue" : "#555";
            graphCtx.roundRect(node.position.x, node.position.y, GRAPH_CONFIG.NODE_WIDTH, GRAPH_CONFIG.NODE_HEIGHT, 5);
            graphCtx.closePath();
            graphCtx.stroke();
            graphCtx.fill();

            // draw node label
            graphCtx.fillStyle = "#FFFFFF";
            graphCtx.font = "14px Arial";
            const nodeName = node.instance.name
            graphCtx.fillText(nodeName, node.position.x + 10, node.position.y + 25);
            graphCtx.restore();

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
                    graph.createConnection(nodeSource, insideConnector.node);
                } else {
                    graph.createConnection(insideConnector.node, nodeSource);
                }
            }
            delete graph.linking;
        }
    });
    return graph;
}
