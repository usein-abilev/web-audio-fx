import builder from "../utils/uibuilder";
import { AudioPlugin } from "./plugin";

export class DelayPlugin extends AudioPlugin {
    public static readonly NAME = "Delay"
    public get name() {
        return DelayPlugin.NAME;
    }

    private maxDelayTime = 5; // in seconds
    private delay: DelayNode;
    private feedback: GainNode;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.delay = audioContext.createDelay(this.maxDelayTime);
        this.feedback = audioContext.createGain();

        this.delay.delayTime.value = 0.5;
        this.feedback.gain.value = 0.2;

        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.input.connect(this.delay)
        this.delay.connect(this.wetNode);
    }

    render(parent: HTMLElement) {
        const container = builder.createContainer(
            builder.slider("Feedback", (value) => (this.feedback.gain.value = value), {
                min: 0,
                max: 2,
                value: this.feedback.gain.value,
                defaultValue: 0.2,
                step: 0.01,
                formatter: (v) => `${(v * 100).toFixed(0)}%`,
            }),
            builder.slider("Delay", (value) => (this.delay.delayTime.value = value), {
                min: 0,
                max: this.maxDelayTime,
                value: this.delay.delayTime.value,
                defaultValue: 0.5,
                step: 0.1,
                formatter: (v) => `${v.toFixed(1)} sec`,
            }),
            this.mixSliderElement,
            this.inputSlider,
            this.outputSlider,
        );
        parent.innerHTML = "";
        parent.appendChild(container);
    }
}
