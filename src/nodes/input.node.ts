import type { AudioNodeParam } from "../plugins/params";
import { disconnectAudioNodesSafe } from "../utils";
import AudioBaseNode from "./node";

export class InputNode extends AudioBaseNode {
    private channelMerger: ChannelMergerNode;
    private stereoPanner: StereoPannerNode;

    // private panKnob: HTMLElement;

    private mono = false;
    private aliasName: string = "Input Node";
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
        // this.panKnob = builder.knob(
        //     "Pan",
        //     (value: number) => {
        //         this.stereoPanner.pan.setValueAtTime(value * 2 - 1, this.audioContext.currentTime),
        //             console.log("stereo panner:", this.stereoPanner.pan.value, value);
        //     },
        //     {
        //         max: 1,
        //         defaultValue: 0.5,
        //         value: (this.stereoPanner.pan.value + 1) / 2,
        //         formatter: (v) => {
        //             let prefix = "C";
        //             if (v < 0.5) prefix = "L";
        //             else if (v > 0.5) prefix = "R";
        //             return `${Math.abs(v * 200 - 100).toFixed(0)} ${prefix}`;
        //         },
        //     }
        // );
        //
        this.params = [
            {
                id: "input_gain",
                name: "Input Volume",
                type: "number",
                defaultValue: 1,
                getValue: () => this.input.gain.value,
                setValue: (value) => this.input.gain.setValueAtTime(
                    value as number,
                    this.audioContext.currentTime,
                ),
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
                setValue: (value) => this.stereoPanner.pan.setValueAtTime((value as number), this.audioContext.currentTime),
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

    // render(parent: HTMLElement) {
    //     parent.innerHTML = "";
    //
    //     const container = builder.createContainer(
    //         builder.checkbox("Mono: ", (value: boolean) => this.setMono(value), { defaultValue: this.mono }),
    //         this.panKnob,
    //         this.inputSlider,
    //         this.outputSlider,
    //     );
    //     parent.append(container);
    // }
}

