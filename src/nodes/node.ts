import { createPluginUI, decibelToLinear, linearToDecibel } from "../utils";

const GAIN_MIN_VALUE_DB = -60;
const GAIN_MAX_VALUE_DB = 6;
const GAIN_STEP = 0.001;

export default abstract class AudioGraphNode {
    public input: GainNode;
    public output: GainNode;

    protected builder = createPluginUI();
    protected inputSlider: HTMLElement;
    protected outputSlider: HTMLElement;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();

        const sliderOptions = {
            min: 0,
            max: 1.9,
            step: GAIN_STEP,
            defaultValue: 1,
            value: 1,
            formatter: (linear: number) => {
                const decibel = linearToDecibel(linear);
                return `${decibel.toFixed(1)} dB`;
            },
        };
        const setGainDecibels = (gainNode: GainNode, value: number) => {
            gainNode.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
        };

        this.inputSlider = this.builder.slider(
            "Input Gain",
            (v) => setGainDecibels(this.input, v),
            sliderOptions
        );
        this.outputSlider = this.builder.slider(
            "Output Gain",
            (v) => setGainDecibels(this.output, v),
            sliderOptions
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

