export default abstract class AudioGraphNode {
    public input: GainNode;
    public output: GainNode;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();
    }

    abstract render(parent: HTMLElement): void; 

    get name() {
        return "Audio Graph Node"
    }

    get [Symbol.toStringTag]() {
        return "AudioGraphNode";
    }
}

