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

    $effect(() => {
        if (timeline.isPlaying) {
            timeline.play();
        } else {
            timeline.stop();
        }
    });

    async function handleTimelineClick(time: MusicalTime, trackId: number): Promise<number | null> {
        if (timeline.isLoadingSample) return null;
        if (ui.selectedSampleId === null) return null;
        const sample = data.samples.find((s) => s.id === ui.selectedSampleId);
        if (!sample) return null;

        timeline.isLoadingSample = true;
        try {
            const buffer = await timeline.getBuffer(sample.id, sample.path);
            if (!buffer) return null;

            // Inherit duration/offset from the last selected clip if same sample
            const lastClip =
                ui.lastSelectedClipId !== null && timeline.clips.find((c) => c.id === ui.lastSelectedClipId);
            if (lastClip && lastClip.sampleId === sample.id) {
                const durationBeats = lastClip.duration.bar * 4 + lastClip.duration.beat;
                const offsetBeats = lastClip.offset.bar * 4 + lastClip.offset.beat;
                const clip = timeline.addClip(
                    lastClip.sampleId,
                    lastClip.sampleName,
                    trackId,
                    time,
                    durationBeats,
                    offsetBeats,
                );
                return clip.id;
            }

            const durationBeats = Math.max(1, Math.round(buffer.duration * (timeline.bpm / 60)));
            const clip = timeline.addClip(sample.id, sample.name, trackId, time, durationBeats, 0);
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
