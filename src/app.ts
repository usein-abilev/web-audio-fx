import { validateAudioFile } from "./utils/file";
import { createVolumeMeter } from "./meter"
import { initGraph } from "./graph"
import { Equalizer7BandPlugin } from "./plugins/eq";
import { ReverbPlugin } from "./plugins/reverb";
import { DelayPlugin } from "./plugins/delay";
import { CompressorPlugin } from "./plugins/compressor";
import { formatTime } from "./utils";

const AUDIO_SAMPLE_RATE = 44_100; // 48kHz
const AUDIO_CONTEXT_OPTIONS: AudioContextOptions = {
    sampleRate: AUDIO_SAMPLE_RATE,
}

type PlaybackState = {
    startedTime: number;
};

const state = {
    recording: false,
    playback: null as PlaybackState | null,

    /**
     * Last playback offset in seconds to resume from.
     * Updates every time when user stops the audio playback to know where to resume playback
     */
    playbackOffsetSeconds: 0,

    /**
     * Contains data on currently selected area of the sample
     */
    selection: {
        selected: false,
        selecting: false,
        /** start index of the current audio buffer */
        start: 0,
        /** end index of the current audio buffer */
        end: 0,
    },

    /**
     * Root audio context (only one instance), responsible for audio processing graph, etc.
     */
    audioContext: new AudioContext(AUDIO_CONTEXT_OPTIONS),

    /**
     * Current unprocessed sample audio buffer converted using AudioContext.decodeAudioData
     */
    rawAudioBuffer: null as AudioBuffer | null,
    sourceNode: null as AudioBufferSourceNode | null,

    currentFile: null as File | null,
};

const KEYBOARD_BINDS = {
    PLAY: "Space",
    RECORD: "R",
};

const PLUGINS = [
    {
        id: "reverb",
        name: "Reverb",
        getInstance: (actx: AudioContext) => new ReverbPlugin(actx),
    },
    {
        id: "equalizer",
        name: "EQ (7 Band)",
        getInstance: (actx: AudioContext) => new Equalizer7BandPlugin(actx),
    },
    {
        id: "delay",
        name: "Delay",
        getInstance: (actx: AudioContext) => new DelayPlugin(actx),
    },
    {
        id: "compressor",
        name: "Compressor",
        getInstance: (actx: AudioContext) => new CompressorPlugin(actx),
    },
];

const getPlaybackSeconds = (): number => {
    const elapsed = (state.playback ? state.audioContext.currentTime - state.playback.startedTime : 0);
    return elapsed + state.playbackOffsetSeconds;
}

window.addEventListener("load", async () => {
    const loadSampleButton = document.getElementById("load-sample")!;
    const sampleFileInput = document.getElementById("sample-file-input")! as HTMLInputElement;

    const loopCheckbox = document.getElementById("loop-playback")!;
    const recordButton = document.getElementById("record")!;
    const playButton = document.getElementById("play")!;
    const pluginSelector = document.getElementById("add-plugin-select")! as HTMLSelectElement;

    const canvas = document.querySelector("canvas")!;
    const canvasContext = canvas.getContext("2d")!;

    const volumeMeter = createVolumeMeter(state.audioContext);

    const graph = initGraph({
        audioContext: state.audioContext,
        onUpdate: (graph) => console.log("Audio Graph Updated!", graph),
    });

    // Initialize Plugin List Selector
    (() => {
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
            graph.addPlugin(plugin.getInstance(state.audioContext));
            pluginSelector.value = "";
        });
    })();

    let cursorOffsetX = 0; // set on mouse move event
    let scaleCursorOffsetX = 0; // set on mouse wheel event
    let sampleScale = 1; // sample zoom factor

    let renderedSampleCanvas: HTMLCanvasElement | null = null;

    const positionToSampleIndex = (mouseX: number): number => {
        if (!state.rawAudioBuffer) return 0;
        const normIndex = (mouseX - scaleCursorOffsetX) / (canvas.width * sampleScale);
        const idx = normIndex * state.rawAudioBuffer.length;
        return Math.round(idx);
    };

    const updatePlayTextButton = () => {
        playButton.innerText = (state.playback ? "Pause" : "Play") + ` (${KEYBOARD_BINDS.PLAY})`;
    };

    const calculatePlaybackOffset = (played: number) => {
        if (!state.sourceNode) return 0;

        let newOffset = state.playbackOffsetSeconds + played;

        if (state.sourceNode.loop) {
            if (state.selection.selected) {
                const duration = state.sourceNode.loopEnd - state.sourceNode.loopStart;
                const offsetInLoop = ((newOffset - state.sourceNode.loopStart) % duration) + duration % duration;
                newOffset = state.sourceNode.loopStart + offsetInLoop;
            } else {
                newOffset %= state.rawAudioBuffer!.duration;
            }
        }

        return newOffset;
    }

    const pauseAudio = () => {
        if (!state.playback) return false;
        if (state.sourceNode) {
            const played = state.audioContext.currentTime - state.playback.startedTime;
            state.playbackOffsetSeconds = calculatePlaybackOffset(played);

            state.sourceNode.onended = null;
            state.sourceNode.stop();
            state.sourceNode.disconnect();
            state.sourceNode = null;
            console.log("Pause! Played seconds: (%f sec, offset = %f sec)", played, state.playbackOffsetSeconds, state.rawAudioBuffer!.duration);
        }
        state.playback = null;
        updatePlayTextButton();
    };

    const playAudio = () => {
        if (state.playback) return;
        if (!state.rawAudioBuffer) {
            console.log("Cannot play audio without audio buffer", state);
            return;
        }

        const { length: bufferSize, duration: bufferDuration } = state.rawAudioBuffer!;
        const loopStart = (state.selection.start / bufferSize) * bufferDuration;
        const loopEnd = (state.selection.end / bufferSize) * bufferDuration;

        state.sourceNode = state.audioContext.createBufferSource();
        state.sourceNode.buffer = state.rawAudioBuffer;
        state.sourceNode.loop = (loopCheckbox as HTMLInputElement).checked;
        state.sourceNode.playbackRate.value = 1;
        state.sourceNode.loopStart = Math.min(loopStart, loopEnd);
        state.sourceNode.loopEnd = Math.max(loopStart, loopEnd);

        graph.apply(state.sourceNode, state.audioContext.destination);
        graph.analyze(volumeMeter.connect);

        state.sourceNode.onended = (event) => {
            if (state.playback) {
                console.log("Playback ended event", { event, state });
                state.playback = null;
                state.playbackOffsetSeconds = state.selection.selected ? Math.min(loopStart, loopEnd) : 0;
                state.sourceNode?.stop();
                state.sourceNode?.disconnect();
                state.sourceNode = null;
                updatePlayTextButton();
            }
        };

        let duration: number = 0;
        if (state.selection.selected) {
            const start = state.sourceNode.loop ? state.sourceNode.loopStart : state.playbackOffsetSeconds;
            duration = state.sourceNode.loopEnd - start;
        }

        state.sourceNode.start(
            0,
            state.playbackOffsetSeconds,
            state.selection.selected && !state.sourceNode.loop ? duration : undefined
        );
        state.playback = {
            startedTime: state.audioContext.currentTime,
        };
        updatePlayTextButton();
    };

    const updateAudioBuffer = (buffer: AudioBuffer) => {
        pauseAudio();
        sampleScale = 1;
        scaleCursorOffsetX = 0;
        cursorOffsetX = 0;
        state.rawAudioBuffer = buffer;
        renderedSampleCanvas = null;
    }

    const renderSampleWaves = (): HTMLCanvasElement => {
        const localCanvas = document.createElement("canvas");
        localCanvas.width = canvas.width;
        localCanvas.height = canvas.height;
        const ctx = localCanvas.getContext("2d")!;

        if (!state.rawAudioBuffer) return localCanvas;

        const channelBuffer = state.rawAudioBuffer.getChannelData(0);

        const scaledWidth = canvas.width * sampleScale;
        const totalSamples = channelBuffer.length;
        const samplePerPixel = Math.ceil(totalSamples / scaledWidth);

        ctx.beginPath();
        const middleY = canvas.height / 2;
        for (let x = 0; x < canvas.width; x++) {
            const start = Math.floor(((x - scaleCursorOffsetX) / scaledWidth) * totalSamples);
            const end = Math.min(totalSamples, start + samplePerPixel);
            let min = 1;
            let max = -1;
            for (let i = start; i < end && i < channelBuffer.length; i++) {
                const sample = channelBuffer[i];
                if (sample > max) max = sample;
                if (sample < min) min = sample;
            }

            ctx.moveTo(x, (1 + min) * middleY);
            ctx.lineTo(x, (1 + max) * middleY);
        }
        ctx.closePath();
        ctx.strokeStyle = "rgba(126, 36, 128, 1)"
        ctx.stroke();

        return localCanvas;
    };

    let prevTimestamp = 0;
    const renderCanvas = (timestamp: number) => {
        if (!prevTimestamp) {
            prevTimestamp = timestamp;
            return requestAnimationFrame(renderCanvas);
        }

        const deltaTime = (timestamp - prevTimestamp) / 1000;
        prevTimestamp = timestamp;

        if (!state.rawAudioBuffer) {
            return requestAnimationFrame(renderCanvas);
        }

        const waveform = state.rawAudioBuffer!;

        canvasContext.clearRect(0, 0, canvas.width, canvas.height);

        // caching already drawn canvas
        renderedSampleCanvas ??= renderSampleWaves();
        canvasContext.drawImage(renderedSampleCanvas, 0, 0);

        const scaledWidth = canvas.width * sampleScale;

        // draw cursor line
        canvasContext.beginPath();
        canvasContext.moveTo(cursorOffsetX, 0);
        canvasContext.lineTo(cursorOffsetX, canvas.height);
        canvasContext.closePath();
        canvasContext.strokeStyle = "#6d6d6d44";
        canvasContext.stroke();

        // draw selection area
        if (state.selection.selecting || state.selection.selected) {
            const start = (state.selection.start / waveform.length) * scaledWidth + scaleCursorOffsetX;
            const end = (state.selection.end / waveform.length) * scaledWidth + scaleCursorOffsetX;

            canvasContext.fillStyle = "rgba(67, 140, 235, 0.5)";
            canvasContext.fillRect(start, 0, end - start, canvas.height);

            // draw start line
            canvasContext.beginPath();
            canvasContext.moveTo(start, 0);
            canvasContext.lineTo(start, canvas.height);
            canvasContext.closePath();
            canvasContext.lineWidth = 2;
            canvasContext.strokeStyle = "rgba(67, 140, 235, 1)";
            canvasContext.stroke();

            // draw end line
            canvasContext.beginPath();
            canvasContext.moveTo(end, 0);
            canvasContext.lineTo(end, canvas.height);
            canvasContext.closePath();
            canvasContext.lineWidth = 2;
            canvasContext.strokeStyle = "rgba(67, 140, 235, 1)";
            canvasContext.stroke();
        }

        // draw playback cursor
        if (state.playback && state.sourceNode) {
            const elapsed = state.audioContext.currentTime - state.playback.startedTime;
            const playbackOffset = calculatePlaybackOffset(elapsed);
            const playbackOffsetX = (playbackOffset * scaledWidth) / state.rawAudioBuffer!.duration + scaleCursorOffsetX;
            canvasContext.beginPath();
            canvasContext.moveTo(playbackOffsetX, 0);
            canvasContext.lineTo(playbackOffsetX, canvas.height);
            canvasContext.closePath();
            canvasContext.strokeStyle = "#ffffffff";
            canvasContext.lineWidth = 2;
            canvasContext.stroke();
        } else if (state.playbackOffsetSeconds > 0) {
            const playbackOffsetX =
                (state.playbackOffsetSeconds * scaledWidth) / state.rawAudioBuffer!.duration + scaleCursorOffsetX;
            canvasContext.beginPath();
            canvasContext.moveTo(playbackOffsetX, 0);
            canvasContext.lineTo(playbackOffsetX, canvas.height);
            canvasContext.closePath();
            canvasContext.strokeStyle = "#ffffffff";
            canvasContext.lineWidth = 2;
            canvasContext.stroke();
        }

        // draw frame rate
        canvasContext.font = "14px Monospace";
        canvasContext.fillStyle = "rgba(46, 204, 6, 1)";
        canvasContext.fillText("FPS: " + (1 / deltaTime).toFixed(0), 14, 24);

        if (state.currentFile) {
            const fileText = `File: ${state.currentFile.name} | ${(state.currentFile.size / 1024 / 1024).toFixed(2)} MB`;
            const fileTextWidth = canvasContext.measureText(fileText);
            canvasContext.fillStyle = "rgba(255, 255, 255, 1)"
            canvasContext.fillText(fileText, canvas.width - fileTextWidth.width - 10, 24);
        }

        canvasContext.save();
        canvasContext.fillStyle = "#fff";
        canvasContext.textAlign = "center";
        canvasContext.textBaseline = "middle";
        canvasContext.fillText(formatTime(getPlaybackSeconds()), canvas.width / 2, 24);
        canvasContext.restore();
        requestAnimationFrame(renderCanvas);
    };
    requestAnimationFrame(renderCanvas);


    const createToggleRecord = () => {
        const constraints: MediaStreamConstraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1,
                sampleRate: AUDIO_SAMPLE_RATE,
            },
        };
        let mediaRecorder: MediaRecorder | null = null;
        return async () => {
            if (!state.recording) {
                const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
                    .catch(console.error);
                if (!mediaStream) return;

                let recordedChunks = [] as Blob[];
                mediaRecorder = new MediaRecorder(mediaStream, {
                    mimeType: "audio/webm",
                });
                mediaRecorder.ondataavailable = (event) => {
                    console.log("New recorded data of size:", event.data.size);
                    recordedChunks.push(event.data);
                };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: "audio/webm" });
                    recordedChunks = [];
                    blob
                        .arrayBuffer()
                        .then((buffer) => state.audioContext.decodeAudioData(buffer))
                        .then((buffer) => updateAudioBuffer(buffer))
                        .then(() => state.currentFile = null)
                        .catch((reason) =>
                            console.error(
                                "Unable to get an array buffer from MediaRecorder:",
                                reason
                            )
                        );
                };
                mediaRecorder.start();
                state.recording = true;
            } else {
                if (mediaRecorder) {
                    mediaRecorder.stop();
                    mediaRecorder = null;
                }
                state.recording = false;
            }

            recordButton.innerText = state.recording ? "Stop" : "Record";
        }
    }
    recordButton.onclick = createToggleRecord();

    loadSampleButton.addEventListener("click", () => sampleFileInput.click());
    sampleFileInput.addEventListener("change", () => {
        const [file] = sampleFileInput.files || [];
        if (!file) return;

        const validateResult = validateAudioFile(file);
        if (!validateResult.ok) {
            console.error(validateResult.message, file);
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            if (!(reader.result instanceof ArrayBuffer)) return;
            state.audioContext.decodeAudioData(reader.result)
                .then(updateAudioBuffer)
                .then(() => state.currentFile = file)
                .catch(error => console.error("Error during decoding an audio file:", error));
        };

        reader.onerror = (error) => {
            // TODO: Add proper error handling for better user experience
            console.error("File reading error", error);
        };
        reader.onprogress = (ev) => {
            // TODO: Add progress bar
            console.log("File reading progress:", ev);
        }

        reader.readAsArrayBuffer(file);
    });

    const togglePlayback = () => {
        if (!state.playback) {
            playAudio();
        } else {
            pauseAudio();
        }
        playButton.innerText = (state.playback ? "Pause" : "Play") + ` (${KEYBOARD_BINDS.PLAY})`;
    };

    playButton.addEventListener("click", togglePlayback);

    window.addEventListener("keydown", (event) => {
        if (event.code === KEYBOARD_BINDS.PLAY) {
            event.preventDefault();
            return togglePlayback();
        }
    });

    canvas.addEventListener("mousemove", (event) => {
        cursorOffsetX = event.offsetX;
        if (state.rawAudioBuffer && state.selection.selecting) {
            state.selection.end = positionToSampleIndex(event.offsetX);
        }
    });
    canvas.addEventListener("mousedown", (event) => {
        if (state.rawAudioBuffer) {
            state.selection.selecting = true;
            const start = positionToSampleIndex(event.offsetX);
            state.selection.start = start;
            state.selection.end = start;
        }
    });
    window.addEventListener("mouseup", (event) => {
        const isCanvas = event.target && event.target instanceof HTMLCanvasElement;
        const mouseX = isCanvas ? event.offsetX : cursorOffsetX;
        if (state.rawAudioBuffer && state.selection.selecting) {
            state.selection.end = positionToSampleIndex(mouseX);
            state.selection.selecting = false;
            state.selection.selected = state.selection.start !== state.selection.end;
            console.log("Selection event on mouseup:", state.selection);

            const mousePlaybackSeconds = Math.max(0,
                (Math.min(state.selection.start, state.selection.end) / state.rawAudioBuffer.length) *
                state.rawAudioBuffer.duration
            );

            if (state.playback) {
                pauseAudio();
                state.playbackOffsetSeconds = mousePlaybackSeconds;
                playAudio();
            } else {
                state.playbackOffsetSeconds = mousePlaybackSeconds;
            }
        }
    });
    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        if (!state.rawAudioBuffer) return false;
        const scaler = event.ctrlKey ? 0.5 : 0.1;
        const zoomFactor = 1 - Math.sign(event.deltaY) * scaler;
        const newScale = Math.max(1, sampleScale * zoomFactor);

        const maxOffsetX = canvas.width * newScale - canvas.width;
        const normIndex = (cursorOffsetX - scaleCursorOffsetX) / (canvas.width * sampleScale);
        scaleCursorOffsetX = Math.max(-maxOffsetX, Math.min(0, cursorOffsetX - normIndex * canvas.width * newScale));
        renderedSampleCanvas = null;

        sampleScale = newScale;
    });

    const resizeCanvas = () => {
        const meterWidth = volumeMeter.getWidth();
        volumeMeter.resize(meterWidth, 200);
        canvas.width = document.body.clientWidth - meterWidth - 30;
        canvas.height = 200;
        renderedSampleCanvas = null;
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
});
