import AudioGraphNode from "./node"

export class OutputGraphNode extends AudioGraphNode {
    private channelMerger: ChannelMergerNode;
    private stereoPanner: StereoPannerNode;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.input.connect(this.output);
        
        // this.channelMerger = audioContext.createChannelMerger();
        // this.stereoPanner = audioContext.createStereoPanner();
        //
        // this.input.connect(this.channelMerger, 0, 0);
        // this.input.connect(this.channelMerger, 0, 1);
        // this.channelMerger.connect(this.stereoPanner);
        // this.stereoPanner.connect(this.output);
    }

    public get name () {
        return "Output Node"; 
    }

    render(parent: HTMLElement) {
        parent.innerHTML = "<h1>TODO Output Graph Node UI</h1>";
    }
}
