import { Equalizer7BandPlugin } from "./eq";
import { ReverbPlugin } from "./reverb";
import { DelayPlugin } from "./delay";
import { CompressorPlugin } from "./compressor";

const PLUGINS = [
    {
        id: "reverb",
        name: "Reverb",
        getInstance: (actx: AudioContext) => new ReverbPlugin(actx),
    },
    {
        id: "equalizer",
        name: "EQ (7 Band)",
        getInstance: (actx: AudioContext) => new Equalizer7BandPlugin(actx),
    },
    {
        id: "delay",
        name: "Delay",
        getInstance: (actx: AudioContext) => new DelayPlugin(actx),
    },
    {
        id: "compressor",
        name: "Compressor",
        getInstance: (actx: AudioContext) => new CompressorPlugin(actx),
    },
];

export default PLUGINS;

