import type { AudioNodeParam } from "./params";
import { AudioPlugin } from "./plugin";

export class Equalizer7BandPlugin extends AudioPlugin {
    public get name() {
        return "Equalizer (7 band)";
    }

    private bands: BiquadFilterNode[];

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

        this.params.push(...this.bands.map((band, i) => {
            const freq = band.frequency.value;
            return {
                id: `band_${i}`,
                name: `${freq}Hz`,
                type: "number" as const,
                min: -12,
                max: 12,
                step: 0.1,
                defaultValue: 0,
                getValue: () => band.gain.value,
                setValue: (value) => band.gain.setValueAtTime(value as number, this.audioContext.currentTime),
            } satisfies AudioNodeParam;
        }));
    }
}
