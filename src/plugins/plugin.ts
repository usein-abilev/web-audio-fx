import AudioGraphNode from "../nodes/node";
import builder from "../utils/uibuilder";

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

        this.mixSliderElement = builder.knob("Mix", (value) => this.setMixValue(value), {
            max: 1,
            value: this.getMixValue(),
            defaultValue: 1,
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

