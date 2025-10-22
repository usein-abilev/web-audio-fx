import { createPluginUI, normalizeExpCurve, normalizeLinear, normalizeLog } from "../utils";
import { AudioPlugin } from "./plugin";

export class CompressorPlugin extends AudioPlugin {
    public get name() {
        return "Compressor";
    }

    private compressor: DynamicsCompressorNode;
    private blockElement: HTMLElement;

    constructor(audioContext: AudioContext) {
        super(audioContext);

        this.compressor = audioContext.createDynamicsCompressor();

        this.input.connect(this.compressor)
        this.compressor.connect(this.wetNode);

        const builder = createPluginUI();

        const formatDb = (db: number) => `${db.toFixed(1)} dB`;
        const formatMs = (ms: number) => `${(ms * 1000).toFixed(1)} ms`;
        const formatNum = (value: number) => value.toFixed(1);

        const params = {
            threshold: { min: -60, max: 0, defaultValue: 0, format: formatDb, type: "log" },
            knee: { min: 0, max: 40, defaultValue: 18, format: formatDb, type: "log" },
            ratio: { min: 1, max: 20, defaultValue: 4, format: formatNum, type: "linear" },
            attack: { min: 0.005, max: 0.25, defaultValue: 0.005, speed: 0.2, format: formatMs, type: "exp" },
            release: { min: 0.005, max: 0.25, defaultValue: 0.005, speed: 0.2, format: formatMs, type: "exp" },
        };

        const getNormalizerByType = (type: string) => {
            let normalize = normalizeLinear;
            if (type === "log") normalize = normalizeLog;
            else if (type === "exp") normalize = normalizeExpCurve
            return normalize;
        }
        this.blockElement = builder.block(Object.keys(params).map((item) => {
            const property = item as unknown as keyof typeof params;
            const param = params[property];
            const audioParam = this.compressor[property];
            const normalize = getNormalizerByType(param.type); 
            return builder.knob(
                property.charAt(0).toUpperCase() + property.slice(1),
                (value) => audioParam.setValueAtTime(normalize(value, param.min, param.max), this.audioContext.currentTime),
                { defaultValue: 0.5, value: 0.5, speed: "speed" in param ? param.speed : 0.5, formatter: (v) => param.format?.(normalize(v, param.min, param.max)) },
            );
        }));
    }

    render(parent: HTMLElement) {
        const builder = createPluginUI();
        const container = builder.createContainer(
            builder.splitterHorizontal(),
            this.blockElement,
            builder.splitterHorizontal(),
            this.mixSliderElement,
            this.inputSlider,
            this.outputSlider,
        );
        parent.innerHTML = "";
        parent.appendChild(container);
    }
}

