import { resolve } from "$app/paths";
import PLUGINS from "$lib/audio/plugins/index";
import type { AudioPlugin } from "$lib/audio/plugins/plugin";
import { AudioSinkNode } from "$lib/audio/nodes/sink.node";

export type MusicalTime = {
    bar: number;
    beat: number;
};

export type TimelineClip = {
    id: number;
    sampleId: number;
    sampleName: string;
    time: MusicalTime;
    trackId: number;
    duration: MusicalTime;
    offset: MusicalTime;
    volume: number;
};

export type TimelineTrack = {
    id: number;
    name: string;
    gain: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    pluginIds: string[];
};

export const MASTER_TRACK_ID = -1;

export type GridStep = "beat" | "1/2" | "1/4" | "1/8" | "1/16";

const GRID_STEP_VALUES: Record<GridStep, number> = {
    beat: 1,
    "1/2": 1 / 2,
    "1/4": 1 / 4,
    "1/8": 1 / 8,
    "1/16": 1 / 16,
};

type TrackAudioState = {
    sinkNode: AudioSinkNode;
    pluginInstances: AudioPlugin[];
};

class TimelineState {
    bpm = $state(140);
    timeSignature = $state({ top: 4, bottom: 4 });
    isPlaying = $state(false);
    isRecording = $state(false);
    metronome = $state(false);
    playbackPosition = $state(0);
    isLoadingSample = $state(false);

    clips = $state<TimelineClip[]>([]);
    tracks = $state<TimelineTrack[]>([
        { id: 0, name: "Track 1", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 1, name: "Track 2", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 2, name: "Track 3", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 3, name: "Track 4", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 4, name: "Track 5", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 5, name: "Track 6", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 6, name: "Track 7", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 7, name: "Track 8", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
    ]);

    masterTrack = $state<TimelineTrack>({
        id: MASTER_TRACK_ID,
        name: "Master",
        gain: 1,
        pan: 0,
        muted: false,
        solo: false,
        pluginIds: [],
    });

    gridStep = $state<GridStep>("1/4");
    zoom = $state(1);
    oneSecondWidth = $state(120);
    trackHeight = $state(72);
    headerHeight = $state(24);
    trackPaneWidth = $state(140);

    private nextClipId = 1;

    get beatWidth(): number {
        const beatDuration = 60 / this.bpm;
        return beatDuration * this.oneSecondWidth * this.zoom;
    }

    setZoom(newZoom: number): void {
        this.zoom = Math.min(8, Math.max(0.25, newZoom));
    }

    get stepWidth(): number {
        return this.beatWidth * GRID_STEP_VALUES[this.gridStep];
    }

    get gridStepValue(): number {
        return GRID_STEP_VALUES[this.gridStep];
    }

    get barWidth(): number {
        return this.beatWidth * 4;
    }

    musicalTimeToX(time: MusicalTime): number {
        return time.bar * this.barWidth + time.beat * this.beatWidth;
    }

    xToMusicalTime(x: number): MusicalTime {
        const gridStep = GRID_STEP_VALUES[this.gridStep];
        const totalGridSteps = x / this.stepWidth;
        const snappedGridStep = Math.floor(totalGridSteps);
        const totalBeats = snappedGridStep * gridStep;
        const bar = Math.floor(totalBeats / 4);
        const beat = totalBeats % 4;
        return { bar, beat };
    }

    xToMusicalTimeRaw(x: number): MusicalTime {
        const totalBeats = x / this.beatWidth;
        const bar = Math.floor(totalBeats / 4);
        const beat = totalBeats % 4;
        return { bar, beat };
    }

    yToTrackId(y: number): number {
        const trackCount = this.tracks.length;
        const masterY = trackCount * this.trackHeight;
        if (y >= masterY) return MASTER_TRACK_ID;
        const index = Math.floor(y / this.trackHeight);
        return this.tracks[index]?.id ?? 0;
    }

    get totalHeight(): number {
        return (this.tracks.length + 1) * this.trackHeight;
    }

    getTrackById(id: number): TimelineTrack | undefined {
        if (id === MASTER_TRACK_ID) return this.masterTrack;
        return this.tracks.find((t) => t.id === id);
    }

    addPluginToTrack(trackId: number, pluginId: string): void {
        const track = this.getTrackById(trackId);
        if (track) {
            track.pluginIds = [...track.pluginIds, pluginId];
        }
    }

    removePluginFromTrack(trackId: number, index: number): void {
        const track = this.getTrackById(trackId);
        if (track) {
            track.pluginIds = track.pluginIds.filter((_, i) => i !== index);
        }
    }

    movePluginInTrack(trackId: number, fromIndex: number, toIndex: number): void {
        const track = this.getTrackById(trackId);
        if (!track) return;
        const ids = [...track.pluginIds];
        const [moved] = ids.splice(fromIndex, 1);
        ids.splice(toIndex, 0, moved);
        track.pluginIds = ids;
    }

    addClip(
        sampleId: number,
        sampleName: string,
        trackId: number,
        time: MusicalTime,
        durationBeats: number,
        offsetBeats: number = 0,
    ): TimelineClip {
        const clip: TimelineClip = {
            id: this.nextClipId++,
            sampleId,
            sampleName,
            time,
            trackId,
            duration: {
                bar: Math.floor(durationBeats / 4),
                beat: durationBeats % 4,
            },
            offset: {
                bar: Math.floor(offsetBeats / 4),
                beat: offsetBeats % 4,
            },
            volume: 1.0,
        };
        this.clips = [...this.clips, clip];
        return clip;
    }

    removeClip(id: number): void {
        this.clips = this.clips.filter((c) => c.id !== id);
    }

    moveClip(id: number, newTime: MusicalTime, newTrackId: number): void {
        this.clips = this.clips.map((c) => (c.id === id ? { ...c, time: newTime, trackId: newTrackId } : c));
    }

    setClipVolume(id: number, volume: number): void {
        this.clips = this.clips.map((c) => (c.id === id ? { ...c, volume: Math.max(0, Math.min(1, volume)) } : c));
    }

    resizeClip(id: number, opts: { duration?: MusicalTime; offset?: MusicalTime; time?: MusicalTime }): void {
        this.clips = this.clips.map((c) => (c.id === id ? { ...c, ...opts } : c));
    }

    private clipboard: TimelineClip[] = [];

    copyClips(ids: number[]): void {
        this.clipboard = this.clips.filter((c) => ids.includes(c.id));
    }

    pasteClips(): TimelineClip[] {
        if (this.clipboard.length === 0) return [];
        const pasted: TimelineClip[] = [];
        for (const clip of this.clipboard) {
            const newClip = this.addClip(
                clip.sampleId,
                clip.sampleName,
                clip.trackId,
                clip.time,
                clip.duration.bar * 4 + clip.duration.beat,
                clip.offset.bar * 4 + clip.offset.beat,
            );
            pasted.push(newClip);
        }
        return pasted;
    }

    private audioContext: AudioContext | null = null;
    private masterPreNode: GainNode | null = null;
    private masterPostNode: TrackAudioState | null = null;
    private trackAudio = new Map<number, TrackAudioState>();

    private buffers = new Map<number, AudioBuffer>();
    private activeSources: AudioBufferSourceNode[] = [];
    private animationFrame: number | null = null;
    private playbackStartTime = 0;
    private looping = false;

    get context(): AudioContext | null {
        return this.audioContext;
    }

    get destination(): AudioDestinationNode | undefined {
        return this.audioContext?.destination;
    }

    init(): AudioContext {
        if (this.audioContext) return this.audioContext;

        this.audioContext = new AudioContext();

        this.masterPreNode = this.audioContext.createGain();

        this.masterPostNode = {
            sinkNode: new AudioSinkNode(this.audioContext, "Master"),
            pluginInstances: [],
        };
        this.masterPreNode.connect(this.masterPostNode.sinkNode.input);

        this.rewireTrack(MASTER_TRACK_ID);

        for (const track of this.tracks) {
            this.createTrackAudio(track);
        }

        return this.audioContext;
    }

    async getBuffer(sampleId: number, samplePath?: string): Promise<AudioBuffer | null> {
        const cached = this.buffers.get(sampleId);
        if (cached) return cached;

        if (!samplePath || !this.audioContext) return null;

        try {
            const response = await fetch(resolve(samplePath, {}));
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.buffers.set(sampleId, audioBuffer);
            return audioBuffer;
        } catch (err) {
            console.error(`Failed to load sample ${sampleId}:`, err);
            return null;
        }
    }

    getBufferSync(sampleId: number): AudioBuffer | null {
        return this.buffers.get(sampleId) ?? null;
    }

    createTrackAudio(track: TimelineTrack): void {
        if (!this.audioContext || !this.masterPreNode) return;

        const sinkNode = new AudioSinkNode(this.audioContext, track.name);
        sinkNode.setGain(track.gain);
        sinkNode.setPan(track.pan);
        sinkNode.connect(this.masterPreNode);

        this.trackAudio.set(track.id, {
            sinkNode,
            pluginInstances: [],
        });

        this.rewireTrack(track.id);
    }

    removeTrackAudio(trackId: number): void {
        const state = this.trackAudio.get(trackId);
        if (!state) return;

        for (const plugin of state.pluginInstances) {
            plugin.disconnect();
        }
        state.sinkNode.disconnect();
        this.trackAudio.delete(trackId);
    }

    addPlugin(trackId: number, pluginId: string): void {
        if (!this.audioContext) return;

        const track = this.getTrackById(trackId);
        if (!track) return;

        const pluginDef = PLUGINS.find((p) => p.id === pluginId);
        if (!pluginDef) return;

        const plugin = pluginDef.getInstance(this.audioContext);
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        state.pluginInstances.push(plugin);
        this.addPluginToTrack(trackId, pluginId);
        this.rewireTrack(trackId);
    }

    removePlugin(trackId: number, index: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const plugin = state.pluginInstances[index];
        if (plugin) {
            plugin.disconnect();
        }

        state.pluginInstances.splice(index, 1);
        this.removePluginFromTrack(trackId, index);
        this.rewireTrack(trackId);
    }

    movePlugin(trackId: number, fromIndex: number, toIndex: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const [moved] = state.pluginInstances.splice(fromIndex, 1);
        state.pluginInstances.splice(toIndex, 0, moved);
        this.movePluginInTrack(trackId, fromIndex, toIndex);
        this.rewireTrack(trackId);
    }

    toggleBypass(trackId: number, index: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const plugin = state.pluginInstances[index];
        if (!plugin) return;

        const bypassParam = plugin.getParams().find((p) => p.id === "bypass");
        if (bypassParam) {
            bypassParam.setValue(!bypassParam.getValue());
        }
    }

    updateTrackGain(trackId: number, gain: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const gainParam = state.sinkNode.getParams().find((p) => p.id === "input_gain");
        if (gainParam) gainParam.setValue(gain);
        const track = this.getTrackById(trackId);
        if (track) track.gain = gain;
    }

    toggleMute(trackId: number): void {
        const track = this.getTrackById(trackId);
        if (!track) return;
        track.muted = !track.muted;
        if (track.muted) {
            const state = this.getTrackAudioState(trackId);
            if (state) {
                const gainParam = state.sinkNode.getParams().find((p) => p.id === "input_gain");
                if (gainParam) gainParam.setValue(0);
            }
        } else {
            this.updateTrackGain(trackId, track.gain);
        }
    }

    toggleSolo(trackId: number): void {
        const track = this.getTrackById(trackId);
        if (!track) return;
        track.solo = !track.solo;
        const hasSolo = this.tracks.some((t) => t.solo);
        for (const t of this.tracks) {
            const state = this.getTrackAudioState(t.id);
            if (!state) continue;
            const gainParam = state.sinkNode.getParams().find((p) => p.id === "input_gain");
            if (!gainParam) continue;
            if (hasSolo) {
                gainParam.setValue(t.solo ? t.gain : 0);
            } else {
                gainParam.setValue(t.muted ? 0 : t.gain);
            }
        }
    }

    updateTrackPan(trackId: number, pan: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const panParam = state.sinkNode.getParams().find((p) => p.id === "pan");
        if (panParam) panParam.setValue(pan);
        const track = this.getTrackById(trackId);
        if (track) track.pan = pan;
    }

    getTrackAudioState(trackId: number): TrackAudioState | null {
        if (trackId === MASTER_TRACK_ID) return this.masterPostNode;
        return this.trackAudio.get(trackId) ?? null;
    }

    getPluginInstance(trackId: number, index: number): AudioPlugin | null {
        const state = this.getTrackAudioState(trackId);
        if (!state) return null;
        return state.pluginInstances[index] ?? null;
    }

    play(): void {
        if (!this.audioContext) return;
        if (this.looping) return;
        if (this.audioContext.state === "suspended") {
            this.audioContext.resume();
        }

        const startBeat = this.playbackPosition;
        const startOffsetSeconds = (startBeat * 60) / this.bpm;

        this.stop();
        this.looping = true;
        this.playbackStartTime = this.audioContext.currentTime - startOffsetSeconds;
        this.scheduleAllClips();
        this.startCursorAnimation();
    }

    stop(): void {
        this.looping = false;
        this.activeSources.forEach((s) => {
            try {
                s.stop();
            } catch {}
        });
        this.activeSources = [];
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.playbackPosition = 0;
    }

    private getTotalDurationSeconds(): number {
        let latestEndBeats = 0;
        for (const clip of this.clips) {
            const startBeats = clip.time.bar * 4 + clip.time.beat;
            const durationBeats = clip.duration.bar * 4 + clip.duration.beat;
            const endBeats = startBeats + durationBeats;
            if (endBeats > latestEndBeats) latestEndBeats = endBeats;
        }
        const roundedEndBeats = latestEndBeats > 0 ? Math.ceil(latestEndBeats / 4) * 4 : 4;
        return (roundedEndBeats * 60) / this.bpm;
    }

    musicalTimeToSeconds(time: MusicalTime): number {
        return ((time.bar * 4 + time.beat) * 60) / this.bpm;
    }

    private async scheduleAllClips(): Promise<void> {
        if (!this.audioContext) return;

        const totalDuration = this.getTotalDurationSeconds();

        const fetchPromises = this.clips.map(async (clip) => {
            if (!this.buffers.has(clip.sampleId)) {
                const sample = this.findSamplePath(clip.sampleId);
                if (sample) await this.getBuffer(clip.sampleId, sample);
            }
        });
        await Promise.allSettled(fetchPromises);

        for (const clip of this.clips) {
            this.scheduleClip(clip, this.playbackStartTime, totalDuration);
        }
    }

    private scheduleClip(clip: TimelineClip, referenceTime: number, totalDuration: number): void {
        if (!this.audioContext) return;

        const trackState = this.getTrackAudioState(clip.trackId);
        if (!trackState) return;

        const track = this.getTrackById(clip.trackId);
        if (track?.muted) return;

        const buffer = this.buffers.get(clip.sampleId);
        if (!buffer) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const clipGain = this.audioContext.createGain();
        source.connect(clipGain);
        trackState.sinkNode.receiveInput(clipGain);

        const clipStart = this.musicalTimeToSeconds(clip.time);
        const clipDuration = this.musicalTimeToSeconds(clip.duration);

        const offsetSeconds = this.musicalTimeToSeconds(clip.offset);
        const startAt = referenceTime + clipStart;

        if (startAt < this.audioContext.currentTime) return;

        const FADE_DURATION = 0.01;
        const fadeTime = Math.min(FADE_DURATION, clipDuration / 2);
        const endAt = startAt + clipDuration;

        // Fade in works only when offset is changed by the user
        // It is so, because for kicks, snares and other fast-attack audio samples
        // it is critical to keep sound as-is
        if (offsetSeconds === 0) {
            clipGain.gain.value = clip.volume;
        } else {
            clipGain.gain.setValueAtTime(0.001, startAt);
            clipGain.gain.exponentialRampToValueAtTime(clip.volume, startAt + fadeTime);
        }

        // fade out
        clipGain.gain.setValueAtTime(clip.volume, endAt - fadeTime);
        clipGain.gain.exponentialRampToValueAtTime(0.001, endAt);

        source.start(startAt, offsetSeconds, clipDuration);

        this.activeSources.push(source);
    }

    private startCursorAnimation(): void {
        const animate = () => {
            if (!this.audioContext || !this.looping) return;

            const elapsed = this.audioContext.currentTime - this.playbackStartTime;
            const totalDuration = this.getTotalDurationSeconds();
            const positionSeconds = elapsed % totalDuration;

            this.playbackPosition = (positionSeconds * this.bpm) / 60;

            if (elapsed >= totalDuration) {
                this.playbackStartTime = this.audioContext.currentTime;
                this.activeSources.forEach((s) => {
                    try {
                        s.stop();
                    } catch {}
                });
                this.activeSources = [];
                this.scheduleAllClips();
            }

            this.animationFrame = requestAnimationFrame(animate);
        };
        this.animationFrame = requestAnimationFrame(animate);
    }

    private samplePaths = new Map<number, string>();

    registerSamples(samples: { id: number; path: string }[]): void {
        for (const s of samples) {
            this.samplePaths.set(s.id, s.path);
        }
    }

    findSamplePath(sampleId: number): string | null {
        return this.samplePaths.get(sampleId) ?? null;
    }

    rewireAll(): void {
        for (const trackId of this.trackAudio.keys()) {
            this.rewireTrack(trackId);
        }
        this.rewireTrack(MASTER_TRACK_ID);
    }

    private rewireTrack(trackId: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        state.sinkNode.disconnect();
        state.pluginInstances.forEach((p) => p.disconnect());

        const activePlugins = state.pluginInstances.filter((p) => {
            const bypassParam = p.getParams().find((param) => param.id === "bypass");
            return bypassParam ? !bypassParam.getValue() : true;
        });

        let lastNode: AudioSinkNode | AudioPlugin = state.sinkNode;
        for (const plugin of activePlugins) {
            lastNode.connect(plugin);
            lastNode = plugin;
        }

        const targetNode = trackId === MASTER_TRACK_ID ? this.audioContext!.destination : this.masterPreNode!;
        lastNode.connect(targetNode);
    }
}

export const timeline = new TimelineState();
