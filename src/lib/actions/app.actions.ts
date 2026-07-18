import { audio } from "$lib/stores/audio.svelte";
import { samples } from "$lib/stores/samples.svelte";
import { bufferStore } from "$lib/stores/buffer.svelte";
import { timeline, type MusicalTime } from "$lib/stores/timeline.svelte";

/**
 * Places a clip onto the timeline
 * Usage: user clicks on the timeline, user drag-and-drop files onto the timeline
 */
export async function placeTimelineClip(sampleId: string, time: MusicalTime, trackId: number): Promise<number | null> {
    if (audio.isLoadingSample) return null;

    audio.isLoadingSample = true;

    try {
        const sample = samples.getSample(sampleId);
        if (!sample) return null;

        const buffer = await samples.allocateOrFetchBuffers(sampleId);
        if (!buffer) return null;

        const buffers = bufferStore.getBuffersBySampleId(sampleId);
        if (buffers.length === 0) {
            console.error("Cannot add clip without buffer:", { sampleId, sample, buffers });
            return null;
        }
        const bufferId = buffers[0].id;
        const durationBeats = buffer.duration * (timeline.bpm / 60);
        const clip = timeline.addClip(sampleId, sample.name, bufferId, trackId, time, durationBeats, 0);
        return clip.id;
    } finally {
        audio.isLoadingSample = false;
    }
}

export async function placeTimelineClipDerivedFrom(clipId: number, time: MusicalTime, trackId: number) {
    const selectedClip = timeline.getClip(clipId);
    if (!selectedClip) return null;

    const durationBeats = selectedClip.duration.bar * 4 + selectedClip.duration.beat;
    const offsetBeats = selectedClip.offset.bar * 4 + selectedClip.offset.beat;
    const clip = timeline.addClip(
        selectedClip.sampleId,
        selectedClip.name,
        selectedClip.bufferId,
        trackId,
        time,
        durationBeats,
        offsetBeats,
        selectedClip.params.volume,
    );
    return clip.id;
}

export async function reverseTimelineClip(clipId: number) {
    const clip = timeline.getClip(clipId);
    if (!clip) return;

    // We allocate a new buffer, because we have to trigger the components re-rendering mechanism
    const newBufferId = samples.createReversedBuffer(clip.bufferId);
    timeline.updateClipBufferId(clipId, newBufferId);
    timeline.cleanupOrphanedBuffers();
}
