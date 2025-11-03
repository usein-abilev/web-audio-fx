import type { AudioProcessingGraph } from "./graph";
import { InputGraphNode } from "./nodes/input.node";
import { fetchAudioAsArrayBuffer, withBasePath } from "./utils";

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
        public readonly time: MusicalTime,
        public readonly trackId: number,
        public readonly data: AudioBrowserSampleInfo,
    ) {
    }
}

class TimelineTrack extends InputGraphNode {
    constructor(audioContext: AudioContext, name: string) {
        super(audioContext, name);
    }
}

type TimelineOptions = {
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
        enabled: true,
        beat: 0,
        nextTick: 0,
    };

    private playing = false;
    private playbackOffset: MusicalTime = { bar: 0, beat: 0 };
    private startTime = 0;
    private pauseTime = 0;

    private tracks: TimelineTrack[];

    private currentEventId = 0;
    private schedulerId: number | undefined;
    private scheduledEvents: TimelineEvent[];
    private activeSources: Map<number, AudioScheduledSourceNode>;

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
        ];
        this.scheduledEvents = [];
        this.activeSources = new Map();

        this.tracks.forEach((track) => options.onTrackInit(track));
    }

    isMetronomeEnabled() {
        return this.metronome.enabled;
    }

    setMetronome(val: boolean) {
        this.metronome.enabled = val;
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

    play(offsetMusicalTime: MusicalTime = { bar: 0, beat: 0 }) {
        if (this.playing || !this.scheduledEvents.length) {
            return;
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

    stop() {
        if (!this.playing) return;

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
        public readonly path: string,
        public readonly buffer: AudioBuffer,
    ) {
    }
}

class AudioBrowser {
    private samples: Map<number, AudioBrowserSampleInfo>;
    private paths: Map<string, number>;

    private currentId = 0;

    constructor(private context: AudioContext) {
        this.samples = new Map();
        this.paths = new Map();
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

    async loadSamples(...paths: string[]) {
        return Promise.all(
            paths.map((path) => {
                const name = path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("."));
                return this.loadSample(name, path);
            })
        );
    }

    async loadSample(name: string, path: string): Promise<AudioBrowserSampleInfo> {
        path = withBasePath(path);

        if (this.paths.has(path)) {
            return this.samples.get(this.paths.get(path)!)!;
        }

        const arrayBuffer = await fetchAudioAsArrayBuffer(path);
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        const id = ++this.currentId;
        const sample = new AudioBrowserSampleInfo(
            id,
            name,
            path,
            audioBuffer
        );

        this.samples.set(id, sample);
        this.paths.set(path, id);

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
    const timelineOptions: TimelineOptions = {
        bpm: 140,
        timeSignature: { top: 4, bottom: 4 },
        scheduler: { intervalMs: 50, lookaheadMs: 10 },
        onTrackInit: (track: TimelineTrack) => {
            const buses = graph.getBuses();
            console.log("onTrackInit: list of available buses:", buses);
            const [masterBus] = buses;
            graph.addInput(track, masterBus?.id);
        },
    };
    const timeline = new Timeline(audioContext, timelineOptions);

    const browser = new AudioBrowser(audioContext);
    await browser.loadSample("metronome", "/metronome.mp3");
    await browser.loadSamples(
        "/drums/kicks/kick-1.wav",
        "/drums/claps/clap-1.wav",
        "/drums/cymbals/HH3.wav",
        "/guitar.mp3",
        "/loop.wav",
    );

    const browserContainer = document.getElementById("browser")!;
    const browserItemsEl = document.querySelector("#browser .browser-items")!;

    const timelineHeaderControls = document.querySelector(".daw-header")! as HTMLDivElement;
    const timelineHeaderBPM = document.getElementById("bpm")!;
    const timelineHeaderMetronome = document.getElementById("metronome-input")! as HTMLInputElement;
    timelineHeaderBPM.innerText = `${timelineOptions.bpm} BPM`;
    timelineHeaderMetronome.checked = timeline.isMetronomeEnabled();

    timelineHeaderControls.addEventListener("click", (event) => {
        const element = event.target as any;
        if (element.id === "metronome-input") {
            timeline.setMetronome((element as HTMLInputElement).checked);
        }
    });

    const canvas = document.getElementById("timeline")! as HTMLCanvasElement;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    const updateBrowserItems = () => {
        const samples = browser.getSamples();

        browserItemsEl.innerHTML = "";
        for (const sample of samples) {
            const item = document.createElement("div");
            item.dataset.id = sample.id.toString();
            item.classList.add("browser-item");
            item.append(document.createTextNode(sample.name));
            browserItemsEl.append(item);
        }
    }
    updateBrowserItems();

    let selectedSample: AudioBrowserSampleInfo | null = null;

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

    const timelineGrid = new TimelineGrid(timeline);

    let playbackOffsetTime = { bar: 0, beat: 0 };

    window.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        if (key === " ") {
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
            if (timelineEvent) {
                selectedSample = timelineEvent.data;
                return;
            }

            const { bar, beat } = timelineGrid.getMusicalTimeBy(offsetX);

            if (offsetY <= timelineGrid.headerHeight) {
                playbackOffsetTime.bar = bar;
                playbackOffsetTime.beat = beat;
            } else if (selectedSample) {
                const trackId = Math.max(0, Math.floor((offsetY - timelineGrid.headerHeight) / timelineGrid.trackHeight));
                timeline.scheduleSample(selectedSample, trackId, { bar, beat });
            }
        } else if (button === MOUSE_BUTTONS.RIGHT) {
            event.preventDefault();

            if (timelineEvent) {
                timeline.deleteSample(timelineEvent.id);
            }
        }
    });
    canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });

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
        canvas.height = rect.height;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

}
