export type MusicalTime = {
    bar: number;
    beat: number;
};

export type TimelineClip = {
    id: number;
    sampleId: string;
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

class TimelineState {
    bpm = $state(140);
    timeSignature = $state({ top: 4, bottom: 4 });
    metronome = $state(false);

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
        { id: 8, name: "Track 9", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 9, name: "Track 10", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 10, name: "Track 11", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 11, name: "Track 12", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 12, name: "Track 13", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 13, name: "Track 14", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
        { id: 14, name: "Track 15", gain: 1, pan: 0, muted: false, solo: false, pluginIds: [] },
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

    musicalTimeToSeconds(time: MusicalTime): number {
        return ((time.bar * 4 + time.beat) * 60) / this.bpm;
    }

    getTotalDurationSeconds(): number {
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

    getTrackById(id: number): TimelineTrack | undefined {
        if (id === MASTER_TRACK_ID) return this.masterTrack;
        return this.tracks.find((t) => t.id === id);
    }

    addClip(
        sampleId: string,
        sampleName: string,
        trackId: number,
        time: MusicalTime,
        durationBeats: number,
        offsetBeats: number = 0,
        volume: number = 1.0,
    ): TimelineClip {
        const clip: TimelineClip = {
            id: this.nextClipId++,
            sampleId,
            sampleName,
            time,
            trackId,
            volume,
            duration: {
                bar: Math.floor(durationBeats / 4),
                beat: durationBeats % 4,
            },
            offset: {
                bar: Math.floor(offsetBeats / 4),
                beat: offsetBeats % 4,
            },
        };
        this.clips.push(clip);
        return clip;
    }

    removeClips(ids: number[]): void {
        this.clips = this.clips.filter((c) => !ids.includes(c.id));
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
                clip.volume,
            );
            pasted.push(newClip);
        }
        return pasted;
    }
}

export const timeline = new TimelineState();
