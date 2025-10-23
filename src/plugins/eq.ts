import builder from "../utils/uibuilder";
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
        const options = { min: -12, max: 12, step: 0.1, defaultValue: 0 };

        const children = this.bands.map((band) => {
            return builder.slider(
                `${band.frequency.value}Hz`,
                (value) => band.gain.setValueAtTime(value, this.audioContext.currentTime + 0.01),
                { ...options, formatter: (v) => `${v.toFixed(1)} dB`, value: band.gain.value}
            );
        });

        const container = builder.createContainer(
            ...children,
            this.mixSliderElement,
            this.inputSlider,
            this.outputSlider,
        );

        parent.innerHTML = "";
        parent.appendChild(container);
    }
}
