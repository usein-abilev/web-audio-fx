import { bufferStore } from "./buffer.svelte";

export type MusicalTime = {
    bar: number;
    beat: number;
};

export type TimelineClip = {
    id: number;
    name: string;
    sampleId: string;
    bufferId: string;
    time: MusicalTime;
    trackId: number;
    duration: MusicalTime;
    offset: MusicalTime;
    params: {
        volume: number;
    };
};

export type TimelineTrack = {
    id: number;
    name: string;
    gain: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    pluginIds: string[];
    color: string;
};

export const TRACK_COLORS: string[] = ["#3b5998", "#c9a82c", "#3a8a5c", "#b53535", "#c47a20"];

export const MASTER_TRACK_ID = -1;

export type GridStep = "beat" | "1/2" | "1/4" | "1/8" | "1/16";

const GRID_STEP_VALUES: Record<GridStep, number> = {
    beat: 1,
    "1/2": 1 / 2,
    "1/4": 1 / 4,
    "1/8": 1 / 8,
    "1/16": 1 / 16,
};

class TimelineState {
    bpm = $state(140);
    timeSignature = $state({ top: 4, bottom: 4 });

    clips = $state<TimelineClip[]>([]);
    tracks = $state<TimelineTrack[]>(
        Array.from({ length: 15 }, (_, i) => ({
            id: i,
            name: `Track ${i + 1}`,
            gain: 1,
            pan: 0,
            muted: false,
            solo: false,
            pluginIds: [],
            color: TRACK_COLORS[i % TRACK_COLORS.length],
        })),
    );

    masterTrack = $state<TimelineTrack>({
        id: MASTER_TRACK_ID,
        name: "Master",
        gain: 1,
        pan: 0,
        muted: false,
        solo: false,
        pluginIds: [],
        color: "#3b5998",
    });

    gridStep = $state<GridStep>("1/4");
    zoom = $state(1);
    oneSecondWidth = $state(120);
    headerHeight = $state(24);
    trackPaneWidth = $state(140);
    trackHeight = $state(82);

    private nextClipId = 1;
    private clipboard: TimelineClip[] = [];

    get beatWidth(): number {
        const beatDuration = 60 / this.bpm;
        return beatDuration * this.oneSecondWidth * this.zoom;
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

    get totalHeight(): number {
        return (this.tracks.length + 1) * this.trackHeight;
    }

    setZoom(newZoom: number): void {
        this.zoom = Math.min(8, Math.max(0.25, newZoom));
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

    musicalTimeToBeats(time: MusicalTime): number {
        return time.bar * 4 + time.beat;
    }

    beatsToMusical(beats: number): MusicalTime {
        const clamped = Math.max(0, beats);
        return { bar: Math.floor(clamped / 4), beat: clamped % 4 };
    }

    musicalTimeToSeconds(time: MusicalTime): number {
        return (this.musicalTimeToBeats(time) * 60) / this.bpm;
    }

    getTotalDurationBeats(): number {
        let latestEndBeats = 0;
        for (const clip of this.clips) {
            const endBeats = this.musicalTimeToBeats(clip.time) + this.musicalTimeToBeats(clip.duration);
            if (endBeats > latestEndBeats) latestEndBeats = endBeats;
        }
        return latestEndBeats > 0 ? Math.ceil(latestEndBeats / 4) * 4 : 4;
    }

    getTotalDurationSeconds(): number {
        return (this.getTotalDurationBeats() * 60) / this.bpm;
    }

    getTrackById(id: number): TimelineTrack | undefined {
        if (id === MASTER_TRACK_ID) return this.masterTrack;
        return this.tracks.find((t) => t.id === id);
    }

    getClip(id: number) {
        return this.clips.find((c) => c.id === id);
    }

    addClip(
        sampleId: string,
        name: string,
        bufferId: string,
        trackId: number,
        time: MusicalTime,
        durationBeats: number,
        offsetBeats: number = 0,
        volume: number = 1.0,
    ): TimelineClip {
        const clip: TimelineClip = {
            id: this.nextClipId++,
            name,
            sampleId,
            bufferId,
            time,
            trackId,
            params: { volume },
            duration: this.beatsToMusical(durationBeats),
            offset: this.beatsToMusical(offsetBeats),
        };
        this.clips.push(clip);
        return clip;
    }

    removeClipsBySampleId(sampleId: string) {
        this.clips = this.clips.filter((c) => c.sampleId !== sampleId);
        this.cleanupOrphanedBuffers();
    }

    removeClips(ids: number[]): void {
        this.clips = this.clips.filter((c) => !ids.includes(c.id));
        this.cleanupOrphanedBuffers();
    }

    moveClip(id: number, newTime: MusicalTime, newTrackId: number): void {
        this.clips = this.clips.map((c) => (c.id === id ? { ...c, time: newTime, trackId: newTrackId } : c));
    }

    setClipVolume(id: number, volume: number): void {
        this.clips = this.clips.map((c) =>
            c.id === id ? { ...c, params: { ...c.params, volume: Math.max(0, Math.min(1, volume)) } } : c,
        );
    }

    resizeClip(id: number, opts: { duration?: MusicalTime; offset?: MusicalTime; time?: MusicalTime }): void {
        this.clips = this.clips.map((c) => (c.id === id ? { ...c, ...opts } : c));
    }

    splitClip(clipId: number, splitBeat: number): TimelineClip | null {
        const clip = this.getClip(clipId);
        if (!clip) return null;

        const clipStartBeats = this.musicalTimeToBeats(clip.time);
        const clipDurationBeats = this.musicalTimeToBeats(clip.duration);
        const clipEndBeats = clipStartBeats + clipDurationBeats;

        if (splitBeat <= clipStartBeats || splitBeat >= clipEndBeats) return null;

        const leftDuration = splitBeat - clipStartBeats;
        this.resizeClip(clipId, {
            duration: this.beatsToMusical(leftDuration),
        });

        const rightDuration = clipEndBeats - splitBeat;
        const rightOffset = this.musicalTimeToBeats(clip.offset) + leftDuration;
        const rightClip = this.addClip(
            clip.sampleId,
            clip.name,
            clip.bufferId,
            clip.trackId,
            this.beatsToMusical(splitBeat),
            rightDuration,
            rightOffset,
            clip.params.volume,
        );

        return rightClip;
    }

    updateClipBufferId(clipId: number, newBufferId: string): void {
        this.clips = this.clips.map((c) => (c.id === clipId ? { ...c, bufferId: newBufferId } : c));
    }

    getClipBufferRefcount(bufferId: string): number {
        return this.clips.filter((c) => c.bufferId === bufferId).length;
    }

    copyClips(ids: number[]): void {
        this.clipboard = this.clips.filter((c) => ids.includes(c.id));
    }

    pasteClips(playbackPositionBeats: number): TimelineClip[] {
        if (this.clipboard.length === 0) return [];

        let earliestStartBeats = Infinity;
        for (const clip of this.clipboard) {
            const start = this.musicalTimeToBeats(clip.time);
            if (start < earliestStartBeats) earliestStartBeats = start;
        }

        const offsetBeats = Math.max(0, playbackPositionBeats - earliestStartBeats);

        const pasted: TimelineClip[] = [];
        for (const clip of this.clipboard) {
            const originalStart = this.musicalTimeToBeats(clip.time);
            const newClip = this.addClip(
                clip.sampleId,
                clip.name,
                clip.bufferId,
                clip.trackId,
                this.beatsToMusical(originalStart + offsetBeats),
                this.musicalTimeToBeats(clip.duration),
                this.musicalTimeToBeats(clip.offset),
                clip.params.volume,
            );
            pasted.push(newClip);
        }
        return pasted;
    }

    cleanupOrphanedBuffers() {
        const clips = new Set(this.clips.map((c) => c.bufferId));
        bufferStore.deleteOrphaned(clips);
    }
}

export const timeline = new TimelineState();
