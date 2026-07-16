import { disconnectAudioNodesSafe } from "../utils";

export default abstract class AudioBaseNode {
    public get name() {
        return "AudioBaseNode::Unknown";
    }

    protected input: GainNode;
    protected output: GainNode;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();
    }

    receiveInput(source: AudioNode) {
        source.connect(this.input);
        return this;
    }

    connect(target: AudioNode | AudioBaseNode) {
        if (target instanceof AudioBaseNode) {
            target.receiveInput(this.output);
        } else {
            this.output.connect(target);
        }
        return this;
    }

    disconnect(target?: AudioNode) {
        if (target) disconnectAudioNodesSafe(this.output, target);
        this.output.disconnect();
        return this;
    }
}
