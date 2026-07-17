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
        return "Reverb (IR)";
    }

    private delayNode: DelayNode;
    private convolver: ConvolverNode;
    private decayGain: GainNode;
    private selectedIRPath: string = "";

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.delayNode = audioContext.createDelay(0.1);
        this.convolver = audioContext.createConvolver();
        this.decayGain = audioContext.createGain();

        this.delayNode.delayTime.value = 0.02;
        this.decayGain.gain.value = 2;

        this.input.connect(this.delayNode);
        this.delayNode.connect(this.convolver);
        this.convolver.connect(this.decayGain);
        this.decayGain.connect(this.wetNode);

        this.params.push(
            {
                id: "predelay",
                name: "PreDelay",
                type: "number",
                min: 0,
                max: 0.1,
                step: 0.01,
                defaultValue: 0.02,
                getValue: () => this.delayNode.delayTime.value,
                setValue: (value) =>
                    this.delayNode.delayTime.setValueAtTime(value as number, this.audioContext.currentTime),
            },
            {
                id: "decay",
                name: "Decay",
                type: "number",
                min: 0.1,
                max: 10,
                step: 0.1,
                defaultValue: 2,
                getValue: () => this.decayGain.gain.value,
                setValue: (value) => this.decayGain.gain.setValueAtTime(value as number, this.audioContext.currentTime),
            },
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

        const irParam = this.params.find((p) => p.id === "ir");
        if (irParam) {
            irParam.setValue(irParam.defaultValue as string);
        }
    }

    private setIRBuffer(buffer: AudioBuffer) {
        this.convolver.buffer = buffer;
    }
}
