<script lang="ts">
    import AppHeader from "$lib/components/header/AppHeader.svelte";
    import SampleViewer from "$lib/components/sampleviewer/SampleViewer.svelte";
    import FileBrowser from "$lib/components/filebrowser/FileBrowser.svelte";
    import Timeline from "$lib/components/timeline/Timeline.svelte";
    import EffectsRack from "$lib/components/effects/EffectsRack.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import { samples } from "$lib/stores/samples.svelte";
    import { onMount } from "svelte";

    let { data } = $props();

    onMount(async () => {
        console.log("App onMount: initializing audio", data.samples);
        await audio.init();
        samples.registerSamples(data.samples);
    });
</script>

<AppHeader />
<SampleViewer />
<div class="content">
    <FileBrowser samples={data.samples} />
    <Timeline />
</div>
<EffectsRack />

<style>
    .content {
        flex: 1;
        display: flex;
        overflow: hidden;
    }
</style>
