import builder from "../utils/uibuilder"
import { decibelToLinear, linearToDecibel } from "../utils";

export default abstract class AudioGraphNode {
    public input: GainNode;
    public output: GainNode;

    protected inputSlider: HTMLElement;
    protected outputSlider: HTMLElement;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();

        const gainDefaultValue = decibelToLinear(0);

        const knobOptions = {
            min: 0,
            max: 2.0,
            defaultValue: gainDefaultValue,
            value: gainDefaultValue,
            speed: 0.3,
            formatter: (percent: number) => `${linearToDecibel(percent).toFixed(1)} dB`
        };
        const setGainDecibels = (gainNode: GainNode, percent: number) => {
            gainNode.gain.setValueAtTime(percent, this.audioContext.currentTime);
        };

        this.inputSlider = builder.knob(
            "Input Gain",
            (v) => setGainDecibels(this.input, v),
            knobOptions
        );
        this.outputSlider = builder.knob(
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

