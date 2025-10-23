import AudioGraphNode from "../nodes/node";
import { disconnectAudioNodesSafe } from "../utils";
import builder from "../utils/uibuilder";

export class AudioPlugin extends AudioGraphNode {
    public bypass = false;

    protected dryNode: GainNode;
    protected wetNode: GainNode;
    protected mixValue: number = 1;

    protected mixSliderElement: HTMLElement;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.dryNode = this.audioContext.createGain();
        this.wetNode = this.audioContext.createGain();

        this.setMixValue(1);
        this.setBypass(false);

        this.mixSliderElement = builder.knob("Mix", (value) => this.setMixValue(value), {
            max: 1,
            value: this.getMixValue(),
            defaultValue: 1,
        });
    }

    setBypass(value: boolean) {
        this.bypass = value;
        if (this.bypass) {
            disconnectAudioNodesSafe(this.wetNode, this.output);
            disconnectAudioNodesSafe(this.dryNode, this.output);
            disconnectAudioNodesSafe(this.input, this.dryNode);
            this.input.connect(this.output);
        } else {
            disconnectAudioNodesSafe(this.input, this.output);
            this.input.connect(this.dryNode);
            this.dryNode.connect(this.output);
            this.wetNode.connect(this.output);
        }
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

