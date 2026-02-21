import builder from "../utils/uibuilder";
import AudioBaseNode from "./node"

export class OutputGraphNode extends AudioBaseNode {
    public get name() {
        return "Output Node";
    }

    constructor(audioContext: AudioContext) {
        super(audioContext);
        this.input.connect(this.output);
    }

    //
    // render(parent: HTMLElement) {
    //     parent.innerHTML = "";
    //
    //     const container = builder.createContainer(
    //         this.inputSlider,
    //         this.outputSlider,
    //     );
    //     parent.append(container);
    // }
}
