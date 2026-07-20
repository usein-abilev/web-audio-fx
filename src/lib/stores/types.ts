import type { AudioSinkNode } from "$lib/audio/nodes/sink.node";
import type { AudioPlugin } from "$lib/audio/plugins/plugin";

export type TrackAudioState = {
    inputNode: GainNode;
    sinkNode: AudioSinkNode;
    pluginInstances: AudioPlugin[];
};
