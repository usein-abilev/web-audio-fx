import builder from "../utils/uibuilder";
import AudioGraphNode from "./node"

export class OutputGraphNode extends AudioGraphNode {
    constructor(audioContext: AudioContext) {
        super(audioContext);
        this.input.connect(this.output);
    }

    public get name () {
        return "Output Node"; 
    }

    render(parent: HTMLElement) {
        parent.innerHTML = "";

        const container = builder.createContainer(
            this.inputSlider,
            this.outputSlider,
        );
        parent.append(container);
    }
}
