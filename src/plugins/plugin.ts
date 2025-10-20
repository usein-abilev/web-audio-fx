import AudioGraphNode from "../nodes/node";
import { createPluginUI } from "../utils";

export class AudioPlugin extends AudioGraphNode {
    protected dryNode: GainNode;
    protected wetNode: GainNode;
    protected mixValue: number = 1;

    protected mixSliderElement: HTMLElement;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.dryNode = this.audioContext.createGain();
        this.wetNode = this.audioContext.createGain();
        this.setMixValue(1);

        this.input.connect(this.dryNode);
        this.wetNode.connect(this.output);
        this.dryNode.connect(this.output);

        this.mixSliderElement = createPluginUI().slider("Mix", (value) => this.setMixValue(value / 100), {
            min: 0,
            max: 100,
            value: this.getMixValue() * 100,
            defaultValue: 100,
        });
    }

    getMixValue() {
        return this.mixValue;
    }

    setMixValue(value: number) {
        this.mixValue = value;
        this.dryNode.gain.value = 1 - this.mixValue;
        this.wetNode.gain.value = this.mixValue;
    }

    render(parent: HTMLElement) {
        parent.innerHTML = ""
    }

    get name() {
        return "Unknown Audio Plugin"
    }

    get [Symbol.toStringTag]() {
        return "Audio Plugin";
    }
}

