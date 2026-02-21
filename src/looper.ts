/**
Example of processing chain:
MediaStream (mic) 
    -> input_stream -> channel_merger -> dyn_compressor -> equalizer
    -> recorder_processor (storing Float32Array recorded buffer in track state)
    -> track_processing_chain (e.g. reverb, equalizer, phaser, compressor, delay)
    -> output_processing_chain (master fx chain)
    -> output_destination (AudioContext.prototype.destination (or custom))

TODO: Looperstation
- [ ] Initialization: root AudioContext
- [ ] MasterClock: calculates BPM/Measures
- [ ] Input Chain: processing input source (gain, equalizers, compressors, etc)
- [ ] Monitoring: hearing yourself by connecting input node to the output

Recording and buffering
- [ ] Input Recording: Use `AudioWorklet` to record audio buffers from input source
- [ ] 

*/

"use strict";

import { InputNode } from "./nodes/input.node";
import PLUGINS from "./plugins";

const audioContext = new AudioContext({
    latencyHint: "interactive",
    sampleRate: 44_100,
});

const bpmInput = document.querySelector<HTMLInputElement>("#bpm-input")!;
const metronomeToggle = document.querySelector<HTMLInputElement>("#metronome-toggle")!;
const monitoringToggle = document.querySelector<HTMLInputElement>("#monitoring-toggle")!;
const trackRecordButton = document.querySelector<HTMLInputElement>(".track-record")!;

// Initialize on user interaction, as per spec
document.addEventListener("click", () => {
    initialize();
}, { once: true });

function getInputNode(stream: MediaStream, audioContext: AudioContext) {
    const micInputSource = audioContext.createMediaStreamSource(stream);
    const inputNode = new InputNode(audioContext, "Mic");
    inputNode.connectInput(micInputSource);
    return inputNode;
}

function initializeInputUI(inputNode: InputNode) {
    const params = inputNode.getParams();

    const inputGainElement = document.querySelector<HTMLInputElement>("#input-gain")!;
    const inputPanElement = document.querySelector<HTMLInputElement>("#input-pan")!;
    const inputMonoElement = document.querySelector<HTMLInputElement>("#input-mono")!;

    const gain = params.find(param => param.id === inputGainElement.dataset.param)!;
    const pan = params.find(param => param.id === inputPanElement.dataset.param)!;
    const mono = params.find(param => param.id === inputMonoElement.dataset.param)!;

    inputGainElement.value = gain?.getValue().toString();
    inputPanElement.value = pan.getValue().toString();
    inputMonoElement.checked = !!mono.getValue()

    inputGainElement.addEventListener("input", () => {
        gain.setValue(inputGainElement.value);
    });
    inputPanElement.addEventListener("input", () => {
        pan.setValue(+inputPanElement.value);
    });
    inputMonoElement.addEventListener("change", () => {
        mono.setValue(inputMonoElement.checked);
    });
}

async function getUserAudioInput() {
    console.log("[getUserAudioInput]: Supported media-constraints: ", navigator.mediaDevices.getSupportedConstraints());

    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: audioContext.sampleRate,
            latency: 0,
        },
    };

    return navigator.mediaDevices.getUserMedia(constraints).catch(console.error);
}

async function initialize() {
    console.log("Initialization Loopstation...");

    const stream = await getUserAudioInput();
    if (!stream) {
        alert("Cannot get access to a microphone. Try again.");
        return initialize();
    }

    const inputNode = getInputNode(stream, audioContext);
    initializeInputUI(inputNode);
    initializeInputPluginsUI(inputNode);

    const recordingNode = await setupRecordingWorkletNode({
        channels: 2,
        sampleRate: audioContext.sampleRate,
        maxRecordingFrames: audioContext.sampleRate * (60 / 120) * 4 // 1 bar
    });

    inputNode.connect(recordingNode)
    recordingNode.connect(audioContext.destination);

    recordingNode.port.addEventListener("message", (data) => {
        console.log("Message from Recording Processor:", data);
    });

    console.log("Recording node:", recordingNode);

    let recording = false;

    function startRecording(trackIdx: number) {
        if (recording) {
            return false;
        }
        recording = true;
        recordingNode.port.postMessage({ test: 1234 });
    }

    function stopRecording() {
        recording = false;
    }
    metronomeToggle.addEventListener("change", () => {
        console.log("Metronome status:", metronomeToggle.checked);
    });
    monitoringToggle.addEventListener("change", () => {
        console.log("Monitoring status:", monitoringToggle.checked);
    });
    trackRecordButton.addEventListener("click", () => {
        if (recording) {
            stopRecording();
            trackRecordButton.innerText = "Rec";
        } else {
            startRecording(0); // 0 for track 1
            trackRecordButton.innerText = "Stop";
        }
    });
}

/**
 * Creates an audio recorder worklet to handle recording
*/
async function setupRecordingWorkletNode(properties: unknown) {
    await audioContext.audioWorklet.addModule("src/processors/recording.processor.js");
    return new AudioWorkletNode(audioContext, "recording-processor", {
        processorOptions: properties
    });
}

function initializeInputPluginsUI(inputNode: InputNode) {
    const pluginChainElement = document.getElementById("plugin-chain")! as HTMLDivElement;
    const addPluginSelect = document.getElementById("add-plugin-select")! as HTMLSelectElement;
    const addPluginDiv = pluginChainElement.querySelector(".add-plugin")! as HTMLDivElement;

    let draggedItem: HTMLElement | null = null;

    const pluginTemplates = {
        equalizer: `
            <div class="plugin-header">
                <span class="drag-handle" draggable="true">≡</span>
                <span class="plugin-name">Equalizer</span>
                <button class="bypass-btn">Bypass</button>
                <button class="remove-btn">×</button>
            </div>
            <div class="plugin-content">
                <div class="eq-bands">
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>60Hz</label>
                    </div>
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>170Hz</label>
                    </div>
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>310Hz</label>
                    </div>
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>600Hz</label>
                    </div>
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>3kHz</label>
                    </div>
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>6kHz</label>
                    </div>
                    <div class="eq-band">
                        <input type="range" min="-12" max="12" value="0" />
                        <label>12kHz</label>
                    </div>
                </div>
            </div>
            `,
        reverb: `
            <div class="plugin-header">
                <span class="drag-handle" draggable="true">≡</span>
                <span class="plugin-name">Reverb</span>
                <button class="bypass-btn">Bypass</button>
                <button class="remove-btn">×</button>
            </div>
            <div class="plugin-content">
                <div class="reverb-controls">
                    <div class="control-row">
                        <label>Mix</label>
                        <input type="range" min="0" max="1" step="0.05" value="0.3" />
                    </div>
                    <div class="control-row">
                        <label>Decay</label>
                        <input type="range" min="0.1" max="10" step="0.1" value="2" />
                    </div>
                    <div class="control-row">
                        <label>PreDelay</label>
                        <input type="range" min="0" max="0.1" step="0.01" value="0.02" />
                    </div>
                </div>
            </div>
        `,
        delay: `
                    <div class="plugin-header">
                        <span class="drag-handle" draggable="true">≡</span>
                        <span class="plugin-name">Delay</span>
                        <button class="bypass-btn">Bypass</button>
                        <button class="remove-btn">×</button>
                    </div>
                    <div class="plugin-content">
                        <div class="delay-controls">
                            <div class="control-row">
                                <label>Time</label>
                                <input type="range" min="0.01" max="2" step="0.01" value="0.5" />
                            </div>
                            <div class="control-row">
                                <label>Feedback</label>
                                <input type="range" min="0" max="0.9" step="0.05" value="0.3" />
                            </div>
                            <div class="control-row">
                                <label>Mix</label>
                                <input type="range" min="0" max="1" step="0.05" value="0.3" />
                            </div>
                        </div>
                    </div>
                `,
        compressor: `
                    <div class="plugin-header">
                        <span class="drag-handle" draggable="true">≡</span>
                        <span class="plugin-name">Compressor</span>
                        <button class="bypass-btn">Bypass</button>
                        <button class="remove-btn">×</button>
                    </div>
                    <div class="plugin-content">
                        <div class="compressor-controls">
                            <div class="control-row">
                                <label>Threshold</label>
                                <input type="range" min="-60" max="0" step="1" value="-24" />
                            </div>
                            <div class="control-row">
                                <label>Ratio</label>
                                <input type="range" min="1" max="20" step="1" value="4" />
                            </div>
                            <div class="control-row">
                                <label>Attack</label>
                                <input type="range" min="0" max="1" step="0.01" value="0.003" />
                            </div>
                            <div class="control-row">
                                <label>Release</label>
                                <input type="range" min="0" max="1" step="0.01" value="0.25" />
                            </div>
                        </div>
                    </div>
                `
    };

    addPluginSelect.addEventListener("change", function() {
        const pluginType = this.value as keyof typeof pluginTemplates;
        if (!pluginType) return;

        const pluginEl = document.createElement("div");
        pluginEl.className = "plugin";
        pluginEl.dataset.plugin = pluginType;

        const plugin = PLUGINS.find((plugin) => plugin.id === pluginType);
        console.log("[addPluginSelect] plugin:", plugin);

        pluginEl.innerHTML = pluginTemplates[pluginType];

        pluginChainElement.insertBefore(pluginEl, addPluginDiv);

        // Re-attach event listeners to new plugin
        attachPluginEvents(pluginEl);

        this.value = "";
    });

    function attachPluginEvents(plugin: HTMLDivElement) {
        const dragHandle = plugin.querySelector<HTMLDivElement>(".drag-handle")!;

        dragHandle.addEventListener("dragstart", handleDragStart);
        dragHandle.addEventListener("dragend", handleDragEnd);
        plugin.addEventListener("dragover", handleDragOver);
        plugin.addEventListener("dragenter", handleDragEnter);
        plugin.addEventListener("dragleave", handleDragLeave);
        plugin.addEventListener("drop", handleDrop);

        const bypassBtn = plugin.querySelector<HTMLButtonElement>(".bypass-btn")!;
        bypassBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            plugin.classList.toggle("bypassed");
            bypassBtn.classList.toggle("active");
            bypassBtn.textContent = plugin.classList.contains("bypassed") ? "On" : "Bypass";
        });

        const removeBtn = plugin.querySelector<HTMLButtonElement>(".remove-btn")!;
        removeBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            plugin.remove();
        });
    }

    // Initialize existing plugins
    document.querySelectorAll(".plugin").forEach((plugin) => {
        attachPluginEvents(plugin as HTMLDivElement);
    });

    // Drag and Drop handlers
    function handleDragStart(e: DragEvent) {
        const current = e.target as HTMLElement;
        draggedItem = current.closest(".plugin");
        if (draggedItem) {
            draggedItem.classList.add("dragging");
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", "");
            }
        }
    }

    function handleDragEnd() {
        if (draggedItem) {
            draggedItem.classList.remove("dragging");
            document.querySelectorAll(".plugin").forEach(plugin => {
                plugin.classList.remove("drag-over");
            });
            draggedItem = null;
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "move";
        }
    }

    function handleDragEnter(e: Event) {
        e.preventDefault();
        const target = e.target as HTMLDivElement;
        if (target !== draggedItem) {
            target.classList.add("drag-over");
        }
    }

    function handleDragLeave(e: DragEvent) {
        const target = e.target as HTMLDivElement;
        target.classList.remove("drag-over");
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        const dropTarget = (e.target as HTMLElement).closest(".plugin")!;
        if (draggedItem && dropTarget !== draggedItem) {
            const allPlugins = Array.from(pluginChainElement.querySelectorAll(".plugin"));
            const draggedIndex = allPlugins.indexOf(draggedItem);
            const dropIndex = allPlugins.indexOf(dropTarget);

            if (draggedIndex < dropIndex) {
                dropTarget.parentNode!.insertBefore(draggedItem, dropTarget.nextSibling);
            } else {
                dropTarget.parentNode!.insertBefore(draggedItem, dropTarget);
            }
        }
        dropTarget.classList.remove("drag-over");
    }

};
