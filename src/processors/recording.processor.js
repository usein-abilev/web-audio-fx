
class RecordingProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        this.channels = options.processorOptions?.channels || 0;
        this.sampleRate = options.processorOptions?.sampleRate || 0;
        this.maxRecordingFrames = options.processorOptions?.maxRecordingFrames || 0;

        this.recording = false;
        this.recordingOffset = 0;
        this.recordingBuffer = Array.from(
            { length: this.channels },
            () => new Float32Array(this.maxRecordingFrames)
        );

        this.port.onmessage = (event) => {
            if (event.type === "START_RECORDING") {
            }
            console.log("[RecordingProcessor] onmessage data:", event);
        };
    }

    process(inputs, outputs, params) {
        for (let i = 0; i < 1; i++) {
            for (let channel = 0; channel < this.channels; channel++) {
                const inputChannel = inputs[i][channel];
                const outputChannel = outputs[i][channel];

                // inputChannel.length always 128 samples
                for (let sample = 0; sample < inputChannel.length; sample++) {
                    const current = inputChannel[sample];
                    if (this.recording) {
                        this.recordingBuffer[channel][this.recordingOffset + sample] = current;
                    }

                    // keep stream unchanged
                    outputChannel[sample] = current;
                }
            }
        }

        return true;
    }
}

registerProcessor("recording-processor", RecordingProcessor);
