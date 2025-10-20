import { createPluginUI } from "../utils";
import { AudioPlugin } from "./plugin";

export class Equalizer7BandPlugin extends AudioPlugin {
    public static readonly NAME = "Equalizer (7 Band)";
    public get name() {
        return Equalizer7BandPlugin.NAME;
    }

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

        this.input.connect(this.bands[0]);
        this.bands.at(-1)?.connect(this.wetNode);
    }

    render(parent: HTMLElement) {
        const options = { min: -40, max: 40, step: 1, defaultValue: 0 };
        const builder = createPluginUI();

        const children = this.bands.map((band) => {
            return builder.slider(
                `${band.frequency.value}Hz`,
                (value) => band.gain.setValueAtTime(value, this.audioContext.currentTime + 0.05),
                { ...options, defaultValue: band.gain.value || 0 }
            );
        });

        const container = builder.createContainer(
            ...children,
            this.mixSliderElement,
        );

        parent.innerHTML = "";
        parent.appendChild(container);
    }
}
