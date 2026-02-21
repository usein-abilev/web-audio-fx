import { disconnectAudioNodesSafe } from "../utils";

export default abstract class AudioBaseNode {
    public get name() {
        return "AudioBaseNode::Unknown"
    }

    protected input: GainNode;
    protected output: GainNode;

    // protected inputSlider: HTMLElement;
    // protected outputSlider: HTMLElement;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();

        // const gainDefaultValue = decibelToLinear(0);

        // const knobOptions = {
        //     min: 0,
        //     max: 2.0,
        //     defaultValue: gainDefaultValue,
        //     value: gainDefaultValue,
        //     speed: 0.3,
        //     formatter: (percent: number) => `${linearToDecibel(percent).toFixed(1)} dB`
        // };
        // const setGainDecibels = (gainNode: GainNode, percent: number) => {
        //     gainNode.gain.setValueAtTime(percent, this.audioContext.currentTime);
        // };
        //
        // this.inputSlider = builder.knob(
        //     "Input Gain",
        //     (v) => setGainDecibels(this.input, v),
        //     knobOptions
        // );
        // this.outputSlider = builder.knob(
        //     "Output Gain",
        //     (v) => setGainDecibels(this.output, v),
        //     knobOptions
        // );
    }

    connectInput(source: AudioNode) {
        source.connect(this.input);
        return this;
    }

    connect(target: AudioNode) {
        this.output.connect(target);
        return this;
    }

    disconnect(target?: AudioNode) {
        if (target)
            disconnectAudioNodesSafe(this.output, target);
        this.output.disconnect();
        return this;
    }
}

