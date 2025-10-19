
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
        this.feedback.gain.value = 0.2;
        
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.input.connect(this.delay)
        this.delay.connect(this.wetNode);
    }

    render(parent: HTMLElement) {
        super.render(parent);
        const uiBuilder = createPluginUI();
        const container = uiBuilder.createContainer(
            uiBuilder.createSlider("Feedback", (ev: any) => (this.feedback.gain.value = +ev.target.value), {
                min: "0",
                max: String(this.maxDelayTime),
                defaultValue: "0.2",
                step: "0.1",
            }),
            uiBuilder.createSlider("Delay", (ev: any) => (this.delay.delayTime.value = +ev.target.value), {
                min: "0",
                max: String(this.maxDelayTime),
                defaultValue: "0.5",
                step: "0.1",
            }),
            uiBuilder.createSlider("Mix", (ev: any) => this.setMixValue(+ev.target.value / 100), {
                min: "0",
                max: "100",
                defaultValue: String(this.getMixValue() * 100),
            })
        );
        parent.appendChild(container);
    }
}
