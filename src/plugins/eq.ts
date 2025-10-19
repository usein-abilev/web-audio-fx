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
        super.render(parent);
        const options = { min: "-40", max: "40", step: "1", defaultValue: "0" };
        const uiBuilder = createPluginUI();
        const onGainChange = (band: BiquadFilterNode) => (ev: any) => {
            const int = +ev.target.value;
            band.gain.value = int;
        };
        const children = this.bands.map((band) => {
            return uiBuilder.createSlider(
                `${band.frequency.value}Hz`,
                onGainChange(band),
                { ...options, defaultValue: String(band?.gain.value || 0) }
            );
        });
        const container = uiBuilder.createContainer(
            ...children,
            uiBuilder.createSlider("Mix", (ev: any) => this.setMixValue(+ev.target.value / 100), {
                min: "0",
                max: "100",
                defaultValue: String(this.getMixValue() * 100),
            })
        );
        parent.appendChild(container);
    }
}
