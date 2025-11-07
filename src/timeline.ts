import type { AudioProcessingGraph } from "./graph";
import { InputGraphNode } from "./nodes/input.node";
import { watchState } from "./state";
import { fetchAudioAsArrayBuffer, withBasePath } from "./utils";
import renderSampleWaves from "./utils/renderSampleWaves";

type MusicalTime = {
    bar: number;
    beat: number;
};

enum TimelineEventType {
    Sample = "sample",
}

class TimelineEvent {
    public scheduled = false;

    constructor(
        public readonly id: number,
        public readonly type: TimelineEventType,
        public time: MusicalTime,
        public trackId: number,
        public readonly data: AudioBrowserSampleInfo,
    ) {
    }
}

class TimelineTrack extends InputGraphNode {
    constructor(audioContext: AudioContext, name: string) {
        super(audioContext, name);
    }
}

class TimelineRecorder {
    private readonly constraints: MediaStreamConstraints;

    private mediaStream: MediaStream | null;
    private mediaRecorder: MediaRecorder | null;
    private recording = false;

    constructor(
        private audioContext: AudioContext,
        private onDataAvailable: (buffer: AudioBuffer) => any
    ) {
        this.constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1,
                sampleRate: audioContext.sampleRate,
            },
        };
        this.mediaRecorder = null;
        this.mediaStream = null;
    }

    async start() {
        if (!this.mediaStream) {
            const stream = await navigator.mediaDevices.getUserMedia(this.constraints)
                .catch(console.error);
            if (!stream) return false;
            this.mediaStream = stream;
        }

        let recordedChunks: Blob[] = [];
        this.mediaRecorder = new MediaRecorder(this.mediaStream, {
            mimeType: "audio/webm",
        });
        this.mediaRecorder.ondataavailable = (event) => {
            console.log("New recorded data of size:", event.data.size);
            recordedChunks.push(event.data);
        };
        this.mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: "audio/webm" });
            recordedChunks = [];
            blob
                .arrayBuffer()
                .then((buffer) => this.audioContext.decodeAudioData(buffer))
                .then((buffer) => this.onDataAvailable(buffer))
                .catch((reason) =>
                    console.error(
                        "Unable to get an array buffer from MediaRecorder:",
                        reason
                    )
                );
        };
        this.mediaRecorder.start();
        this.recording = true;

        return true;
    }

    async stop() {
        if (!this.recording) return;
        this.recording = false;
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.mediaRecorder = null;
        }
    }
}

type TimelineOptions = {
    readonly browser: AudioBrowser;
    bpm: number;
    timeSignature: {
        top: number;
        bottom: number;
    };
    scheduler: {
        intervalMs: number;
        lookaheadMs: number;
    };
    onTrackInit: (track: TimelineTrack) => void;
}

type TimelineMetronome = {
    enabled: boolean;
    nextTick: number;
    beat: number;
}

class Timeline {
    private metronome: TimelineMetronome = {
        enabled: false,
        beat: 0,
        nextTick: 0,
    };

    private playing = false;
    private recording = false;
    private playbackOffset: MusicalTime = { bar: 0, beat: 0 };
    private startTime = 0;
    private pauseTime = 0;

    private tracks: TimelineTrack[];

    private currentEventId = 0;
    private schedulerId: number | undefined;
    private scheduledEvents: TimelineEvent[];
    private activeSources: Map<number, AudioScheduledSourceNode>;

    private recorder: TimelineRecorder;

    constructor(
        private audioContext: AudioContext,
        private options: TimelineOptions
    ) {
        this.playing = false;
        this.tracks = [
            new TimelineTrack(audioContext, "Track 1"),
            new TimelineTrack(audioContext, "Track 2"),
            new TimelineTrack(audioContext, "Track 3"),
            new TimelineTrack(audioContext, "Track 4"),
            new TimelineTrack(audioContext, "Track 5"),
            new TimelineTrack(audioContext, "Track 6"),
            new TimelineTrack(audioContext, "Track 7"),
            new TimelineTrack(audioContext, "Track 8"),
        ];
        this.scheduledEvents = [];
        this.activeSources = new Map();

        this.tracks.forEach((track) => options.onTrackInit(track));

        this.recorder = new TimelineRecorder(
            audioContext,
            (buffer) => {
                const name = `Recording-${Date.now()}`;
                const time = { beat: 0, bar: 0 };
                const trackId = 6; // TODO: Find available track to place to
                const sample = this.options.browser.addSample(
                    name,
                    buffer,
                );
                this.scheduleSample(sample, trackId, time);
            },
        );
    }

    isRecording() {
        return this.recording;
    }

    setRecording(val: boolean) {
        this.recording = val;
        return this;
    }

    isMetronomeEnabled() {
        return this.metronome.enabled;
    }

    setMetronome(val: boolean) {
        this.metronome.enabled = val;
        return this;
    }

    setBPM(value: number) {
        this.options.bpm = value;
        return this;
    }

    getTracks() {
        return this.tracks;
    }

    getEvents() {
        return this.scheduledEvents;
    }

    scheduleSample(sample: AudioBrowserSampleInfo, track: number, time: MusicalTime) {
        if (this.tracks.length <= track) {
            throw new Error("Track doesn't exists");
        }
        const event = new TimelineEvent(
            ++this.currentEventId,
            TimelineEventType.Sample,
            time, track, sample
        );
        this.scheduledEvents.push(event);
    }

    moveSample(id: number, newTrackId: number, newTime: MusicalTime) {
        if (newTime.beat < 0 || newTime.bar < 0) return;
        const event = this.scheduledEvents.find(event => event.id === id);
        if (!event) return;
        // if (!event || event.trackId === newTrackId) return;
        event.time = newTime;


        const source = this.activeSources.get(event.id);
        if (source) {
            source.stop();
            source.disconnect();
        }
        if (newTrackId > 0 && newTrackId < this.tracks.length) {
            event.trackId = newTrackId;
        }
        event.scheduled = false;
    }

    deleteSample(id: number) {
        const source = this.activeSources.get(id);
        if (source) {
            source.stop();
            source.disconnect();
        }
        const eventIndex = this.scheduledEvents.findIndex((event) => event.id === id);
        if (eventIndex !== -1) {
            this.scheduledEvents.splice(eventIndex, 1);
        }
    }

    getPlaybackTime() {
        const playbackOffset = this.musicalTimeToSeconds(
            this.playbackOffset.bar,
            this.playbackOffset.beat,
        );
        return this.audioContext.currentTime - this.startTime + playbackOffset;
    }

    isPlaying() {
        return this.playing;
    }

    async play(offsetMusicalTime: MusicalTime = { bar: 0, beat: 0 }) {
        if (this.playing || !this.scheduledEvents.length) {
            return;
        }

        if (this.recording) {
            await this.recorder.start();
        }

        this.startTime = this.audioContext.currentTime;
        this.playbackOffset.bar = offsetMusicalTime.bar;
        this.playbackOffset.beat = offsetMusicalTime.beat;
        this.playing = true;

        this.initMetronomeTick();

        clearInterval(this.schedulerId);
        this.schedule();
        this.schedulerId = setInterval(
            () => this.schedule(),
            this.options.scheduler.intervalMs
        );

        return this;
    }

    async stop() {
        if (!this.playing) return;

        await this.recorder.stop();

        this.playing = false;
        this.pauseTime = this.audioContext.currentTime;

        clearInterval(this.schedulerId);
        this.schedulerId = undefined;

        this.scheduledEvents.forEach(event => (event.scheduled = false));
        this.activeSources.forEach((source) => {
            source.stop();
            source.disconnect();
        });
        this.activeSources.clear();

        return this;
    }

    getBeatDuration = () => (60 / this.options.bpm) * (4 / this.options.timeSignature.bottom);

    secondsToMusicalTime(seconds = 0) {
        const { timeSignature } = this.options;
        const beatDuration = this.getBeatDuration();
        const barDuration = beatDuration * timeSignature.top;
        const bar = Math.floor(seconds / barDuration);
        const beat = (seconds % barDuration) / beatDuration;

        return { bar, beat };
    }

    musicalTimeToSeconds(bar: number, beat = 0): number {
        const { timeSignature } = this.options;
        const beatDuration = this.getBeatDuration();
        const barDuration = beatDuration * timeSignature.top;

        return bar * barDuration + beat * beatDuration;
    }

    private schedule() {
        if (!this.playing) return;

        const playbackTime = this.getPlaybackTime();
        const lookahead = this.options.scheduler.lookaheadMs * 1000;

        if (this.metronome.enabled && this.audioContext.currentTime + 0.1 >= this.metronome.nextTick) {
            this.triggerMetronome();
        }

        this.scheduledEvents.forEach((event) => {
            if (event.scheduled) return;

            const whenEventInSeconds = this.musicalTimeToSeconds(
                event.time.bar,
                event.time.beat,
            );

            if (playbackTime + lookahead >= whenEventInSeconds && playbackTime < whenEventInSeconds + event.data.buffer.duration) {
                this.triggerEvent(
                    event,
                    whenEventInSeconds,
                );
            }
        });
    }

    private triggerEvent(event: TimelineEvent, whenEvent: number) {
        if (!this.playing || event.scheduled) return;
        event.scheduled = true;

        const track = this.tracks[event.trackId];
        if (!track) {
            throw new Error("invalid track id");
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = event.data.buffer;
        source.connect(track.input);
        this.activeSources.set(event.id, source);

        const playbackTime = this.getPlaybackTime();
        const startAt = Math.max(0, whenEvent - playbackTime);
        const offset = Math.max(0, playbackTime - whenEvent);

        source.start(
            this.audioContext.currentTime + startAt,
            offset,
        );
    }

    private triggerMetronome() {
        const time = this.metronome.nextTick;
        const isBarStart = this.metronome.beat % this.options.timeSignature.top === 0;

        const osc = this.audioContext.createOscillator();
        const envelope = this.audioContext.createGain();

        osc.type = "square";
        osc.detune.value = isBarStart ? 500 : 0;
        osc.frequency.value = 1000;
        osc.connect(envelope)

        envelope.gain.setValueAtTime(0.5, time);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
        envelope.connect(this.audioContext.destination);

        osc.start(time);
        osc.stop(time + 0.1);

        this.metronome.nextTick += this.getBeatDuration();
        this.metronome.beat++;
    }

    private initMetronomeTick() {
        const playbackTime = this.getPlaybackTime();
        const beatDuration = this.getBeatDuration();

        const currentBeat = ~~(playbackTime / beatDuration);
        const remained = currentBeat * beatDuration - playbackTime;

        this.metronome.beat = currentBeat % this.options.timeSignature.top;
        this.metronome.nextTick = this.audioContext.currentTime + remained;
    }
}

class AudioBrowserSampleInfo {
    constructor(
        public readonly id: number,
        public readonly name: string,
        public readonly buffer: AudioBuffer,
        public readonly path?: string,
    ) {
    }
}

type AudioBrowserOptions = {
    onUpdate?: (samples: MapIterator<AudioBrowserSampleInfo>) => any;
};

class AudioBrowser {
    private samples: Map<number, AudioBrowserSampleInfo>;
    private names: Map<string, number>;

    private currentId = 0;

    constructor(
        private context: AudioContext,
        private options: AudioBrowserOptions,
    ) {
        this.samples = new Map();
        this.names = new Map();
    }

    getById(id: number) {
        return this.samples.get(id);
    }

    getByName(name: string) {
        const values = this.samples.values();
        for (const sample of values) {
            if (sample.name === name) {
                return sample;
            }
        }

        return null;
    }

    getSamples() {
        return this.samples.values();
    }

    addSample(name: string, buffer: AudioBuffer): AudioBrowserSampleInfo {
        if (this.names.has(name)) {
            return this.samples.get(this.names.get(name)!)!;
        }
        return this.add(name, buffer, undefined, true);
    }

    async loadSamples(...paths: string[]) {
        return Promise.all(
            paths.map((path) => {
                const name = path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("."));
                return this.loadSample(name, path, false);
            })
        ).then((result) => {
            this.options.onUpdate?.(this.getSamples());
            return result;
        });
    }

    async loadSample(name: string, path: string, emitUpdate?: boolean): Promise<AudioBrowserSampleInfo> {
        path = withBasePath(path);

        if (this.names.has(name)) {
            return this.samples.get(this.names.get(name)!)!;
        }

        const arrayBuffer = await fetchAudioAsArrayBuffer(path);
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        return this.add(name, audioBuffer, path, emitUpdate ?? true);
    }

    private add(name: string, buffer: AudioBuffer, path?: string, emitUpdate?: boolean) {
        const id = ++this.currentId;
        const sample = new AudioBrowserSampleInfo(
            id,
            name,
            buffer,
            path,
        );

        this.samples.set(id, sample);
        this.names.set(name, id);

        if (emitUpdate && this.options.onUpdate) {
            this.options.onUpdate(this.getSamples());
        }

        return sample;
    }
}

const COLOR_SCHEME = {
    timelineBackground: "#1e2024",
    timelineBarBackground: "#191b1f",
    gridColor: "#0b0b0d",
    gridBarColor: "#0f0f0f",
    gridStepColor: "#0f0f0faa",
    timelineHeaderTextColor: "#999",

    accentColors: {
        blue: ["#34498c", "#233161"],
    },
};

/**
    * This class provides methods to caluclate and draw grid on timeline properly
*/
class TimelineGrid {
    public static readonly TYPES = {
        "beat": 1,
        "1/2": 1 / 2,
        "1/3": 1 / 3,
        "1/4": 1 / 4,
        "1/16": 1 / 16,
    };
    private type: keyof typeof TimelineGrid.TYPES = "1/4";

    public oneSecondWidth = 120;
    public trackPaneWidth = 120;
    public trackHeight = 60;
    public headerHeight = 20;
    public beatWidth = 0;
    public stepWidth = 0;
    public barWidth = 0;

    constructor(private timeline: Timeline) {
        this.updateGrid();
    }

    updateGrid() {
        const gridStep = TimelineGrid.TYPES[this.type];
        this.beatWidth = this.timeline.getBeatDuration() * this.oneSecondWidth;
        this.stepWidth = this.beatWidth * gridStep;
        this.barWidth = this.beatWidth * 4;
    }

    setType(type: keyof typeof TimelineGrid.TYPES) {
        this.type = type;
        this.updateGrid();
    }

    getMusicalTimeBy(offsetX: number): MusicalTime {
        const gridStep = TimelineGrid.TYPES[this.type];

        const totalGridSteps = offsetX / this.stepWidth;
        const snappedGridStep = Math.floor(totalGridSteps);

        const totalBeats = snappedGridStep * gridStep;
        const bar = Math.floor(totalBeats / 4);
        const beat = totalBeats % 4;

        return { bar, beat };
    }

    getTrackIndexBy(offsetY: number): number {
        const trackId = Math.max(0, Math.floor((offsetY - this.headerHeight) / this.trackHeight));
        return trackId;
    }

    getPositionBy(time: MusicalTime, track: number) {
        const x = time.bar * this.barWidth + time.beat * this.beatWidth;
        const y = track * this.trackHeight + this.headerHeight;
        return { x, y };
    }

    inTimelineEvent(offsetX: number, offsetY: number, event: TimelineEvent) {
        const x = event.time.bar * this.barWidth + event.time.beat * this.beatWidth;
        const y = event.trackId * this.trackHeight + this.headerHeight;
        const width = event.data.buffer.duration * this.oneSecondWidth;
        return (offsetX >= x && offsetX <= x + width && offsetY >= y && offsetY <= y + this.trackHeight);
    }
}

const MOUSE_BUTTONS = {
    LEFT: 0,
    RIGHT: 2,
};

export const initTimeline = async (audioContext: AudioContext, graph: AudioProcessingGraph) => {
    const browserContainer = document.getElementById("browser-pane")!;
    const browserItemsEl = browserContainer.querySelector(".browser-items")!;

    const updateBrowserItems = (samples: any) => {
        browserItemsEl.innerHTML = "";
        for (const sample of samples) {
            const item = document.createElement("div");
            item.dataset.id = sample.id.toString();
            item.classList.add("browser-item");
            item.append(document.createTextNode(sample.name));
            browserItemsEl.append(item);
        }
    };

    const browser = new AudioBrowser(audioContext, {
        onUpdate: updateBrowserItems,
    });
    await browser.loadSamples(
        "/drums/kicks/kick-1.wav",
        "/drums/claps/clap-1.wav",
        "/drums/cymbals/HH3.wav",
        "/guitar.mp3",
        "/loop.wav",
    );

    const timeline = new Timeline(audioContext, {
        bpm: 140,
        browser,
        timeSignature: { top: 4, bottom: 4 },
        scheduler: { intervalMs: 50, lookaheadMs: 10 },
        onTrackInit: (track: TimelineTrack) => {
            const buses = graph.getBuses();
            console.log("onTrackInit: list of available buses:", buses);
            const [masterBus] = buses;
            graph.addInput(track, masterBus?.id);
        },
    });

    const timelineGrid = new TimelineGrid(timeline);

    watchState("bpm", (value) => {
        timeline.setBPM(value)
        timelineGrid.updateGrid();
    });
    watchState("metronome", (value) => {
        timeline.setMetronome(value);
    });
    watchState("recording", (value) => {
        timeline.setRecording(value);
    });

    // demo test
    {
        const kick = browser.getByName("kick-1")!;
        const clap = browser.getByName("clap-1")!;
        const hihat = browser.getByName("HH3")!;
        const guitar = browser.getByName("guitar")!;

        for (let i = 1; i < 4; i++) {
            timeline.scheduleSample(kick, 0, { bar: i, beat: 0 });
            timeline.scheduleSample(clap, 1, { bar: i, beat: 2 });
            for (let j = 0; j < 8; j++) {
                timeline.scheduleSample(hihat, 2, { bar: i, beat: j / 2 });
            }
        }
        timeline.scheduleSample(guitar, 3, { bar: 2, beat: 3 });
    }

    const canvas = document.getElementById("timeline")! as HTMLCanvasElement;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    let selectedSample: AudioBrowserSampleInfo | null = null;
    let playbackOffsetTime = { bar: 0, beat: 0 };
    const draggingTimelineEvent = {
        event: null as TimelineEvent | null,
        anchorOffsetX: 0 as number,
    };

    browserContainer.addEventListener("click", (event) => {
        if (!event.target) return;

        const target = event.target as HTMLElement;

        if (target.dataset.id) {
            event.preventDefault();
            const sample = browser.getById(+target.dataset.id);
            if (!sample) return;
            selectedSample = sample;
        }
    });

    window.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        if (key === " ") {
            event.preventDefault();
            event.stopPropagation();
            if (!timeline.isPlaying()) {
                audioContext.resume();
                timeline.play(playbackOffsetTime);
            } else {
                timeline.stop();
            }
        }
    });

    canvas.addEventListener("mousedown", (event) => {
        const { button, offsetX, offsetY } = event;

        const timelineEvent = timeline.getEvents()
            .find(event => timelineGrid.inTimelineEvent(offsetX, offsetY, event));

        if (button === MOUSE_BUTTONS.LEFT) {
            const { bar, beat } = timelineGrid.getMusicalTimeBy(offsetX);

            if (timelineEvent) {
                selectedSample = timelineEvent.data;

                const eventPos = timelineGrid.getPositionBy(
                    timelineEvent.time,
                    timelineEvent.trackId
                );

                draggingTimelineEvent.event = timelineEvent;
                draggingTimelineEvent.anchorOffsetX = eventPos.x - offsetX;
                return;
            }

            if (offsetY <= timelineGrid.headerHeight) {
                playbackOffsetTime.bar = bar;
                playbackOffsetTime.beat = beat;
            } else if (selectedSample) {
                const trackId = timelineGrid.getTrackIndexBy(offsetY);
                timeline.scheduleSample(selectedSample, trackId, { bar, beat });
            }
        } else if (button === MOUSE_BUTTONS.RIGHT) {
            event.preventDefault();
            event.stopPropagation();

            if (timelineEvent) {
                timeline.deleteSample(timelineEvent.id);
            }
        }
    });
    canvas.addEventListener("mouseup", (event) => {
        if (draggingTimelineEvent) {
            draggingTimelineEvent.event = null;
        }
    });
    canvas.addEventListener("mousemove", ({ offsetX, offsetY }) => {
        if (draggingTimelineEvent.event) {
            const newTrackId = timelineGrid.getTrackIndexBy(offsetY);
            const newTime = timelineGrid.getMusicalTimeBy(offsetX + draggingTimelineEvent.anchorOffsetX);
            timeline.moveSample(draggingTimelineEvent.event.id, newTrackId, newTime);
        }
    });
    canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });

    const clipWavesCache = new Map<number, HTMLCanvasElement>();

    const renderTimeline = (timestamp: number) => {
        requestAnimationFrame(renderTimeline);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = COLOR_SCHEME.timelineBackground;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const timelineWidth = canvas.width - timelineGrid.trackPaneWidth;

        // draw bars
        ctx.beginPath();
        ctx.fillStyle = COLOR_SCHEME.timelineBarBackground;
        const bars = timelineWidth / timelineGrid.barWidth;
        for (let i = 0; i < bars; i++) {
            const barX = i * timelineGrid.barWidth;
            if (barX > timelineWidth) return;

            ctx.save();
            ctx.fillStyle = COLOR_SCHEME.timelineHeaderTextColor;
            ctx.font = "10px SF Pro Text";
            ctx.fillText(String(i + 1), barX, timelineGrid.headerHeight - 5);
            ctx.restore();

            ctx.moveTo(barX, timelineGrid.headerHeight);
            ctx.lineTo(barX, canvas.height);
            if (i % 2 === 0) {
                ctx.fillRect(barX + timelineGrid.barWidth, timelineGrid.headerHeight, timelineGrid.barWidth, canvas.height);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = COLOR_SCHEME.gridColor;
        ctx.stroke();

        // draw grid steps
        ctx.beginPath();
        const stepWidth = timelineGrid.stepWidth;
        const steps = timelineWidth / stepWidth;
        for (let i = 0; i < steps; i++) {
            const x = i * stepWidth;
            ctx.moveTo(x, timelineGrid.headerHeight);
            ctx.lineTo(x, canvas.height);
        }
        ctx.closePath();
        ctx.strokeStyle = COLOR_SCHEME.gridStepColor;
        ctx.stroke();

        // draw beats
        ctx.beginPath();
        const beats = timelineWidth / timelineGrid.beatWidth;
        for (let i = 0; i < beats; i++) {
            const x = i * timelineGrid.beatWidth;
            ctx.moveTo(x, timelineGrid.headerHeight);
            ctx.lineTo(x, canvas.height);
        }
        ctx.closePath();
        ctx.strokeStyle = COLOR_SCHEME.gridBarColor;
        ctx.stroke();

        // draw clips 
        const clips = timeline.getEvents();
        for (const clip of clips) {
            if (clip.type === TimelineEventType.Sample) {
                const duration = timeline.secondsToMusicalTime(clip.data.buffer.duration);
                const width = duration.bar * timelineGrid.barWidth + duration.beat * timelineGrid.beatWidth;
                const x = clip.time.bar * timelineGrid.barWidth + clip.time.beat * timelineGrid.beatWidth;
                const y = clip.trackId * timelineGrid.trackHeight + timelineGrid.headerHeight;

                ctx.beginPath();
                ctx.fillStyle = COLOR_SCHEME.accentColors.blue[0];
                ctx.rect(x, y, width, timelineGrid.trackHeight);
                ctx.fill();
                ctx.strokeStyle = "#1e1e1e";
                ctx.stroke();

                if (!clipWavesCache.has(clip.data.id)) {
                    const inner = renderSampleWaves(clip.data.buffer, width, timelineGrid.trackHeight - 20, 1, 0, "#0f0f0f");
                    clipWavesCache.set(clip.data.id, inner);
                }
                ctx.drawImage(clipWavesCache.get(clip.data.id)!, x, y + 20);

                // header
                ctx.fillStyle = COLOR_SCHEME.accentColors.blue[1];
                ctx.fillRect(x, y, width, 20);
                ctx.stroke();

                ctx.fillStyle = "#fff";
                ctx.font = "12px Arial";
                ctx.fillText(clip.data.name, x, y + 12, width);
            }
        }

        // draw playback cursor
        const playbackX = (
            timeline.isPlaying()
                ? timeline.getPlaybackTime()
                : timeline.musicalTimeToSeconds(playbackOffsetTime.bar, playbackOffsetTime.beat)
        ) * timelineGrid.oneSecondWidth;
        ctx.beginPath();
        ctx.moveTo(playbackX, 0);
        ctx.lineTo(playbackX, canvas.height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ee5500";
        ctx.stroke();
        ctx.closePath();

        // draw tracks
        const tracks = timeline.getTracks();

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < tracks.length; i++) {
            const trackY = timelineGrid.headerHeight + timelineGrid.trackHeight * i;
            ctx.moveTo(0, trackY);
            ctx.lineTo(canvas.width, trackY);
            ctx.fillStyle = "#181818";

            const trackX = canvas.width - timelineGrid.trackPaneWidth;
            ctx.fillRect(trackX, trackY, timelineGrid.trackPaneWidth, timelineGrid.trackHeight);
            ctx.fillStyle = "#fff";
            ctx.font = "14px SF Pro Text";
            ctx.textBaseline = "top";
            ctx.fillText(tracks[i].name, trackX + 10, trackY + 10);
        }
        ctx.closePath();
        ctx.strokeStyle = COLOR_SCHEME.gridColor;
        ctx.stroke();
        ctx.restore();
    }
    requestAnimationFrame(renderTimeline);

    const resizeCanvas = () => {
        const canvasContainer = canvas.parentNode as HTMLElement;
        const rect = canvasContainer.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height - 32;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

}
