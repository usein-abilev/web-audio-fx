import { AudioPlugin } from "./plugin";
import { createPluginUI, fetchAudioAsArrayBuffer } from "../utils";

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
];

export class ReverbPlugin extends AudioPlugin {
    public static readonly NAME = "Reverb (IR)";
    public get name() {
        return ReverbPlugin.NAME;
    }

    private convolver: ConvolverNode;

    constructor(audioContext: AudioContext) {
        super(audioContext);
        this.convolver = this.audioContext.createConvolver();
        this.input.connect(this.convolver).connect(this.wetNode);
    }

    setIRBuffer(buffer: AudioBuffer) {
        this.convolver.buffer = buffer;
    }

    render(parent: HTMLElement) {
        super.render(parent);
        const builder = createPluginUI();
        const typeOptions = IMPULSE_RESPONSES.map((ir) => ({
            value: ir.path,
            displayText: ir.title,
        }));
        const onTypeChange = (_: any, path: string) => {
           console.log("(reverb): Loading IR from path:", path);
            fetchAudioAsArrayBuffer(path)
                .then((buffer) => this.audioContext.decodeAudioData(buffer))
                .then((buffer) => this.setIRBuffer(buffer))
                .catch((error) => console.error("Error fetching IR audio buffer:", error));
        };
        const container = builder.createContainer(
            builder.createSelect("Type", onTypeChange, typeOptions),
            builder.createSlider("Mix", (ev: any) => this.setMixValue(+ev.target.value / 100), {
                min: "0",
                max: "100",
                defaultValue: String(this.getMixValue() * 100),
            })
        );
        parent.appendChild(container);
    }
}
