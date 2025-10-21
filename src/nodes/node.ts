import { createPluginUI, linearToDecibel } from "../utils";

export default abstract class AudioGraphNode {
    public input: GainNode;
    public output: GainNode;

    protected builder = createPluginUI();
    protected inputSlider: HTMLElement;
    protected outputSlider: HTMLElement;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();

        const knobOptions = {
            min: 0,
            max: 2,
            step: 0.1,
            defaultValue: 1,
            value: 1,
            formatter: (percent: number) => `${linearToDecibel(percent).toFixed(1)} dB`
        };
        const setGainDecibels = (gainNode: GainNode, percent: number) => {
            gainNode.gain.setValueAtTime(percent, this.audioContext.currentTime);
        };

        this.inputSlider = this.builder.knob(
            "Input Gain",
            (v) => setGainDecibels(this.input, v),
            knobOptions
        );
        this.outputSlider = this.builder.knob(
            "Output Gain",
            (v) => setGainDecibels(this.output, v),
            knobOptions
        );
    }

    abstract render(parent: HTMLElement): void;

    get name() {
        return "Audio Graph Node"
    }

    get [Symbol.toStringTag]() {
        return "AudioGraphNode";
    }
}

