export class AudioPlugin {
    public input: GainNode;
    public output: GainNode;

    protected dryNode: GainNode;
    protected wetNode: GainNode;
    protected mixValue: number = 1;

    constructor(protected audioContext: AudioContext) {
        this.input = this.audioContext.createGain();
        this.output = this.audioContext.createGain();
        this.dryNode = this.audioContext.createGain();
        this.wetNode = this.audioContext.createGain();
        this.setMixValue(1);

        this.input.connect(this.dryNode);
        this.wetNode.connect(this.output);
        this.dryNode.connect(this.output);
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

