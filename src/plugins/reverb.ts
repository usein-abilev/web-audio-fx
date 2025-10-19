import { AudioPlugin } from "./plugin";
import { createPluginUI } from "../utils";

export class ReverbPlugin extends AudioPlugin {
    private convolver: ConvolverNode | undefined;
    private buffer: AudioBuffer | undefined;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.convolver = this.audioContext.createConvolver();
        this.input.connect(this.convolver).connect(this.wetNode);
        this.input.connect(this.dryNode);

        this.wetNode.connect(this.output);
        this.dryNode.connect(this.output);
    }

    setIRBuffer(buffer: AudioBuffer) {
        this.buffer = buffer;
    }

    connect(src: AudioNode) {
        if (!this.buffer) {
            console.warn("Cannot connect reverb plugin without IR buffer");
            return;
        }
        // src.connect(this.dryNode);
    }

    render(parent: HTMLElement) {
        const builder = createPluginUI();
        const container = builder.createContainer(
            builder.createSlider("Mix", (ev: any) => this.setMixValue(+ev.target.value / 100), {
                min: "0",
                max: "100",
                defaultValue: "100",
            })
        );
        parent.appendChild(container);
    }
}
