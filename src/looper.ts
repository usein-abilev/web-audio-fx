"use strict";

import { AudioScheduler } from "./clock";
import { InputNode } from "./nodes/input.node";
import AudioBaseNode from "./nodes/node";
import PLUGINS from "./plugins";
import type { AudioPlugin } from "./plugins/plugin";
import { disconnectAudioNodesSafe } from "./utils";

const AUDIO_SAMPLE_RATE = 44_100;

const audioContext = new AudioContext({
    latencyHint: "interactive",
    sampleRate: AUDIO_SAMPLE_RATE,
});

const audioScheduler = new AudioScheduler(audioContext, {
    bpm: 80,
    timeSignature: [4, 4],
    onTick: onSchedulerTick,
});

enum TrackState {
    IDLE = "IDLE",
    COUNT_IN = "COUNT_IN",
    PREPARE_REC = "PREPARE_REC",
    RECORDING = "RECORDING",
    PREPARE_PLAY = "PREPARE_PLAY",
    PLAYING = "PLAYING",
    PREPARE_DUB = "PREPARE_DUB",
    OVERDUBBING = "OVERDUBBING"
}

enum TrackWorkletCommand {
    START_RECORDING = "START_RECORDING",
    STOP_RECORDING = "STOP_RECORDING",
    START_OVERDUB = "START_OVERDUB",
    CLEAR = "CLEAR",
}

const tracksState = new Map<number, {
    state: TrackState;
    node: AudioWorkletNode;
    postGainNode: GainNode;
    recordButton: HTMLButtonElement;
    countInBeatsLeft: number;
}>();

const masterChannel = {
    busNode: audioContext.createGain(),
    outputNode: audioContext.destination,
};

const inputPluginInstances = new Map<HTMLElement, AudioPlugin>();

const bpmInput = document.querySelector<HTMLInputElement>("#bpm-input")!;
const metronomeToggle = document.querySelector<HTMLInputElement>("#metronome-toggle")!;
const monitoringToggle = document.querySelector<HTMLInputElement>("#monitoring-toggle")!;

bpmInput.addEventListener("change", () => {
    audioScheduler.setBPM(+bpmInput.value);
});

// Initialize on user interaction, as per spec
document.addEventListener("click", initialize, { once: true });

async function initialize() {
    const stream = await getUserAudioInput();
    if (!stream) {
        console.error("Unable to access user audio input, please make sure you have allowed microphone use for this page");
        return initialize();
    }

    const inputNode = getInputNode(stream, audioContext);
    const inputBusNode = audioContext.createGain();
    initializeInputUI(inputNode);
    initializeInputPlugins(inputNode, inputBusNode);
    initializeTracks(inputBusNode);
    initializeMasterChannel();

    audioScheduler.setBPM(+bpmInput.value);
    audioScheduler.reset();

    // Input Signal Monitoring
    monitoringToggle.addEventListener("click", () => {
        if (monitoringToggle.checked) {
            inputBusNode.connect(audioContext.destination);
        } else {
            disconnectAudioNodesSafe(inputBusNode, audioContext.destination);
        }
    });
}

function initializeMasterChannel() {
    masterChannel.busNode.connect(masterChannel.outputNode);
}

/** 
 * Runs each tick of the AudioScheduler
*/
function onSchedulerTick(beat: number, time: number) {
    if (metronomeToggle.checked) {
        const osc = audioContext.createOscillator();
        const envelope = audioContext.createGain();

        osc.connect(envelope);
        envelope.connect(audioContext.destination);

        osc.frequency.value = (beat === 0) ? 1000 : 800;

        envelope.gain.setValueAtTime(1, time);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

        osc.start(time);
        osc.stop(time + 0.1);
    }

    scheduleTrackEvents(beat, time);
}

function scheduleTrackEvents(beat: number, time: number) {
    tracksState.forEach((track) => {
        if (track.state === TrackState.COUNT_IN) {
            track.countInBeatsLeft--;
            track.recordButton.classList.toggle("count-in-active", true);
            setTimeout(() => {
                track.recordButton.classList.toggle("count-in-active", false);
            }, 50);
            if (track.countInBeatsLeft <= 0) {
                track.state = TrackState.PREPARE_REC;
                track.countInBeatsLeft = 0;
            }
        }
        console.log("Current Beat:", beat);
        if (beat === 0) {
            if (track.state === TrackState.PREPARE_REC) {
                track.node.port.postMessage({ command: TrackWorkletCommand.START_RECORDING, time });
                track.state = TrackState.RECORDING;
            } else if (track.state === TrackState.PREPARE_PLAY) {
                track.node.port.postMessage({ command: TrackWorkletCommand.STOP_RECORDING, time });
                track.state = TrackState.PLAYING;
            } else if (track.state === TrackState.PREPARE_DUB) {
                track.node.port.postMessage({ command: TrackWorkletCommand.START_OVERDUB, time });
                track.state = TrackState.OVERDUBBING;
            }
            updateRecordButtonVisual(track);
        }
    });
}

function updateRecordButtonVisual(track: typeof tracksState extends Map<number, infer T> ? T : never) {
    track.recordButton.classList.remove("recording", "overdub", "count-in");
    if (track.state === TrackState.RECORDING) {
        track.recordButton.classList.add("recording");
    } else if (track.state === TrackState.OVERDUBBING) {
        track.recordButton.classList.add("overdub");
    }
}

function initializeTracks(inputBusNode: AudioNode) {
    const tracksElements = document.querySelectorAll<HTMLDivElement>(".tracks-section .track");

    // Creates a AudioWorkletNode per each track DOM element 
    tracksElements.forEach((track) => {
        if (track.dataset.track === undefined) {
            console.error("Track doesn't contain a track number", track);
            return;
        }

        const latencyFrames = audioContext.baseLatency + audioContext.outputLatency;

        setupRecordingWorkletNode({
            channels: 2,
            latencyFrames,
            sampleRate: audioContext.sampleRate,
            maxRecordingFrames: audioContext.sampleRate * 256,
        }).then((node) => {
            const recordButton = track.querySelector<HTMLButtonElement>(".track-record")!;
            const postGainNode = audioContext.createGain();

            // setup audio graph connection for each worklet node (InputBusNode -> AudioWorkletNode -> PostGainNode -> MasterBusNode)
            inputBusNode.connect(node);
            node.connect(postGainNode);
            postGainNode.connect(masterChannel.busNode);

            const trackId = Number(track.dataset.track);
            tracksState.set(trackId, {
                node,
                postGainNode,
                state: TrackState.IDLE,
                recordButton,
                countInBeatsLeft: 0,
            });

            node.port.start(); // start receiving messages from worker
            node.port.addEventListener("message", (event) => onTrackWorkletMessage(trackId, event));

            attachTrackEvents(track, trackId);
        }).catch((error) => console.error("Initializing Track Audio Processing Node failed:", error));
    });

    const onTrackWorkletMessage = (trackId: number, event: any) => {
        console.log("onTrackWorkletMessage message:", trackId, event);
        // if (event.data.event === "FREE_LOOP_SET") {
        //     const { loopDuration } = event.data;
        //     const newBPM = (60 / loopDuration) * 4;
        //     audioScheduler.setBPM(newBPM);
        //     audioScheduler.start();
        // }
    }

    const attachTrackEvents = (trackDiv: HTMLDivElement, trackId: number) => {
        const track = tracksState.get(trackId);
        if (!track) return;

        const trackMuteElement = trackDiv.querySelector<HTMLButtonElement>(".track-mute")!;
        const trackSoloElement = trackDiv.querySelector<HTMLButtonElement>(".track-solo")!;
        const trackClearElement = trackDiv.querySelector<HTMLButtonElement>(".track-clear")!;
        const trackMeasureElement = trackDiv.querySelector<HTMLSelectElement>(".track-measure .loop-length-select")!;
        const trackPlayElement = trackDiv.querySelector<HTMLButtonElement>(".track-play")!;
        const trackRecordElement = trackDiv.querySelector<HTMLButtonElement>(".track-record")!;
        const trackVolumeSlider = trackDiv.querySelector<HTMLInputElement>(".volume-slider")!;

        trackMuteElement.addEventListener("click", (event) => {
            console.log("track element click event:", event);
        });

        trackSoloElement.addEventListener("click", (event) => {
            console.log("track element click event:", event);
        });

        trackClearElement.addEventListener("click", () => {
            console.log("track element click event:");
            track.node.port.postMessage({
                command: TrackWorkletCommand.CLEAR
            });
            track.state = TrackState.IDLE;
            track.recordButton.classList.remove("recording", "overdub", "count-in", "count-in-active");
        });

        trackMeasureElement.addEventListener("change", (event) => {
            console.log("track element click event:", event);
        });

        trackPlayElement.addEventListener("click", (event) => {
            console.log("track element click event:", event);
        });

        trackRecordElement.addEventListener("click", () => {
            switch (track.state) {
                case TrackState.IDLE:
                    track.state = TrackState.COUNT_IN;
                    track.countInBeatsLeft = 4;
                    track.recordButton.classList.add("count-in");
                    break;
                case TrackState.COUNT_IN:
                    track.state = TrackState.PREPARE_REC;
                    track.countInBeatsLeft = 0;
                    track.recordButton.classList.remove("count-in");
                    break;
                case TrackState.RECORDING:
                    track.state = TrackState.PREPARE_PLAY;
                    break;
                case TrackState.PLAYING:
                    track.state = TrackState.PREPARE_DUB;
                    break;
                case TrackState.OVERDUBBING:
                    track.state = TrackState.PREPARE_PLAY;
                    break;
            }

            if (!audioScheduler.isPlaying()) {
                audioScheduler.start();
            }
        });

        trackVolumeSlider.addEventListener("input", () => {
            const volumeValue = Number(trackVolumeSlider.value);
            if (volumeValue < 0 || volumeValue > 3) {
                console.error("Track Volume Slider is out of range [0, 3]", volumeValue);
                return false;
            }

            track.postGainNode.gain.setValueAtTime(volumeValue, audioContext.currentTime);
        });
    }
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
    mono.setValue(inputMonoElement.checked);

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

function getInputNode(stream: MediaStream, audioContext: AudioContext) {
    const micInputSource = audioContext.createMediaStreamSource(stream);
    const inputNode = new InputNode(audioContext, "Mic");
    inputNode.receiveInput(micInputSource);
    return inputNode;
}

async function getUserAudioInput() {
    console.log("[getUserAudioInput]: Supported media-constraints: ", navigator.mediaDevices.getSupportedConstraints());

    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: audioContext.sampleRate,
            latency: 0,
        },
    };

    return navigator.mediaDevices.getUserMedia(constraints).catch(console.error);
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

function initializeInputPlugins(inputNode: InputNode, busNode: AudioNode) {
    const pluginChainElement = document.getElementById("plugin-chain")! as HTMLDivElement;
    const addPluginSelect = document.getElementById("add-plugin-select")! as HTMLSelectElement;
    const addPluginDiv = pluginChainElement.querySelector(".add-plugin")! as HTMLDivElement;

    let draggedItem: HTMLElement | null = null;

    reconnectInputChain();

    function reconnectInputChain() {
        if (!inputNode || !busNode) return;
        console.log("Disconnect all:", inputNode, busNode);

        // Disconnect all nodes
        inputNode.disconnect();
        inputPluginInstances.forEach((plugin) => plugin.disconnect());
        true
        const inputDOMPlugins = Array.from(pluginChainElement.children);
        const activePlugins: AudioPlugin[] = inputDOMPlugins
            .filter((el) => el.classList.contains("plugin") && !el.classList.contains("bypassed"))
            .map((el) => inputPluginInstances.get(el as HTMLElement))
            .filter((plugin): plugin is AudioPlugin => plugin !== undefined);

        let lastNode: AudioBaseNode = inputNode;
        for (const activePlugin of activePlugins) {
            lastNode.connect(activePlugin);
            lastNode = activePlugin;
        }
        lastNode.connect(busNode);
    }

    function buildPluginControlsUI(plugin: AudioPlugin, pluginType: string): HTMLElement {
        const isEqualizer = pluginType === "equalizer";

        const container = document.createElement("div");
        container.className = isEqualizer ? "eq-bands" : "plugin-controls";

        plugin.getParams().forEach((param) => {
            if (param.id === "bypass") return;

            const row = document.createElement("div");
            row.className = isEqualizer ? "eq-band" : "control-row";

            const label = document.createElement("label");
            label.textContent = param.name;

            let control: HTMLElement;

            if (param.type === "select" && param.options) {
                control = document.createElement("select");
                param.options.forEach(opt => {
                    const option = document.createElement("option");
                    option.value = opt.value;
                    option.textContent = opt.label;
                    control.appendChild(option);
                });
                (control as HTMLSelectElement).value = String(param.defaultValue ?? "");
                control.addEventListener("change", () => {
                    param.setValue((control as HTMLSelectElement).value);
                });
            } else {
                control = document.createElement("input");
                (control as HTMLInputElement).type = "range";
                if (param.min !== undefined) (control as HTMLInputElement).min = String(param.min);
                if (param.max !== undefined) (control as HTMLInputElement).max = String(param.max);
                if (param.step !== undefined) (control as HTMLInputElement).step = String(param.step);
                (control as HTMLInputElement).value = String(param.defaultValue);
                if (isEqualizer) {
                    control.setAttribute("dir", "rtl");
                }
                control.addEventListener("input", () => {
                    param.setValue(+(control as HTMLInputElement).value);
                });
            }

            if (isEqualizer) {
                row.appendChild(control);
                row.appendChild(label);
            } else {
                row.appendChild(label);
                row.appendChild(control);
            }

            container.appendChild(row);
        });

        return container;
    }

    function addPlugin(pluginType: string) {
        const pluginDef = PLUGINS.find(p => p.id === pluginType);
        if (!pluginDef) return;

        const plugin = pluginDef.getInstance(audioContext);

        const pluginEl = document.createElement("div");
        pluginEl.className = "plugin";
        pluginEl.dataset.plugin = pluginType;

        const pluginHeader = document.createElement("div");
        pluginHeader.className = "plugin-header";
        pluginHeader.innerHTML = `
            <span class="drag-handle" draggable="true">≡</span>
            <span class="plugin-name">${plugin.name}</span>
            <button class="bypass-btn">Bypass</button>
            <button class="remove-btn">×</button>
        `;

        const pluginContent = document.createElement("div");
        pluginContent.className = "plugin-content";
        pluginContent.appendChild(buildPluginControlsUI(plugin, pluginType));

        pluginEl.appendChild(pluginHeader);
        pluginEl.appendChild(pluginContent);

        pluginChainElement.insertBefore(pluginEl, addPluginDiv);
        inputPluginInstances.set(pluginEl, plugin);

        attachPluginEvents(pluginEl);
        reconnectInputChain();
    }

    function attachPluginEvents(pluginDiv: HTMLDivElement) {
        const dragHandle = pluginDiv.querySelector<HTMLDivElement>(".drag-handle")!;

        dragHandle.addEventListener("dragstart", handleDragStart);
        dragHandle.addEventListener("dragend", handleDragEnd);
        pluginDiv.addEventListener("dragover", handleDragOver);
        pluginDiv.addEventListener("dragenter", handleDragEnter);
        pluginDiv.addEventListener("dragleave", handleDragLeave);
        pluginDiv.addEventListener("drop", handleDrop);

        const bypassBtn = pluginDiv.querySelector<HTMLButtonElement>(".bypass-btn")!;

        bypassBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            pluginDiv.classList.toggle("bypassed");
            bypassBtn.classList.toggle("active");
            bypassBtn.textContent = pluginDiv.classList.contains("bypassed") ? "On" : "Bypass";

            const isBypassed = pluginDiv.classList.contains("bypassed");
            const pluginInstance = inputPluginInstances.get(pluginDiv);
            if (pluginInstance) {
                const bypassParam = pluginInstance.getParams().find((param) => param.id === "bypass");
                if (bypassParam) {
                    bypassParam.setValue(isBypassed);
                }
            }
        });

        const removeBtn = pluginDiv.querySelector<HTMLButtonElement>(".remove-btn")!;
        removeBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            inputPluginInstances.delete(pluginDiv);
            pluginDiv.remove();
            reconnectInputChain();
        });
    }

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
        reconnectInputChain();
    }

    addPluginSelect.addEventListener("change", function() {
        const pluginType = this.value;
        if (!pluginType) return;

        addPlugin(pluginType);
        this.value = "";
    });
}
