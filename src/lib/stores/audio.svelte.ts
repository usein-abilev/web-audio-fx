import PLUGINS from "$lib/audio/plugins/index";
import { AudioPlugin } from "$lib/audio/plugins/plugin";
import { AudioSinkNode } from "$lib/audio/nodes/sink.node";
import { Scheduler } from "$lib/audio/scheduler";
import { timeline, MASTER_TRACK_ID, type TimelineTrack } from "./timeline.svelte";
import { samples } from "./samples.svelte";
import { bufferStore } from "$lib/stores/buffer.svelte";
import type { TrackAudioState } from "./types";

class AudioEngine {
    private audioContext: AudioContext | null = null;
    private masterPreNode: GainNode | null = null;
    private masterPostNode: TrackAudioState | null = null;
    private trackAudio = new Map<number, TrackAudioState>();

    private animationFrame: number | null = null;
    private playbackStartTime = 0;
    private looping = false;
    private scheduler: Scheduler | null = null;

    metronome = $state(false);
    isPlaying = $state(false);
    playbackPosition = $state(0);
    isLoadingSample = $state(false);

    isRecording = $state(false);
    private isCaptureActive = false;
    private mediaRecorder: MediaRecorder | null = null;
    private mediaStream: MediaStream | null = null;
    private recordingStartPosition = 0;

    get context(): AudioContext | null {
        return this.audioContext;
    }

    get destination(): AudioDestinationNode | undefined {
        return this.audioContext?.destination;
    }

    async init(): Promise<AudioContext> {
        if (this.audioContext) return this.audioContext;

        this.audioContext = new AudioContext();

        this.masterPreNode = this.audioContext.createGain();
        this.masterPostNode = {
            inputNode: this.audioContext.createGain(),
            sinkNode: new AudioSinkNode(this.audioContext, "Master"),
            pluginInstances: [],
        };
        this.masterPostNode.sinkNode.receiveInput(this.masterPreNode);

        this.rewireTrack(MASTER_TRACK_ID);

        for (const track of timeline.tracks) {
            this.createTrackAudio(track);
        }

        await samples.init();

        return this.audioContext;
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

    // Track audio

    createTrackAudio(track: TimelineTrack): void {
        if (!this.audioContext || !this.masterPreNode) return;

        const inputNode = this.audioContext.createGain();
        const sinkNode = new AudioSinkNode(this.audioContext, track.name);
        sinkNode.setGain(track.gain);
        sinkNode.setPan(track.pan);
        sinkNode.connect(this.masterPreNode);

        this.trackAudio.set(track.id, {
            inputNode,
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

    // Effects

    addPlugin(trackId: number, pluginId: string): void {
        if (!this.audioContext) return;

        const track = timeline.getTrackById(trackId);
        if (!track) return;

        const pluginDef = PLUGINS.find((p) => p.id === pluginId);
        if (!pluginDef) return;

        const plugin = pluginDef.getInstance(this.audioContext);
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        state.pluginInstances.push(plugin);
        track.pluginIds.push(pluginId);
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

        const track = timeline.getTrackById(trackId);
        if (track) {
            track.pluginIds = track.pluginIds.filter((_, i) => i !== index);
        }

        this.rewireTrack(trackId);
    }

    movePlugin(trackId: number, fromIndex: number, toIndex: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const [moved] = state.pluginInstances.splice(fromIndex, 1);
        state.pluginInstances.splice(toIndex, 0, moved);

        const track = timeline.getTrackById(trackId);
        if (track) {
            let tmp = track.pluginIds[toIndex];
            track.pluginIds[toIndex] = track.pluginIds[fromIndex];
            track.pluginIds[fromIndex] = tmp;
        }

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

    // Mixer

    updateTrackGain(trackId: number, gain: number): void {
        const state = this.getTrackAudioState(trackId);
        if (!state) return;

        const gainParam = state.sinkNode.getParams().find((p) => p.id === "input_gain");
        if (gainParam) gainParam.setValue(gain);
        const track = timeline.getTrackById(trackId);
        if (track) track.gain = gain;
    }

    toggleMute(trackId: number): void {
        const track = timeline.getTrackById(trackId);
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
        const track = timeline.getTrackById(trackId);
        if (!track) return;
        track.solo = !track.solo;
        const hasSolo = timeline.tracks.some((t) => t.solo);
        for (const t of timeline.tracks) {
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
        const track = timeline.getTrackById(trackId);
        if (track) track.pan = pan;
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

        let lastNode: GainNode | AudioPlugin = state.inputNode;
        for (const plugin of activePlugins) {
            if (lastNode instanceof AudioNode) {
                plugin.receiveInput(lastNode);
            } else {
                lastNode.connect(plugin);
            }
            lastNode = plugin;
        }

        const targetNode = trackId === MASTER_TRACK_ID ? this.audioContext!.destination : this.masterPreNode!;

        if (lastNode instanceof AudioPlugin) {
            lastNode.connect(state.sinkNode);
        } else {
            state.sinkNode.receiveInput(lastNode as any);
        }

        state.sinkNode.connect(targetNode);
    }

    // Playback

    private stopAudio(): void {
        this.stopCapture();
        this.scheduler?.stop();
        this.isPlaying = false;
        this.looping = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    private async startPlaybackFrom(positionBeats: number): Promise<void> {
        const startOffsetSeconds = (positionBeats * 60) / timeline.bpm;
        this.looping = true;
        this.isPlaying = true;
        this.playbackStartTime = this.audioContext!.currentTime - startOffsetSeconds;

        await samples.prefetchClipBuffers(timeline.clips.map((c) => c.bufferId));

        this.scheduler = new Scheduler(this.audioContext!, {
            getTotalDurationBeats: () => timeline.getTotalDurationBeats(),
            getTrackAudioState: (id) => this.getTrackAudioState(id),
            getBufferSync: (id) => bufferStore.getBuffer(id),
            getBPM: () => timeline.bpm,
            getTimeSignature: () => timeline.timeSignature,
            getClips: () => timeline.clips,
            getMetronome: () => audio.metronome,
        });
        this.scheduler.start(this.playbackStartTime);

        const totalDurationSeconds = timeline.getTotalDurationSeconds();
        this.startCursorAnimation(totalDurationSeconds, timeline.bpm);
        await this.startCapture();
    }

    async play(): Promise<void> {
        if (!this.audioContext) return;
        if (this.looping) return;
        if (this.audioContext.state === "suspended") {
            this.audioContext.resume();
        }

        this.stopAudio();
        this.playbackPosition = 0;
        await this.startPlaybackFrom(0);
    }

    async resume(): Promise<void> {
        if (!this.audioContext) return;
        if (this.looping) return;
        if (this.audioContext.state === "suspended") {
            this.audioContext.resume();
        }

        this.stopAudio();
        await this.startPlaybackFrom(this.playbackPosition);
    }

    pause(): void {
        this.stopAudio();
    }

    stop(): void {
        this.stopAudio();
        this.playbackPosition = 0;
    }

    setMetronome(value: boolean) {
        if (!this.scheduler) return;
        this.metronome = value;
        this.scheduler.setMetronome(value, audio.playbackPosition);
    }

    private startCursorAnimation(totalDurationSeconds: number, bpm: number): void {
        const animate = () => {
            if (!this.audioContext || !this.looping) return;

            const elapsed = this.audioContext.currentTime - this.playbackStartTime;

            if (this.isCaptureActive) {
                this.playbackPosition = (elapsed * bpm) / 60;
            } else {
                const positionSeconds = elapsed % totalDurationSeconds;
                this.playbackPosition = (positionSeconds * bpm) / 60;
            }

            this.animationFrame = requestAnimationFrame(animate);
        };
        this.animationFrame = requestAnimationFrame(animate);
    }

    // Recording

    private async startCapture(): Promise<void> {
        if (!this.isRecording || this.isCaptureActive) return;
        this.mediaRecorder = await this.createStreamRecorder();
        this.isCaptureActive = true;
        this.recordingStartPosition = this.playbackPosition;
        this.mediaRecorder.start();
    }

    private stopCapture(): void {
        if (!this.isRecording || !this.isCaptureActive || !this.mediaRecorder) return;
        this.isCaptureActive = false;
        this.mediaRecorder.stop();
    }

    async armRecording(): Promise<void> {
        if (this.isRecording || !this.audioContext) return;
        this.mediaRecorder = await this.createStreamRecorder();
        this.isRecording = true;
    }

    disarmRecording(): void {
        if (!this.isRecording) return;
        this.stopCapture();
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((t) => t.stop());
            this.mediaStream = null;
        }
        this.mediaRecorder = null;
        this.isRecording = false;
        this.isCaptureActive = false;
    }

    private async createStreamRecorder() {
        if (!this.mediaStream) {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 1,
                },
            });
            this.mediaStream = stream;
        }
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(this.mediaStream, { mimeType: "audio/webm" });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: "audio/webm" });
            const endPosition = this.playbackPosition;
            try {
                const rawBuffer = await blob.arrayBuffer();
                const arrayBufferCopy = rawBuffer.slice(0);
                const audioBuffer = await this.audioContext!.decodeAudioData(arrayBufferCopy);
                const sampleId = crypto.randomUUID();
                const name = `Recording ${Date.now()}`;

                await samples.saveRecording(sampleId, name, rawBuffer.slice(0), audioBuffer);

                const durationBeats = Math.max(0, endPosition - this.recordingStartPosition);
                if (durationBeats <= 0) return;

                const startBar = Math.floor(this.recordingStartPosition / 4);
                const startBeat = this.recordingStartPosition % 4;

                let track = timeline.tracks.find((t) => !timeline.clips.some((c) => c.trackId === t.id));
                if (!track) {
                    const newId = Math.max(...timeline.tracks.map((t) => t.id), 0) + 1;
                    const newTrack: TimelineTrack = {
                        id: newId,
                        name: `Track ${timeline.tracks.length + 1}`,
                        gain: 1,
                        pan: 0,
                        muted: false,
                        solo: false,
                        pluginIds: [],
                    };
                    timeline.tracks.push(newTrack);
                    this.createTrackAudio(newTrack);
                    track = newTrack;
                }

                const buffers = bufferStore.getBuffersBySampleId(sampleId);
                const bufferId = buffers.length > 0 ? buffers[0].id : "";
                timeline.addClip(
                    sampleId,
                    name,
                    bufferId,
                    track!.id,
                    { bar: startBar, beat: startBeat },
                    durationBeats,
                    0,
                );
            } catch (err) {
                console.error("Failed to process recording:", err);
            }
        };

        return recorder;
    }
}

export const audio = new AudioEngine();
