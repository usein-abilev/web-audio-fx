const STATE = {
    IDLE: "IDLE",
    PREPARE_REC: "PREPARE_REC",
    RECORDING: "RECORDING",
    PREPARE_PLAY: "PREPARE_PLAY",
    PLAYING: "PLAYING",
    PREPARE_DUB: "PREPARE_DUB",
    OVERDUBBING: "OVERDUBBING",
};

class RecordingProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        this.channels = options.processorOptions?.channels || 2;
        this.sampleRate = options.processorOptions?.sampleRate || 44100;
        this.maxRecordingFrames = options.processorOptions?.maxRecordingFrames || 0;
        this.latencyFrames = Math.floor((options.processorOptions?.latencyFrames || 0) * this.sampleRate);

        this.state = STATE.IDLE;
        this.loopLength = 0;
        this.currentIndex = 0;
        this.scheduledTime = 0;

        this.buffer = Array.from({ length: this.channels }, () => new Float32Array(this.maxRecordingFrames));

        this.port.onmessage = (event) => {
            const { command, time } = event.data;

            console.log("[AudioProcessor] command:", command);
            if (command === "START_RECORDING") {
                this.state = STATE.PREPARE_REC;
                this.scheduledTime = time;
                this.currentIndex = 0;
            } else if (command === "STOP_RECORDING") {
                this.state = STATE.PREPARE_PLAY;
                this.scheduledTime = time;
                if (!this.loopLength) {
                    this.loopLength = this.currentIndex;
                    this.port.postMessage({
                        event: "BUFFER_DATA",
                        buffer: this.buffer,
                        loopLength: this.loopLength,
                        sampleRate: this.sampleRate,
                        channels: this.channels,
                    });
                }
            } else if (command === "START_OVERDUB") {
                this.state = STATE.PREPARE_DUB;
                this.scheduledTime = time;
            } else if (command === "CLEAR") {
                this.state = STATE.IDLE;
                this.loopLength = 0;
                this.currentIndex = 0;
                this.scheduledTime = 0;
                this.buffer.forEach((buffer) => {
                    buffer.fill(0);
                });
            } else if (command === "GET_BUFFER") {
            }
        };
    }

    process(inputs, outputs, params) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input.length) return true;

        const channels = Math.min(input.length, output.length, this.channels);
        const frames = input[0].length;

        for (let frame = 0; frame < frames; frame++) {
            const currentSampleTime = currentTime + frame / this.sampleRate;

            if (this.scheduledTime > 0 && currentSampleTime >= this.scheduledTime) {
                if (this.state === STATE.PREPARE_REC) this.state = STATE.RECORDING;
                if (this.state === STATE.PREPARE_PLAY) this.state = STATE.PLAYING;
                if (this.state === STATE.PREPARE_DUB) this.state = STATE.OVERDUBBING;

                this.scheduledTime = 0;
            }

            for (let channel = 0; channel < channels; channel++) {
                const inSample = input[channel][frame];
                let outSample = 0;

                let writeIndex = this.currentIndex;
                let readIndex = this.currentIndex;

                if (this.state === STATE.RECORDING) {
                    if (writeIndex >= 0 && writeIndex < this.maxRecordingFrames) {
                        this.buffer[channel][writeIndex] = inSample;
                    }
                } else if (this.state === STATE.PLAYING) {
                    readIndex += this.latencyFrames;
                    if (this.loopLength > 0) {
                        readIndex %= this.loopLength;
                    }
                    outSample = this.buffer[channel][readIndex];
                } else if (this.state === STATE.OVERDUBBING) {
                    this.buffer[channel][writeIndex] += inSample;
                }

                output[channel][frame] = outSample;
            }

            if (this.state !== STATE.IDLE && this.state !== STATE.PREPARE_REC) {
                this.currentIndex++;

                if (this.loopLength > 0 && this.currentIndex >= this.loopLength) {
                    this.currentIndex = 0;
                }
            }
        }

        return true;
    }
}

registerProcessor("recording-processor", RecordingProcessor);
