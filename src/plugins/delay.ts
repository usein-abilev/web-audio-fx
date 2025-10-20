
import { createPluginUI } from "../utils";
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
        this.feedback.gain.value = 0.1;
        
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.input.connect(this.delay)
        this.delay.connect(this.wetNode);
    }

    render(parent: HTMLElement) {
        const builder = createPluginUI();
        const container = builder.createContainer(
            builder.slider("Feedback", (value) => (this.feedback.gain.value = value), {
                min: 0,
                max: this.maxDelayTime,
                value: this.feedback.gain.value,
                defaultValue: 0,
                step: 0.1,
            }),
            builder.slider("Delay", (value) => (this.delay.delayTime.value = value), {
                min: 0,
                max: this.maxDelayTime,
                value: this.delay.delayTime.value,
                defaultValue: 0,
                step: 0.1,
            }),
            this.mixSliderElement,
            this.inputSlider,
            this.outputSlider,
        );
        parent.innerHTML = "";
        parent.appendChild(container);
    }
}
