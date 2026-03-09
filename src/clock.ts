export type AudioSchedulerOptions = {
    /**
     * Initial BPM of the scheduler
     */
    bpm: number;

    /**
     * Time signature as [beats per bar, beat unit].
     * For example: [4, 4] for 4/4, [3, 4] for 3/4
     */
    timeSignature: [number, number];

    /**
     * Callback that executes each tick (beat) of the scheduler
     * @param beat - The current beat number within the bar (0 to timeSignature[0]-1)
     * @param time - The AudioContext time when this beat occurs
     */
    onTick: (beat: number, time: number) => void;
};

/**
 * A lightweight audio scheduler that fires callbacks on each beat.
 * Uses the Web Audio API's `currentTime` for precise scheduling with lookahead
 */
export class AudioScheduler {
    private static readonly LOOKAHEAD_TIME = 0.05;
    private static readonly SCHEDULER_INTERVAL_MS = 25;

    private bpm = 120;
    private timeSignature: [number, number] = [4, 4];

    private playing = false;
    private nextBeatTime = 0;
    private currentBeat = 0;
    private timerId: NodeJS.Timeout | null = null;

    constructor(
        private audioContext: AudioContext,
        private options: AudioSchedulerOptions
    ) {
        this.bpm = this.options.bpm;
        [this.timeSignature[0], this.timeSignature[1]] = [this.options.timeSignature[0], this.options.timeSignature[1]];
    }

    isPlaying() {
        return this.playing;
    }

    /**
     * Sets the tempo in beats per minute.
     * @param value - BPM value
     */
    setBPM(value: number) {
        this.bpm = value;
    }

    getBPM() {
        return this.bpm
    }

    /**
     * Starts the scheduler. The `onTick` callback will be invoked on each beat.
     */
    start() {
        if (this.playing) return;
        this.playing = true;
        this.loop();
    }

    /**
     * Stops the scheduler. No more callbacks will be fired until `start()` is called again.
     */
    stop() {
        this.playing = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
        }
    }

    reset() {
        this.stop();
        this.currentBeat = 0;
        this.nextBeatTime = 0;
        this.start();
    }

    private loop() {
        while (this.nextBeatTime < this.audioContext.currentTime + AudioScheduler.LOOKAHEAD_TIME) {
            this.scheduleEvent(this.currentBeat, this.nextBeatTime);
            this.nextTick();
        }
        this.timerId = setTimeout(() => this.loop(), AudioScheduler.SCHEDULER_INTERVAL_MS);
    }

    private scheduleEvent(beat: number, time: number) {
        if (typeof this.options.onTick === "function") {
            this.options.onTick(beat, time);
        }
    }

    private nextTick() {
        const fraction = this.timeSignature[0] / this.timeSignature[1];
        const beatDuration = (60 / this.bpm) * fraction;
        this.nextBeatTime += beatDuration;
        this.currentBeat = (this.currentBeat + 1) % this.timeSignature[0];
    }
}
