import AudioBaseNode from "../nodes/node";
import { disconnectAudioNodesSafe } from "../utils";
import type { AudioNodeParam } from "./params";

export class AudioPlugin extends AudioBaseNode {
    public get name() {
        return "Unknown Audio Plugin"
    }

    private bypass = false;

    protected dryNode: GainNode;
    protected wetNode: GainNode;
    protected mixValue: number = 1;
    protected params: AudioNodeParam[];

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.dryNode = this.audioContext.createGain();
        this.wetNode = this.audioContext.createGain();

        this.setMixValue(1);
        this.setBypass(false);

        this.params = [
            {
                id: "bypass",
                name: "Bypass",
                type: "boolean",
                defaultValue: false,
                getValue: () => this.bypass,
                setValue: (value) => this.setBypass(value as boolean),
            },
            {
                id: "mix",
                name: "Mix",
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                defaultValue: 1,
                getValue: () => this.mixValue,
                setValue: (value) => this.setMixValue(value as number),
            },
        ];
    }

    getParams(): AudioNodeParam[] {
        return this.params;
    }

    protected setBypass(value: boolean) {
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

    protected setMixValue(value: number) {
        this.mixValue = value;
        this.dryNode.gain.value = 1 - this.mixValue;
        this.wetNode.gain.value = this.mixValue;
    }
}

