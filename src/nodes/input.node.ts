import { createPluginUI, decibelToLinear } from "../utils";
import AudioGraphNode from "./node";

export class InputGraphNode extends AudioGraphNode {
    private mono = false;

    private channelMerger: ChannelMergerNode;
    private stereoPanner: StereoPannerNode;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.channelMerger = audioContext.createChannelMerger();
        this.stereoPanner = audioContext.createStereoPanner();

        this.input.connect(this.stereoPanner);
        this.stereoPanner.connect(this.output);
    }

    public get name() {
        return "Input Node";
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
        const builder = createPluginUI();

        const container = builder.createContainer(
            builder.checkbox("Mono: ", (value: boolean) => this.setMono(value), { defaultValue: this.mono }),
            builder.slider("Pan", (value: number) => this.stereoPanner.pan.setTargetAtTime(value, this.audioContext.currentTime + 0.01, 0.01), {
                min: -1,
                max: 1,
                step: 0.1,
                defaultValue: 0,
                value: this.stereoPanner.pan.value,
            }),
            this.inputSlider,
            this.outputSlider,
        );
        parent.append(container);
    }
}
