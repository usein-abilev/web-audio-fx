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

            const beats = buffer.duration * (timeline.bpm / 60);
            const durationBeats = Math.max(1, Math.round(beats));

            const clip = timeline.addClip(sample.id, sample.name, trackId, time, durationBeats);
            return clip.id;
        } finally {
            timeline.isLoadingSample = false;
        }
    }

    function handleClipClick(clipId: number) {
        ui.selectedClipId = clipId;
    }
</script>

<AppHeader />
<SampleViewer />
<div class="content">
    <FileBrowser samples={data.samples} />
    <Timeline onClipClick={handleClipClick} onTimelineClick={handleTimelineClick} />
</div>
<EffectsRack />

<style>
    .content {
        flex: 1;
        display: flex;
        overflow: hidden;
    }
</style>
