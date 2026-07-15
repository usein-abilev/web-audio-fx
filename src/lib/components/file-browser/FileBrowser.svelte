<script lang="ts">
    import { resolve } from "$app/paths";
    import { timeline } from "$lib/stores/timeline.svelte";
    import { ui } from "$lib/stores/ui.svelte";

    type Sample = {
        id: number;
        name: string;
        path: string;
    };

    let { samples = [], onSampleClick }: { samples?: Sample[]; onSampleClick?: (id: number) => void } = $props();

    let previewingSampleId = $state<number | null>(null);
    let previewSource = $state<AudioBufferSourceNode | null>(null);
    let isPreviewPlaying = $state(false);

    function handleClick(id: number) {
        ui.selectedSampleId = id;
        onSampleClick?.(id);
    }

    async function handlePlay(sample: Sample) {
        if (previewingSampleId === sample.id && isPreviewPlaying) {
            previewSource?.stop();
            return;
        }

        previewSource?.stop();

        if (!timeline.context) return;

        try {
            const response = await fetch(resolve(sample.path, {}));
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await timeline.context.decodeAudioData(arrayBuffer);

            const source = timeline.context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(timeline.context.destination);
            source.start();

            previewSource = source;
            previewingSampleId = sample.id;
            isPreviewPlaying = true;

            source.onended = () => {
                isPreviewPlaying = false;
                previewSource = null;
            };
        } catch (e) {
            console.error("Preview failed:", e);
            isPreviewPlaying = false;
            previewSource = null;
        }
    }
</script>

<aside class="file-browser">
    <div class="browser-header">Samples</div>
    <div class="browser-list">
        {#if samples.length === 0}
            <div class="empty">No samples loaded</div>
        {:else}
            {#each samples as sample (sample.id)}
                <div class="browser-item" class:active={ui.selectedSampleId === sample.id}>
                    <button
                        class="play-btn"
                        class:playing={previewingSampleId === sample.id && isPreviewPlaying}
                        onclick={() => handlePlay(sample)}
                        aria-label={previewingSampleId === sample.id && isPreviewPlaying
                            ? "Stop preview"
                            : "Play preview"}
                    >
                        {#if previewingSampleId === sample.id && isPreviewPlaying}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" />
                                <rect x="14" y="4" width="4" height="16" />
                            </svg>
                        {:else}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5,3 19,12 5,21" />
                            </svg>
                        {/if}
                    </button>
                    <button class="name-btn" onclick={() => handleClick(sample.id)}>
                        {sample.name}
                    </button>
                </div>
            {/each}
        {/if}
    </div>
</aside>

<style>
    .file-browser {
        width: 180px;
        min-width: 180px;
        background: var(--bg-secondary);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .browser-header {
        padding: 8px 12px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-color);
    }

    .browser-list {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
    }

    .browser-item {
        display: flex;
        align-items: center;
        gap: 0;
        width: 100%;
    }

    .browser-item.active {
        background: var(--accent-primary);
    }

    .browser-item.active .name-btn {
        color: white;
    }

    .play-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 28px;
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0;
    }

    .play-btn:hover {
        color: var(--text-primary);
    }

    .browser-item.active .play-btn {
        color: rgba(255, 255, 255, 0.7);
    }

    .play-btn.playing {
        color: var(--accent-primary);
    }

    .browser-item.active .play-btn.playing {
        color: white;
    }

    .name-btn {
        flex: 1;
        padding: 6px 8px 6px 0;
        background: none;
        border: none;
        color: var(--text-primary);
        cursor: pointer;
        text-align: left;
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .name-btn:hover {
        background: var(--bg-hover);
    }

    .browser-item.active .name-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .empty {
        padding: 24px 12px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 12px;
    }
</style>
