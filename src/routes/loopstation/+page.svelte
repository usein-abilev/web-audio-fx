<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { AudioScheduler } from "$lib/audio/clock";
    import PLUGINS from "$lib/audio/plugins/index";
    import type { AudioPlugin } from "$lib/audio/plugins/plugin";
    import { playMetronome } from "$lib/audio/metronome";

    const TRACK_COUNT = 5;
    const COUNT_IN_BEATS = 4;

    const TrackState = {
        IDLE: "IDLE",
        COUNT_IN: "COUNT_IN",
        PREPARE_REC: "PREPARE_REC",
        RECORDING: "RECORDING",
        PREPARE_PLAY: "PREPARE_PLAY",
        PLAYING: "PLAYING",
        PREPARE_DUB: "PREPARE_DUB",
        OVERDUBBING: "OVERDUBBING",
    } as const;

    type TrackState = (typeof TrackState)[keyof typeof TrackState];

    const WorkletCommand = {
        START_RECORDING: "START_RECORDING",
        STOP_RECORDING: "STOP_RECORDING",
        START_OVERDUB: "START_OVERDUB",
        CLEAR: "CLEAR",
    } as const;

    let initialized = false;
    let micAllowed = false;

    let audioCtx: AudioContext | null = null;
    let scheduler: AudioScheduler | null = null;
    let inputBusNode: GainNode | null = null;
    let masterBusNode: GainNode | null = null;
    let inputNode: GainNode | null = null;

    const trackNodes = new Map<number, { worklet: AudioWorkletNode; postGain: GainNode }>();
    const trackStates = new Map<number, TrackState>();
    const countInBeatsLeft = new Map<number, number>();
    const inputPluginInstances: AudioPlugin[] = [];
    const pluginElements: HTMLElement[] = [];

    let bpm = $state(80);
    let metronomeOn = $state(false);
    let monitoringOn = $state(false);
    let playing = $state(false);
    let countInFlashing = $state(new Set<number>());

    let tracks = $state(
        Array.from({ length: TRACK_COUNT }, (_, i) => ({
            id: i + 1,
            name: `Track ${i + 1}`,
            state: TrackState.IDLE,
            recording: false,
            overdubbing: false,
            playing: false,
            volume: 1,
            loopLength: "4",
        })),
    );

    let pluginCount = $state(0);

    let pluginChainEl: HTMLDivElement;
    let addPluginSelectEl: HTMLSelectElement;

    let draggedItem: HTMLElement | null = null;

    onMount(() => {
        document.addEventListener("click", initAudio, { once: true });
    });

    onDestroy(() => {
        audioCtx?.close();
    });

    async function initAudio() {
        if (initialized) return;
        initialized = true;

        audioCtx = new AudioContext({ latencyHint: "interactive", sampleRate: 44100 });

        masterBusNode = audioCtx.createGain();
        masterBusNode.connect(audioCtx.destination);

        inputBusNode = audioCtx.createGain();

        scheduler = new AudioScheduler(audioCtx, {
            bpm,
            timeSignature: [4, 4],
            onTick: onSchedulerTick,
        });

        const stream = await navigator.mediaDevices
            .getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 1,
                    sampleRate: audioCtx.sampleRate,
                    latency: 0,
                },
            })
            .catch(() => null);

        if (!stream) {
            console.error("Microphone access denied");
            return;
        }

        micAllowed = true;

        const micSource = audioCtx.createMediaStreamSource(stream);
        inputNode = audioCtx.createGain();
        inputNode.gain.value = 1;
        micSource.connect(inputNode);
        inputNode.connect(inputBusNode);

        for (let i = 0; i < TRACK_COUNT; i++) {
            await initTrack(i + 1);
        }

        scheduler.setBPM(bpm);
        scheduler.reset();
    }

    async function initTrack(trackId: number) {
        if (!audioCtx || !inputBusNode || !masterBusNode) return;

        const latencyFrames = audioCtx.baseLatency + audioCtx.outputLatency;
        const worklet = await setupWorkletNode({
            channels: 2,
            latencyFrames,
            sampleRate: audioCtx.sampleRate,
            maxRecordingFrames: audioCtx.sampleRate * 256,
        });

        const postGain = audioCtx.createGain();
        inputBusNode.connect(worklet);
        worklet.connect(postGain);
        postGain.connect(masterBusNode);

        trackNodes.set(trackId, { worklet, postGain });
        trackStates.set(trackId, TrackState.IDLE);
        countInBeatsLeft.set(trackId, 0);

        worklet.port.start();
    }

    function onSchedulerTick(beat: number, time: number) {
        if (metronomeOn) {
            playMetronome(audioCtx!, beat, time);
        }

        const flashing = new Set<number>();

        for (let i = 0; i < TRACK_COUNT; i++) {
            const trackId = i + 1;
            const state = trackStates.get(trackId);

            if (state === TrackState.COUNT_IN) {
                const left = (countInBeatsLeft.get(trackId) ?? 0) - 1;
                countInBeatsLeft.set(trackId, left);
                flashing.add(trackId);
                if (left <= 0) {
                    trackStates.set(trackId, TrackState.PREPARE_REC);
                    countInBeatsLeft.set(trackId, 0);
                }
            }

            if (beat === 0) {
                if (state === TrackState.PREPARE_REC) {
                    trackNodes
                        .get(trackId)
                        ?.worklet.port.postMessage({ command: WorkletCommand.START_RECORDING, time });
                    trackStates.set(trackId, TrackState.RECORDING);
                } else if (state === TrackState.PREPARE_PLAY) {
                    trackNodes.get(trackId)?.worklet.port.postMessage({ command: WorkletCommand.STOP_RECORDING, time });
                    trackStates.set(trackId, TrackState.PLAYING);
                } else if (state === TrackState.PREPARE_DUB) {
                    trackNodes.get(trackId)?.worklet.port.postMessage({ command: WorkletCommand.START_OVERDUB, time });
                    trackStates.set(trackId, TrackState.OVERDUBBING);
                }
            }
        }

        countInFlashing = flashing;

        tracks = tracks.map((t) => {
            const s = trackStates.get(t.id);
            return {
                ...t,
                recording: s === TrackState.RECORDING,
                overdubbing: s === TrackState.OVERDUBBING,
                playing: s === TrackState.PLAYING || s === TrackState.OVERDUBBING,
            };
        });
    }

    function handlePlay() {
        if (!initialized) {
            initAudio().then(() => {
                playing = true;
                scheduler?.start();
            });
            return;
        }
        playing = true;
        scheduler?.start();
    }

    function handleStop() {
        playing = false;
        scheduler?.stop();
    }

    function handleBpmChange(e: Event) {
        const v = +(e.target as HTMLInputElement).value;
        if (v >= 20 && v <= 250) {
            bpm = v;
            scheduler?.setBPM(v);
        }
    }

    function handleRecord(trackId: number) {
        if (!initialized) {
            initAudio().then(() => doRecord(trackId));
            return;
        }
        doRecord(trackId);
    }

    function doRecord(trackId: number) {
        const state = trackStates.get(trackId);
        switch (state) {
            case TrackState.IDLE:
                trackStates.set(trackId, TrackState.COUNT_IN);
                countInBeatsLeft.set(trackId, COUNT_IN_BEATS);
                break;
            case TrackState.COUNT_IN:
                trackStates.set(trackId, TrackState.PREPARE_REC);
                countInBeatsLeft.set(trackId, 0);
                break;
            case TrackState.RECORDING:
                trackStates.set(trackId, TrackState.PREPARE_PLAY);
                break;
            case TrackState.PLAYING:
                trackStates.set(trackId, TrackState.PREPARE_DUB);
                break;
            case TrackState.OVERDUBBING:
                trackStates.set(trackId, TrackState.PREPARE_PLAY);
                break;
        }

        if (!playing) {
            playing = true;
            scheduler?.start();
        }
    }

    function handleClear(trackId: number) {
        trackNodes.get(trackId)?.worklet.port.postMessage({ command: WorkletCommand.CLEAR });
        trackStates.set(trackId, TrackState.IDLE);
        countInBeatsLeft.set(trackId, 0);

        tracks = tracks.map((t) =>
            t.id === trackId ? { ...t, recording: false, overdubbing: false, playing: false } : t,
        );
    }

    function handleVolume(trackId: number, e: Event) {
        const v = +(e.target as HTMLInputElement).value;
        const node = trackNodes.get(trackId);
        if (node && audioCtx) {
            node.postGain.gain.setValueAtTime(v, audioCtx.currentTime);
        }
        tracks = tracks.map((t) => (t.id === trackId ? { ...t, volume: v } : t));
    }

    function handleInputGain(e: Event) {
        const v = +(e.target as HTMLInputElement).value;
        if (inputNode && audioCtx) {
            inputNode.gain.setValueAtTime(v, audioCtx.currentTime);
        }
    }

    function handleInputPan(e: Event) {
        if (!audioCtx || !inputNode) return;
        const v = +(e.target as HTMLInputElement).value;
        const pan = audioCtx.createStereoPanner();
        pan.pan.value = v;
        inputNode.disconnect();
        inputNode.connect(pan);
        pan.connect(inputBusNode!);
    }

    function handleInputMono(e: Event) {
        if (!inputNode) return;
        const checked = (e.target as HTMLInputElement).checked;
        inputNode.channelCount = checked ? 1 : 2;
    }

    function handleMonitoring(e: Event) {
        monitoringOn = (e.target as HTMLInputElement).checked;
        if (!inputBusNode || !audioCtx) return;
        if (monitoringOn) {
            inputBusNode.connect(audioCtx.destination);
        } else {
            inputBusNode.disconnect(audioCtx.destination);
        }
    }

    function reconnectInputChain() {
        if (!inputNode || !inputBusNode) return;

        inputNode.disconnect();
        for (const p of inputPluginInstances) p.disconnect();

        const active = inputPluginInstances.filter((p) => {
            const bypass = p.getParams().find((pr) => pr.id === "bypass");
            return bypass ? !bypass.getValue() : true;
        });

        let last: AudioNode = inputNode;
        for (const p of active) {
            last.connect(p);
            last = p;
        }
        last.connect(inputBusNode);
    }

    function handleAddPlugin(e: Event) {
        if (!audioCtx) return;
        const select = e.target as HTMLSelectElement;
        const id = select.value;
        if (!id) return;

        const def = PLUGINS.find((p) => p.id === id);
        if (!def) return;

        const plugin = def.getInstance(audioCtx);
        inputPluginInstances.push(plugin);

        const el = buildPluginUI(plugin, id);
        pluginChainEl.insertBefore(el, pluginChainEl.querySelector(".add-plugin"));
        pluginElements.push(el);
        pluginCount++;
        reconnectInputChain();

        select.value = "";
    }

    function buildPluginUI(plugin: AudioPlugin, pluginType: string): HTMLDivElement {
        const isEq = pluginType === "equalizer";

        const el = document.createElement("div");
        el.className = "plugin";
        el.dataset.plugin = pluginType;

        el.innerHTML = `
            <div class="plugin-header">
                <span class="drag-handle" draggable="true">≡</span>
                <span class="plugin-name">${plugin.name}</span>
                <button class="bypass-btn">Bypass</button>
                <button class="remove-btn">×</button>
            </div>
            <div class="plugin-content"></div>
        `;

        const content = el.querySelector(".plugin-content")!;
        content.appendChild(buildPluginControls(plugin, isEq));

        el.querySelector(".drag-handle")!.addEventListener("dragstart", (e: DragEvent) => {
            draggedItem = el;
            el.classList.add("dragging");
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", "");
            }
        });

        el.querySelector(".drag-handle")!.addEventListener("dragend", () => {
            el.classList.remove("dragging");
            pluginElements.forEach((p) => p.classList.remove("drag-over"));
            draggedItem = null;
        });

        el.addEventListener("dragover", (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        });

        el.addEventListener("dragenter", (e: Event) => {
            e.preventDefault();
            if (el !== draggedItem) el.classList.add("drag-over");
        });

        el.addEventListener("dragleave", () => {
            el.classList.remove("drag-over");
        });

        el.addEventListener("drop", (e: DragEvent) => {
            e.preventDefault();
            el.classList.remove("drag-over");
            if (draggedItem && draggedItem !== el) {
                const from = pluginElements.indexOf(draggedItem);
                const to = pluginElements.indexOf(el);
                if (from < to) {
                    pluginChainEl.insertBefore(draggedItem, el.nextSibling);
                } else {
                    pluginChainEl.insertBefore(draggedItem, el);
                }
                const instFrom = inputPluginInstances[from];
                inputPluginInstances.splice(from, 1);
                inputPluginInstances.splice(to, 0, instFrom);
                pluginElements.splice(from, 1);
                pluginElements.splice(to, 0, draggedItem);
                reconnectInputChain();
            }
            draggedItem = null;
        });

        el.querySelector(".bypass-btn")!.addEventListener("click", (e: Event) => {
            e.stopPropagation();
            el.classList.toggle("bypassed");
            const btn = el.querySelector(".bypass-btn")!;
            btn.classList.toggle("active");
            btn.textContent = el.classList.contains("bypassed") ? "On" : "Bypass";
            const bypass = plugin.getParams().find((p) => p.id === "bypass");
            if (bypass) bypass.setValue(el.classList.contains("bypassed"));
            reconnectInputChain();
        });

        el.querySelector(".remove-btn")!.addEventListener("click", (e: Event) => {
            e.stopPropagation();
            const idx = pluginElements.indexOf(el);
            if (idx !== -1) {
                inputPluginInstances.splice(idx, 1);
                pluginElements.splice(idx, 1);
            }
            el.remove();
            pluginCount--;
            reconnectInputChain();
        });

        return el;
    }

    function buildPluginControls(plugin: AudioPlugin, isEq: boolean): HTMLDivElement {
        const container = document.createElement("div");
        container.className = isEq ? "eq-bands" : "plugin-controls";

        for (const param of plugin.getParams()) {
            if (param.id === "bypass") continue;

            const row = document.createElement("div");
            row.className = isEq ? "eq-band" : "control-row";

            const label = document.createElement("label");
            label.textContent = param.name;

            let control: HTMLElement;

            if (param.type === "select" && param.options) {
                control = document.createElement("select");
                for (const opt of param.options) {
                    const option = document.createElement("option");
                    option.value = opt.value;
                    option.textContent = opt.label;
                    control.appendChild(option);
                }
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
                if (isEq) control.setAttribute("dir", "rtl");
                control.addEventListener("input", () => {
                    param.setValue(+(control as HTMLInputElement).value);
                });
            }

            if (isEq) {
                row.appendChild(control);
                row.appendChild(label);
            } else {
                row.appendChild(label);
                row.appendChild(control);
            }

            container.appendChild(row);
        }

        return container;
    }

    async function setupWorkletNode(options: unknown) {
        await audioCtx!.audioWorklet.addModule("/processors/recording.processor.js");
        return new AudioWorkletNode(audioCtx!, "recording-processor", {
            processorOptions: options,
        });
    }
</script>

<div class="loopstation">
    <header>
        <div class="header-controls">
            <label>
                Tempo:
                <input type="number" value={bpm} min="20" max="250" oninput={handleBpmChange} />
            </label>
            <label>
                Metronome:
                <input type="checkbox" checked={metronomeOn} onchange={(e) => (metronomeOn = e.target.checked)} />
            </label>
            <label>
                Input Monitoring:
                <input type="checkbox" checked={monitoringOn} onchange={handleMonitoring} />
            </label>
            <div class="master-controls">
                <button class="play-all" onclick={handlePlay} disabled={playing}>▶</button>
                <button class="stop-all" onclick={handleStop} disabled={!playing}>■</button>
            </div>
            {#if !micAllowed}
                <span class="mic-hint">Click anywhere to enable microphone</span>
            {/if}
        </div>
    </header>

    <hr />

    <section class="input-sections">
        <div class="section-header">
            <div class="title">Input FX Chain</div>
        </div>
        <div class="fx-chain-container">
            <div class="input-controls">
                <div class="control-group">
                    <label>Input</label>
                    <input type="range" min="0" max="3" step="0.1" value="1" oninput={handleInputGain} />
                </div>
                <div class="control-group">
                    <label>Pan</label>
                    <input type="range" min="-1" max="1" step="0.1" value="0" oninput={handleInputPan} />
                </div>
                <div class="control-group mono-control">
                    <input type="checkbox" checked onchange={handleInputMono} />
                    <label>Mono</label>
                </div>
            </div>

            <div class="plugin-chain" bind:this={pluginChainEl}>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="add-plugin">
                    <select bind:this={addPluginSelectEl} onchange={handleAddPlugin}>
                        <option value="">+ Add Plugin</option>
                        {#each PLUGINS as p (p.id)}
                            <option value={p.id}>{p.name}</option>
                        {/each}
                    </select>
                </div>
            </div>
        </div>
    </section>

    <hr />

    <section class="tracks-section">
        {#each tracks as track (track.id)}
            <div class="track">
                <div class="track-header">
                    <div class="track-name">{track.name}</div>
                    <button class="track-mute">M</button>
                    <button class="track-solo">S</button>
                    <button class="track-clear" onclick={() => handleClear(track.id)}>C</button>
                </div>
                <div class="track-content">
                    <div class="track-measure">
                        <select class="loop-length-select">
                            <option value="free">FREE</option>
                            <option value="1/4">1/4</option>
                            <option value="2/4">2/4</option>
                            <option value="1">1 bar</option>
                            <option value="2">2 bar</option>
                            <option value="4">4 bar</option>
                        </select>
                    </div>
                    <div class="track-buttons">
                        <button
                            class="track-record"
                            class:recording={track.recording}
                            class:overdub={track.overdubbing}
                            class:count-in={countInFlashing.has(track.id)}
                            title="Record"
                            onclick={() => handleRecord(track.id)}
                        >
                            ●
                        </button>
                        <button class="track-play" class:active={track.playing} title="Play">▶</button>
                    </div>
                    <div class="track-volume">
                        <label>Volume</label>
                        <input
                            type="range"
                            class="volume-slider"
                            min="0"
                            max="3"
                            step="0.1"
                            value={track.volume}
                            oninput={(e) => handleVolume(track.id, e)}
                        />
                    </div>
                </div>
            </div>
        {/each}
    </section>
</div>

<style>
    .loopstation {
        padding: 16px;
    }

    .loopstation :global(*) {
        font-family: "Arial", sans-serif;
        box-sizing: border-box;
    }

    :global(header) {
        display: flex;
        gap: 28px;
        align-items: center;
        padding: 8px 0;
    }

    .header-controls {
        display: flex;
        gap: 20px;
        align-items: center;
        flex-wrap: wrap;
    }

    .header-controls label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #555;
    }

    .header-controls input[type="number"] {
        width: 60px;
        padding: 4px;
        font-size: 12px;
        border: 1px solid #999;
        border-radius: 4px;
    }

    .header-controls input[type="checkbox"] {
        cursor: pointer;
    }

    .master-controls {
        display: flex;
        gap: 4px;
    }

    .master-controls button {
        padding: 4px 10px;
        font-size: 11px;
        font-weight: bold;
        border: 1px solid #999;
        background: #eee;
        border-radius: 4px;
        cursor: pointer;
    }

    .master-controls button:hover:not(:disabled) {
        background: #ddd;
    }

    .master-controls button:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .mic-hint {
        font-size: 11px;
        color: #999;
        font-style: italic;
    }

    hr {
        border: none;
        border-top: 1px solid #ccc;
        margin: 8px 0;
    }

    .section-header {
        padding-bottom: 10px;
    }

    .section-header .title {
        font-size: 14px;
        font-weight: bold;
        color: #333;
    }

    .fx-chain-container {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        overflow-x: auto;
        background: #e0e0e0;
        border: 1px solid #888;
        min-height: 120px;
        border-radius: 4px;
    }

    .input-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
        background: #ccc;
        border-radius: 6px;
        min-width: 100px;
    }

    .input-controls label {
        font-size: 11px;
        font-weight: bold;
        color: #333;
        display: block;
        margin-bottom: 2px;
    }

    .input-controls input[type="range"] {
        width: 80px;
        height: 6px;
        -webkit-appearance: none;
        background: #999;
        border-radius: 3px;
        outline: none;
    }

    .input-controls input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        background: #555;
        border-radius: 50%;
        cursor: pointer;
    }

    .mono-control {
        display: flex;
        gap: 4px;
        align-items: center;
        font-size: 12px;
    }

    .plugin-chain {
        display: flex;
        gap: 10px;
        align-items: flex-start;
    }

    :global(.plugin) {
        background: #f5f5f5;
        border: 1px solid #666;
        border-radius: 6px;
        min-width: 160px;
        transition:
            opacity 0.2s,
            transform 0.2s;
    }

    :global(.plugin.dragging) {
        opacity: 0.4;
    }

    :global(.plugin.drag-over) {
        border-color: #2196f3;
        background: #e3f2fd;
    }

    :global(.plugin.bypassed) {
        opacity: 0.5;
    }

    :global(.plugin-header) {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        background: #ddd;
        border-bottom: 1px solid #aaa;
        border-radius: 5px 5px 0 0;
    }

    :global(.drag-handle) {
        font-size: 14px;
        color: #666;
        cursor: grab;
        padding: 0 2px;
    }

    :global(.drag-handle:active) {
        cursor: grabbing;
    }

    :global(.plugin-name) {
        flex: 1;
        font-size: 12px;
        font-weight: bold;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    :global(.bypass-btn),
    :global(.remove-btn) {
        padding: 2px 6px;
        font-size: 10px;
        border: 1px solid #999;
        background: #eee;
        border-radius: 3px;
        cursor: pointer;
    }

    :global(.bypass-btn:hover),
    :global(.remove-btn:hover) {
        background: #ddd;
    }

    :global(.bypass-btn.active) {
        background: #ff9800;
        color: white;
        border-color: #e65100;
    }

    :global(.plugin-content) {
        padding: 8px;
    }

    :global(.eq-bands) {
        display: flex;
        gap: 4px;
        justify-content: space-between;
    }

    :global(.eq-band) {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }

    :global(.eq-band input[type="range"]) {
        width: 4px;
        height: 50px;
        -webkit-appearance: none;
        background: #ccc;
        border-radius: 3px;
        writing-mode: vertical-lr;
    }

    :global(.eq-band input[type="range"]::-webkit-slider-thumb) {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        background: #555;
        border-radius: 50%;
        cursor: pointer;
    }

    :global(.eq-band label) {
        font-size: 9px;
        color: #666;
    }

    :global(.plugin-controls) {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    :global(.control-row) {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    :global(.control-row label) {
        font-size: 10px;
        width: 40px;
        color: #555;
    }

    :global(.control-row input[type="range"]) {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        background: #ccc;
        border-radius: 2px;
    }

    :global(.control-row input[type="range"]::-webkit-slider-thumb) {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        background: #555;
        border-radius: 50%;
        cursor: pointer;
    }

    .add-plugin {
        min-width: 100px;
        padding: 8px;
        background: #d0d0d0;
        border: 1px dashed #888;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .add-plugin select {
        font-size: 12px;
        padding: 4px;
        border: 1px solid #999;
        border-radius: 4px;
        background: white;
        cursor: pointer;
    }

    .tracks-section {
        margin-top: 10px;
        display: flex;
        gap: 10px;
        padding: 10px;
        border: 1px solid #888;
        background: #eee;
        overflow-x: auto;
        border-radius: 4px;
    }

    .track {
        background: #f5f5f5;
        border: 1px solid #666;
        border-radius: 6px;
        width: 100%;
        min-width: 250px;
        display: flex;
        flex-direction: column;
    }

    .track-header {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px;
        background: #ddd;
        border-bottom: 1px solid #aaa;
        border-radius: 5px 5px 0 0;
    }

    .track-name {
        flex: 1;
        font-size: 11px;
        font-weight: bold;
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .track-mute,
    .track-solo,
    .track-clear {
        padding: 2px 5px;
        font-size: 9px;
        font-weight: bold;
        border: 1px solid #999;
        background: #eee;
        border-radius: 3px;
        cursor: pointer;
        min-width: 18px;
    }

    .track-mute:hover,
    .track-solo:hover,
    .track-clear:hover {
        background: #ddd;
    }

    .track-content {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .track-measure {
        text-align: center;
    }

    .track-measure select {
        font-size: 9px;
        padding: 2px;
        width: 100%;
    }

    .track-buttons {
        display: flex;
        justify-content: center;
        gap: 6px;
    }

    .track-record,
    .track-play {
        width: 28px;
        height: 28px;
        border: 1px solid #999;
        border-radius: 50%;
        background: #eee;
        cursor: pointer;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .track-record:hover,
    .track-play:hover {
        background: #ddd;
    }

    .track-record.recording {
        background: #f44336;
        color: white;
        border-color: #d32f2f;
    }

    .track-record.overdub {
        background: #ffc107;
        color: #333;
        border-color: #ffa000;
    }

    .track-record.count-in {
        animation: countInPulse 0.25s ease-in-out infinite;
    }

    @keyframes countInPulse {
        0%,
        100% {
            background: #eee;
        }
        50% {
            background: #ff9800;
        }
    }

    .track-play.active {
        background: #4caf50;
        color: white;
        border-color: #388e3c;
    }

    .track-volume {
        padding-top: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .track-volume label {
        font-size: 11px;
        color: #333;
    }

    .track-volume input[type="range"] {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        background: #ccc;
        border-radius: 2px;
    }

    .track-volume input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        background: #555;
        border-radius: 50%;
        cursor: pointer;
    }
</style>
