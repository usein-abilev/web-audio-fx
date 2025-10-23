import builder from "../utils/uibuilder";
import AudioGraphNode from "./node";

export class InputGraphNode extends AudioGraphNode {
    private mono = false;

    private channelMerger: ChannelMergerNode;
    private stereoPanner: StereoPannerNode;

    private panKnob: HTMLElement;

    public get name() {
        return "Input Node";
    }

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.channelMerger = audioContext.createChannelMerger();
        this.stereoPanner = audioContext.createStereoPanner();

        this.input.connect(this.stereoPanner);
        this.stereoPanner.connect(this.output);

        this.panKnob = builder.knob(
            "Pan",
            (value: number) => {
                this.stereoPanner.pan.setValueAtTime(value * 2 - 1, this.audioContext.currentTime),
                    console.log("stereo panner:", this.stereoPanner.pan.value, value);
            },
            {
                max: 1,
                defaultValue: 0.5,
                value: (this.stereoPanner.pan.value + 1) / 2,
                formatter: (v) => {
                    let prefix = "C";
                    if (v < 0.5) prefix = "L";
                    else if (v > 0.5) prefix = "R";
                    return `${Math.abs(v * 200 - 100).toFixed(0)} ${prefix}`;
                },
            }
        );
    }

    setMono(mono: boolean) {
        this.mono = mono;
        if (!mono) {
            this.input.disconnect(this.channelMerger);
            this.channelMerger.disconnect();
            this.input.connect(this.stereoPanner);
        } else {
            this.input.disconnect(this.stereoPanner);
            this.input.connect(this.channelMerger, 0, 0);
            this.input.connect(this.channelMerger, 0, 1);
            this.channelMerger.connect(this.stereoPanner);
        }
    }

    render(parent: HTMLElement) {
        parent.innerHTML = "";

        const container = builder.createContainer(
            builder.checkbox("Mono: ", (value: boolean) => this.setMono(value), { defaultValue: this.mono }),
            this.panKnob,
            this.inputSlider,
            this.outputSlider,
        );
        parent.append(container);
    }
}

