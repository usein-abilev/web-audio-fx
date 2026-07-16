<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import { samples } from "$lib/stores/samples.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import WaveformDisplay from "./WaveformDisplay.svelte";
    import EditorControls from "./EditorControls.svelte";

    let audioBuffer = $state<AudioBuffer | null>(null);
    let isLoading = $state(false);

    $effect(() => {
        const clipId = ui.selectedClipIds.size > 0 ? [...ui.selectedClipIds][0] : null;
        if (clipId === null) {
            audioBuffer = null;
            return;
        }

        const clip = timeline.clips.find((c) => c.id === clipId);
        if (!clip) {
            audioBuffer = null;
            return;
        }

        const cached = samples.getBufferSync(clip.sampleId);
        if (cached) {
            audioBuffer = cached;
            return;
        }

        isLoading = true;
        samples.getBuffer(clip.sampleId).then((buf) => {
            audioBuffer = buf;
            isLoading = false;
        });
    });

    function toggleViewer() {
        ui.bufferViewerOpen = !ui.bufferViewerOpen;
    }
</script>

<div class="sample-viewer" class:open={ui.bufferViewerOpen}>
    <button class="toggle-btn" onclick={toggleViewer}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            {#if ui.bufferViewerOpen}
                <polyline points="6 9 12 15 18 9"></polyline>
            {:else}
                <polyline points="9 18 15 12 9 6"></polyline>
            {/if}
        </svg>
        Sample Viewer
    </button>

    {#if ui.bufferViewerOpen}
        <div class="viewer-content">
            {#if isLoading}
                <div class="loading">Loading...</div>
            {:else if audioBuffer}
                <WaveformDisplay {audioBuffer} />
                <EditorControls {audioBuffer} audioContext={audio.context} />
            {:else if ui.selectedClipIds.size > 0}
                <div class="empty">Failed to load sample</div>
            {:else}
                <div class="empty">Select a clip to view</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .sample-viewer {
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border-color);
    }

    .toggle-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 8px 12px;
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .toggle-btn:hover {
        color: var(--text-primary);
        background: var(--bg-hover);
    }

    .viewer-content {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--border-color);
        height: calc(12px + 12px + 120px + 8px);
    }

    .loading,
    .empty {
        padding: 24px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 13px;
    }
</style>
