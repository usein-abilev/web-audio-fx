import { fetchAudioAsArrayBuffer, withBasePath } from "../utils";
import { AudioPlugin } from "./plugin";

const IMPULSE_RESPONSES = [
    {
        title: "Church",
        path: "/impulse_responses/Church Schellingwoude/Church Schellingwoude.wav",
    },
    {
        title: "Factory Hall",
        path: "/impulse_responses/Factory Hall/Factory Hall/Factory Hall.wav",
    },
    {
        title: "Claustrofobia v1.1",
        path: "/impulse_responses/Claustrofobia v1.1/Dustbin 3 mono/Dustbin 3.C.wav",
    },
].map((o) => ({ ...o, path: withBasePath(o.path) }));

export class ReverbPlugin extends AudioPlugin {
    public get name() {
        return "Reverb (IR)"
    }

    private convolver: ConvolverNode;
    private selectedIRPath: string = "";

    constructor(audioContext: AudioContext) {
        super(audioContext);
        this.convolver = this.audioContext.createConvolver();
        this.input.connect(this.convolver).connect(this.wetNode);

        this.params.push(
            {
                id: "ir",
                name: "Impulse Response",
                type: "select",
                options: IMPULSE_RESPONSES.map((ir) => ({ value: ir.path, label: ir.title })),
                defaultValue: IMPULSE_RESPONSES[0].path,
                getValue: () => this.selectedIRPath,
                setValue: (value) => {
                    const path = value as string;
                    if (this.selectedIRPath === path) return;
                    this.selectedIRPath = path;
                    fetchAudioAsArrayBuffer(path)
                        .then((buffer) => this.audioContext.decodeAudioData(buffer))
                        .then((buffer) => this.setIRBuffer(buffer))
                        .catch((error) => console.error("Error fetching IR audio buffer:", error));
                },
            },
        );
    }

    setIRBuffer(buffer: AudioBuffer) {
        this.convolver.buffer = buffer;
    }

    // render(parent: HTMLElement) {
    //     const typeOptions = IMPULSE_RESPONSES.map((ir) => ({
    //         value: ir.path,
    //         displayText: ir.title,
    //     }));
    //     const onTypeChange = (path: string) => {
    //         if (this.selectedIRPath === path) return;
    //         this.selectedIRPath = path;
    //         console.log("(reverb): Loading IR from path:", path);
    //         fetchAudioAsArrayBuffer(path)
    //             .then((buffer) => this.audioContext.decodeAudioData(buffer))
    //             .then((buffer) => this.setIRBuffer(buffer))
    //             .catch((error) => console.error("Error fetching IR audio buffer:", error));
    //     };
    //     if (!this.selectedIRPath) {
    //         onTypeChange(IMPULSE_RESPONSES[0].path);
    //     }
    //     const container = builder.createContainer(
    //         builder.select("Type", onTypeChange, { options: typeOptions, selectedValue: this.selectedIRPath }),
    //         this.mixSliderElement,
    //     );
    //
    //     parent.innerHTML = "";
    //     parent.appendChild(container);
    // }
}
