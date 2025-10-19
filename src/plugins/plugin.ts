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
    }

    getMixValue() {
        return this.mixValue;
    }

    setMixValue(value: number) {
        console.log("setMixValue", value);
        this.mixValue = value;
        this.dryNode.gain.value = 1 - this.mixValue;
        this.wetNode.gain.value = this.mixValue;
    }

    connect(src: AudioNode) {}

    disconnect() {
        // this.dryNode.disconnect();
        // this.wetNode.disconnect();
    }

    getOutputs(): AudioNode[] {
        return [this.wetNode];
    }
}

