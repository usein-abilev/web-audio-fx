import type { AudioNodeParam } from "../plugins/params";
import { disconnectAudioNodesSafe } from "../utils";
import AudioBaseNode from "./node";

export class AudioSinkNode extends AudioBaseNode {
    private channelMerger: ChannelMergerNode;
    private stereoPanner: StereoPannerNode;

    private mono = false;
    private aliasName: string = "Audio Sink";
    private params: AudioNodeParam[];

    public get name() {
        return this.aliasName;
    }

    constructor(audioContext: AudioContext, aliasName?: string) {
        super(audioContext);

        if (aliasName) {
            this.aliasName = aliasName;
        }

        this.channelMerger = audioContext.createChannelMerger();
        this.stereoPanner = audioContext.createStereoPanner();
        this.setMono(false);
        this.stereoPanner.connect(this.output);
        this.params = [
            {
                id: "input_gain",
                name: "Input Volume",
                type: "number",
                defaultValue: 1,
                getValue: () => this.input.gain.value,
                setValue: (value) => this.input.gain.setValueAtTime(value as number, this.audioContext.currentTime),
            },
            {
                id: "mono",
                name: "Mono",
                type: "boolean",
                defaultValue: false,
                getValue: () => this.mono,
                setValue: (value) => this.setMono(value as boolean),
            },
            {
                id: "pan",
                name: "Pan",
                type: "number",
                min: -1,
                max: 1,
                step: 0.01,
                defaultValue: 0.5,
                getValue: () => this.stereoPanner.pan.value,
                setValue: (value) =>
                    this.stereoPanner.pan.setValueAtTime(value as number, this.audioContext.currentTime),
            },
        ];
    }

    private setMono(mono: boolean) {
        this.mono = mono;
        if (!mono) {
            disconnectAudioNodesSafe(this.input, this.channelMerger);
            this.channelMerger.disconnect();
            this.input.connect(this.stereoPanner);
        } else {
            disconnectAudioNodesSafe(this.input, this.stereoPanner);
            this.input.connect(this.channelMerger, 0, 0);
            this.input.connect(this.channelMerger, 0, 1);
            this.channelMerger.connect(this.stereoPanner);
        }
    }

    getParams(): AudioNodeParam[] {
        return this.params;
    }

    setGain(value: number) {
        this.input.gain.setValueAtTime(value, this.audioContext.currentTime);
    }

    setPan(value: number) {
        this.stereoPanner.pan.setValueAtTime(value, this.audioContext.currentTime);
    }
}
