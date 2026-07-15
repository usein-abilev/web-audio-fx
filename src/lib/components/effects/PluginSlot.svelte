<script lang="ts">
    import type { AudioPlugin } from "$lib/audio/plugins/plugin";
    import PluginControls from "./PluginControls.svelte";

    let {
        plugin,
        pluginName,
        index,
        onRemove,
        onBypass,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDrop,
    }: {
        plugin: AudioPlugin;
        pluginName: string;
        index: number;
        onRemove: (index: number) => void;
        onBypass: (index: number) => void;
        onDragStart: (index: number, e: DragEvent) => void;
        onDragEnd: () => void;
        onDragOver: (index: number, e: DragEvent) => void;
        onDrop: (index: number, e: DragEvent) => void;
    } = $props();

    let isBypassed = $state(false);
    let isDragOver = $state(false);

    const params = $derived(plugin.getParams());
    const isEq = $derived(pluginName.includes("EQ"));

    function handleBypass() {
        isBypassed = !isBypassed;
        onBypass(index);
    }

    function handleDragStart(e: DragEvent) {
        onDragStart(index, e);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragOver = true;
        onDragOver(index, e);
    }

    function handleDragLeave() {
        isDragOver = false;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;
        onDrop(index, e);
    }
</script>

<div
    class="plugin-slot"
    class:bypassed={isBypassed}
    class:drag-over={isDragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
>
    <div class="plugin-header">
        <span class="drag-handle" draggable="true" ondragstart={handleDragStart} ondragend={onDragEnd}> ≡ </span>
        <span class="plugin-name">{pluginName}</span>
        <button class="bypass-btn" class:active={isBypassed} onclick={handleBypass}>
            {isBypassed ? "On" : "Bypass"}
        </button>
        <button class="remove-btn" onclick={() => onRemove(index)}>×</button>
    </div>
    <div class="plugin-content">
        <PluginControls {params} {isEq} />
    </div>
</div>

<style>
    .plugin-slot {
        min-width: 140px;
        max-width: 200px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-secondary);
        transition:
            opacity 0.15s,
            border-color 0.15s;
    }

    .plugin-slot.bypassed {
        opacity: 0.5;
    }

    .plugin-slot.drag-over {
        border-color: var(--accent-primary);
        background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary));
    }

    .plugin-header {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px;
        border-bottom: 1px solid var(--border-color);
        background: color-mix(in srgb, var(--bg-secondary) 80%, var(--bg-main));
    }

    .drag-handle {
        cursor: grab;
        color: var(--text-secondary);
        font-size: 12px;
        line-height: 1;
        user-select: none;
    }

    .drag-handle:active {
        cursor: grabbing;
    }

    .plugin-name {
        flex: 1;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .bypass-btn,
    .remove-btn {
        background: none;
        border: 1px solid var(--border-color);
        border-radius: 3px;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 10px;
        padding: 1px 4px;
        line-height: 1;
    }

    .bypass-btn:hover,
    .remove-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .bypass-btn.active {
        background: var(--accent-primary);
        color: white;
        border-color: var(--accent-primary);
    }

    .remove-btn {
        font-size: 12px;
    }

    .plugin-content {
        padding: 6px;
    }
</style>
