import { createPluginUI } from "../utils";
import { AudioPlugin } from "./plugin";

export class Equalizer7BandPlugin extends AudioPlugin {
    public bands: BiquadFilterNode[];

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.bands = [80, 250, 500, 1500, 3000, 5000, 8000].map((f, i) => {
            const band = this.audioContext.createBiquadFilter();
            if (i === 0) band.type = "lowshelf";
            else if (i === 6) band.type = "highshelf";
            else band.type = "peaking";
            band.frequency.value = f;
            band.Q.value = 1;
            return band;
        });
        this.bands.reduce((a, b) => (a.connect(b), b));

        this.input.connect(this.dryNode);
        this.input.connect(this.bands[0]);
        this.bands.at(-1)?.connect(this.wetNode);

        this.dryNode.connect(this.output);
        this.wetNode.connect(this.output);
    }

    connect(src: AudioNode) {}

    disconnect() {}

    render(parent: HTMLElement) {
        const setBandValue = (band: BiquadFilterNode | undefined, gainValue: number | string) => {
            if (band) {
                band.gain.value = +gainValue;
            }
        };

        const options = { min: "-40", max: "40", step: "1", defaultValue: "0" };
        const uiBuilder = createPluginUI();
        const children = this.bands.map((band) => {
            return uiBuilder.createSlider(
                `${band.frequency.value}Hz`,
                (ev: any) => setBandValue(band, ev.target.value),
                { ...options, defaultValue: String(band?.gain.value || 0) }
            );
        });
        const container = uiBuilder.createContainer(...children);
        parent.appendChild(container);
    }
}
