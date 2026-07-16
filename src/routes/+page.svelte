<script lang="ts">
    import AppHeader from "$lib/components/header/AppHeader.svelte";
    import SampleViewer from "$lib/components/sample-viewer/SampleViewer.svelte";
    import FileBrowser from "$lib/components/file-browser/FileBrowser.svelte";
    import Timeline from "$lib/components/timeline/Timeline.svelte";
    import EffectsRack from "$lib/components/effects/EffectsRack.svelte";
    import { timeline, type MusicalTime } from "$lib/stores/timeline.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import { onMount } from "svelte";

    let { data } = $props();

    onMount(() => {
        timeline.init();
        timeline.registerSamples(data.samples);
    });

    async function handleTimelineClick(time: MusicalTime, trackId: number): Promise<number | null> {
        if (timeline.isLoadingSample) return null;
        if (ui.selectedSampleId === null) return null;

        timeline.isLoadingSample = true;
        try {
            let sampleId = ui.selectedSampleId;
            let sampleName;
            let buffer = null;

            // data.samples keeps only files loaded at compile time and with path (url pointing to the audio file)
            // Therefore recorded audio buffers and other in-memory buffers should be accessed directly via timeline.getBuffer()
            //
            // TODO: Fix this after introducing an IndexedDB storage
            if (ui.selectedSampleId < 0) {
                // right now all negative sample ids are recorded samples
                sampleId = ui.selectedSampleId;
                sampleName = "recording";
                buffer = timeline.getBufferSync(ui.selectedSampleId);
                if (!buffer) return null;
            } else {
                const sample = data.samples.find((s) => s.id === ui.selectedSampleId);
                if (!sample) return null;

                sampleId = sample.id;
                sampleName = sample.name;
                buffer = await timeline.getBuffer(sample.id, sample.path);
                if (!buffer) return null;
            }

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
            timeline.isLoadingSample = false;
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
