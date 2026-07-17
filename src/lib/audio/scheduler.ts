import { playMetronome } from "./metronome";
import type { TimelineClip } from "$lib/stores/timeline.svelte";

type GetTrackAudioState = (trackId: number) => {
    sinkNode: { receiveInput(node: AudioNode): void };
    pluginInstances: unknown[];
} | null;

export interface SchedulerConfig {
    getTrackAudioState: GetTrackAudioState;
    getBufferSync: (sampleId: string) => AudioBuffer | null;
    getBPM: () => number;
    getTimeSignature: () => { top: number };
    getClips: () => TimelineClip[];
    getMetronome: () => boolean;
    getTotalDurationBeats: () => number;
}

export class Scheduler {
    private audioContext: AudioContext;
    private config: SchedulerConfig;
    private tickInterval: ReturnType<typeof setInterval> | null = null;

    private scheduledClipKeys = new Set<string>();
    private scheduledSources: AudioBufferSourceNode[] = [];

    private nextMetronomeTime = 0;
    private metronomeBeatIndex = 0;

    readonly LOOKAHEAD = 0.1;
    readonly PERIOD = 0.025;

    private playbackStartTime = 0;

    constructor(audioContext: AudioContext, config: SchedulerConfig) {
        this.audioContext = audioContext;
        this.config = config;
    }

    start(playbackStartTime: number): void {
        this.stop();
        this.playbackStartTime = playbackStartTime;
        this.initMetronome();
        this.tickInterval = setInterval(() => this.tick(), this.PERIOD * 1000);
        this.tick();
    }

    stop(): void {
        if (this.tickInterval !== null) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        this.stopAllSources();
        this.scheduledClipKeys.clear();
        this.nextMetronomeTime = 0;
        this.metronomeBeatIndex = 0;
    }

    resetFromPosition(positionBeats: number): void {
        this.stopAllSources();
        this.scheduledClipKeys.clear();
        this.playbackStartTime = this.audioContext.currentTime - (positionBeats * 60) / this.config.getBPM();

        if (!this.config.getMetronome()) {
            this.nextMetronomeTime = 0;
            this.metronomeBeatIndex = 0;
        }
    }

    setMetronome(enabled: boolean, positionBeats: number): void {
        if (enabled) {
            this.computeMetronomeState(positionBeats);
        } else {
            this.nextMetronomeTime = 0;
            this.metronomeBeatIndex = 0;
        }
    }

    stopAllSources(): void {
        for (const s of this.scheduledSources) {
            try {
                s.stop();
            } catch {}
        }
        this.scheduledSources = [];
    }

    private initMetronome(): void {
        if (this.config.getMetronome()) {
            const positionBeats =
                ((this.audioContext.currentTime - this.playbackStartTime) * this.config.getBPM()) / 60;
            this.computeMetronomeState(Math.max(0, positionBeats));
        } else {
            this.nextMetronomeTime = 0;
            this.metronomeBeatIndex = 0;
        }
    }

    private computeMetronomeState(fromPositionBeats: number): void {
        const beatInterval = 60 / this.config.getBPM();
        const fraction = fromPositionBeats - Math.floor(fromPositionBeats);
        this.metronomeBeatIndex = Math.floor(fromPositionBeats) % this.config.getTimeSignature().top;

        if (fraction < 0.001) {
            this.nextMetronomeTime = this.audioContext.currentTime;
        } else {
            this.nextMetronomeTime = this.audioContext.currentTime + (1 - fraction) * beatInterval;
            this.metronomeBeatIndex = (this.metronomeBeatIndex + 1) % this.config.getTimeSignature().top;
        }
    }

    private tick(): void {
        const now = this.audioContext.currentTime;
        const lookahead = now + this.LOOKAHEAD;

        this.tickMetronome(lookahead);
        this.tickClips(now);
    }

    private tickMetronome(lookahead: number): void {
        if (this.nextMetronomeTime <= 0) return;

        const beatInterval = 60 / this.config.getBPM();
        const top = this.config.getTimeSignature().top;

        while (this.nextMetronomeTime < lookahead) {
            playMetronome(this.audioContext, this.metronomeBeatIndex, this.nextMetronomeTime);
            this.metronomeBeatIndex = (this.metronomeBeatIndex + 1) % top;
            this.nextMetronomeTime += beatInterval;
        }
    }

    private tickClips(now: number): void {
        const totalBeats = this.config.getTotalDurationBeats();
        if (totalBeats <= 0) return;

        const bpm = this.config.getBPM();
        const nowBeat = ((now - this.playbackStartTime) * bpm) / 60;
        const lookAheadBeats = (this.LOOKAHEAD * bpm) / 60;
        const lookaheadBeat = nowBeat + lookAheadBeats;

        const currentIter = Math.floor(nowBeat / totalBeats);

        for (const clip of this.config.getClips()) {
            const clipStartBeat = clip.time.bar * 4 + clip.time.beat;

            for (let i = currentIter; i <= currentIter + 1; i++) {
                const key = `${clip.id}_${i}`;
                if (this.scheduledClipKeys.has(key)) continue;

                const absoluteBeat = i * totalBeats + clipStartBeat;
                const clipDurationBeats = clip.duration.bar * 4 + clip.duration.beat;

                if (absoluteBeat >= nowBeat && absoluteBeat < lookaheadBeat) {
                    const delay = ((absoluteBeat - nowBeat) * 60) / bpm;
                    this.scheduleOneClip(clip, now + delay);
                    this.scheduledClipKeys.add(key);
                } else if (absoluteBeat < nowBeat && absoluteBeat + clipDurationBeats > nowBeat) {
                    const clipAudioStartTime = this.playbackStartTime + (absoluteBeat * 60) / bpm;
                    this.scheduleOneClip(clip, clipAudioStartTime);
                    this.scheduledClipKeys.add(key);
                }
            }
        }
    }

    private scheduleOneClip(clip: TimelineClip, audioTime: number): void {
        const trackState = this.config.getTrackAudioState(clip.trackId);
        if (!trackState) return;

        const buffer = this.config.getBufferSync(clip.sampleId);
        if (!buffer) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const clipGain = this.audioContext.createGain();
        source.connect(clipGain);
        trackState.sinkNode.receiveInput(clipGain);

        const clipDuration = ((clip.duration.bar * 4 + clip.duration.beat) * 60) / this.config.getBPM();
        let offsetSeconds = ((clip.offset.bar * 4 + clip.offset.beat) * 60) / this.config.getBPM();
        let startAt = audioTime;

        const elapsedSinceClipStart = this.audioContext.currentTime - startAt;
        if (elapsedSinceClipStart > 0) {
            if (elapsedSinceClipStart >= clipDuration) return;
            offsetSeconds += elapsedSinceClipStart;
            startAt = this.audioContext.currentTime;
        }

        const adjustedDuration = clipDuration - (elapsedSinceClipStart > 0 ? elapsedSinceClipStart : 0);
        const FADE_DURATION = 0.01;
        const fadeTime = Math.min(FADE_DURATION, adjustedDuration / 2);
        const endAt = startAt + adjustedDuration;

        if (offsetSeconds === 0) {
            clipGain.gain.value = clip.volume;
        } else {
            clipGain.gain.setValueAtTime(0.001, startAt);
            clipGain.gain.exponentialRampToValueAtTime(clip.volume, startAt + fadeTime);
        }

        clipGain.gain.setValueAtTime(clip.volume, endAt - fadeTime);
        clipGain.gain.exponentialRampToValueAtTime(0.001, endAt);

        source.start(startAt, offsetSeconds, adjustedDuration);
        this.scheduledSources.push(source);
    }
}
