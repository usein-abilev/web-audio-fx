<script lang="ts">
    import { resolve } from "$app/paths";
    import { timeline } from "$lib/stores/timeline.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import { samples as sampleStore } from "$lib/stores/samples.svelte";
    import { ui } from "$lib/stores/ui.svelte";

    type Sample = {
        id: string;
        name: string;
        path: string;
    };

    let { samples = [], onSampleClick }: { samples?: Sample[]; onSampleClick?: (id: string) => void } = $props();

    let activeTab = $state<"built-in" | "my-samples">("built-in");
    let previewingSampleId = $state<string | null>(null);
    let previewSource = $state<AudioBufferSourceNode | null>(null);
    let isPreviewPlaying = $state(false);
    let isDragOver = $state(false);
    let draggingLocal = $state(false);

    function handleClick(_: MouseEvent, id: string) {
        ui.selectedSampleId = id;
        ui.lastSelectedClipId = null;
        onSampleClick?.(id);
    }

    async function handlePlayBuiltIn(sample: Sample) {
        if (previewingSampleId === sample.id && isPreviewPlaying) {
            previewSource?.stop();
            return;
        }

        previewSource?.stop();

        if (!audio.context) return;

        try {
            const response = await fetch(resolve(sample.path, {}));
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audio.context.decodeAudioData(arrayBuffer);

            const source = audio.context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audio.context.destination);
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

    async function handlePlayUserSample(sample: { id: string; name: string }) {
        if (previewingSampleId === sample.id && isPreviewPlaying) {
            previewSource?.stop();
            return;
        }

        previewSource?.stop();

        if (!audio.context) return;

        try {
            const audioBuffer = await sampleStore.allocateOrFetchBuffers(sample.id);
            if (!audioBuffer) return;

            const source = audio.context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audio.context.destination);
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

    async function handleDelete(sampleId: string) {
        if (timeline.clips.some((c) => c.sampleId === sampleId)) {
            const confirmed = confirm("This sample is used in timeline clips. Delete anyway?");
            if (!confirmed) return;
        }
        try {
            await sampleStore.deleteUserSample(sampleId);
            timeline.removeClipsBySampleId(sampleId);
        } catch (error) {
            alert("Failed to delete this sample");
            console.error(error);
        }
    }

    function handleDragOver(e: DragEvent) {
        if (draggingLocal) return;

        e.preventDefault();
        isDragOver = true;
        activeTab = "my-samples";
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave() {
        isDragOver = false;
    }

    async function handleDrop(e: DragEvent) {
        if (draggingLocal) return;

        e.preventDefault();
        isDragOver = false;
        const files = Array.from(e.dataTransfer?.files ?? []);
        for (const file of files) {
            await sampleStore.uploadFile(file);
        }
    }

    function handleSampleDragStart(e: DragEvent, sampleId: string) {
        if (e.dataTransfer) {
            e.dataTransfer.setData("application/x-sample-id", sampleId);
            e.dataTransfer.dropEffect = "copy";
        }
        draggingLocal = true;
    }

    function handleSampleDragEnd() {
        draggingLocal = false;
    }
</script>

<aside
    class="file-browser"
    class:drag-over={isDragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
>
    <div class="browser-tabs">
        <button class="tab-btn" class:active={activeTab === "built-in"} onclick={() => (activeTab = "built-in")}>
            Built-in
        </button>
        <button class="tab-btn" class:active={activeTab === "my-samples"} onclick={() => (activeTab = "my-samples")}>
            My Samples
        </button>
    </div>
    <div class="browser-list">
        {#if activeTab === "built-in"}
            {#if samples.length === 0}
                <div class="empty">No samples loaded</div>
            {:else}
                {#each samples as sample (sample.id)}
                    <div
                        class="browser-item"
                        class:active={ui.selectedSampleId === sample.id}
                        draggable="true"
                        ondragstart={(e) => handleSampleDragStart(e, sample.id)}
                        ondragend={handleSampleDragEnd}
                    >
                        <button
                            class="play-btn"
                            class:playing={previewingSampleId === sample.id && isPreviewPlaying}
                            onclick={() => handlePlayBuiltIn(sample)}
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
                        <button class="name-btn" onclick={(e) => handleClick(e, sample.id)}>
                            {sample.name}
                        </button>
                    </div>
                {/each}
            {/if}
        {:else}
            {#if sampleStore.userSamples.length === 0}
                <div class="empty">No recordings or uploads yet</div>
            {:else}
                {#each sampleStore.userSamples as sample (sample.id)}
                    <div
                        class="browser-item"
                        class:active={ui.selectedSampleId === sample.id}
                        draggable="true"
                        ondragstart={(e) => handleSampleDragStart(e, sample.id)}
                        ondragend={handleSampleDragEnd}
                    >
                        <button
                            class="play-btn"
                            class:playing={previewingSampleId === sample.id && isPreviewPlaying}
                            onclick={() => handlePlayUserSample(sample)}
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
                        <button class="name-btn" onclick={(e) => handleClick(e, sample.id)}>
                            {sample.name}
                        </button>
                        <button class="delete-btn" onclick={() => handleDelete(sample.id)} aria-label="Delete sample">
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                        </button>
                    </div>
                {/each}
            {/if}
        {/if}
    </div>
</aside>

<style>
    .file-browser {
        width: 200px;
        min-width: 180px;
        background: var(--bg-secondary);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .file-browser.drag-over {
        border: 2px dashed var(--accent-primary);
    }

    .browser-tabs {
        display: flex;
        border-bottom: 1px solid var(--border-color);
    }

    .tab-btn {
        flex: 1;
        padding: 8px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .tab-btn:hover {
        color: var(--text-primary);
    }

    .tab-btn.active {
        color: var(--accent-primary);
        border-bottom-color: var(--accent-primary);
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
        cursor: grab;
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

    .delete-btn {
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
        opacity: 0;
    }

    .browser-item:hover .delete-btn {
        opacity: 1;
    }

    .delete-btn:hover {
        color: #e74c3c;
    }

    .browser-item.active .delete-btn {
        color: rgba(255, 255, 255, 0.7);
    }

    .browser-item.active .delete-btn:hover {
        color: white;
    }

    .empty {
        padding: 24px 12px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 12px;
    }
</style>
