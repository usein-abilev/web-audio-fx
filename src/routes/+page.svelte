<script lang="ts">
    import AppHeader from "$lib/components/header/AppHeader.svelte";
    import SampleViewer from "$lib/components/sampleviewer/SampleViewer.svelte";
    import FileBrowser from "$lib/components/filebrowser/FileBrowser.svelte";
    import Timeline from "$lib/components/timeline/Timeline.svelte";
    import EffectsRack from "$lib/components/effects/EffectsRack.svelte";
    import { timeline, type MusicalTime } from "$lib/stores/timeline.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import { samples } from "$lib/stores/samples.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import { onMount } from "svelte";

    let { data } = $props();

    onMount(async () => {
        await audio.init();
        samples.registerSamples(data.samples);
    });

    async function handleTimelineClick(time: MusicalTime, trackId: number): Promise<number | null> {
        if (audio.isLoadingSample) return null;
        if (ui.selectedSampleId === null) return null;

        audio.isLoadingSample = true;
        try {
            const sampleId = ui.selectedSampleId;
            const sampleName = samples.getSampleName(sampleId) ?? "Unknown";
            const buffer = await samples.getBuffer(sampleId);
            if (!buffer) return null;

            // Inherit duration/offset from the last selected clip if same sample
            const lastClip =
                ui.lastSelectedClipId !== null && timeline.clips.find((c) => c.id === ui.lastSelectedClipId);

            if (lastClip && lastClip.sampleId === sampleId) {
                const durationBeats = lastClip.duration.bar * 4 + lastClip.duration.beat;
                const offsetBeats = lastClip.offset.bar * 4 + lastClip.offset.beat;
                const clip = timeline.addClip(
                    lastClip.sampleId,
                    lastClip.sampleName,
                    trackId,
                    time,
                    durationBeats,
                    offsetBeats,
                    lastClip.volume,
                );
                return clip.id;
            }

            const durationBeats = buffer.duration * (timeline.bpm / 60);
            const clip = timeline.addClip(sampleId, sampleName, trackId, time, durationBeats, 0);
            return clip.id;
        } finally {
            audio.isLoadingSample = false;
        }
    }
</script>

<AppHeader />
<SampleViewer />
<div class="content">
    <FileBrowser samples={data.samples} />
    <Timeline onTimelineClick={handleTimelineClick} />
</div>
<EffectsRack />

<style>
    .content {
        flex: 1;
        display: flex;
        overflow: hidden;
    }
</style>
