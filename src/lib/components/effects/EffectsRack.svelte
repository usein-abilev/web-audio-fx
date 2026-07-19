<script lang="ts">
    import { ui } from "$lib/stores/ui.svelte";
    import { timeline, MASTER_TRACK_ID } from "$lib/stores/timeline.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import PLUGINS from "$lib/audio/plugins/index";
    import PluginSlot from "./PluginSlot.svelte";

    let draggedIndex = $state<number | null>(null);

    const selectedTrack = $derived(ui.selectedTrackId !== null ? timeline.getTrackById(ui.selectedTrackId) : null);

    const trackPlugins = $derived(
        selectedTrack
            ? selectedTrack.pluginIds.map((id, i) => ({
                  id,
                  name: PLUGINS.find((p) => p.id === id)?.name ?? id,
                  instance: audio.getPluginInstance(selectedTrack.id, i),
                  index: i,
              }))
            : [],
    );

    const availablePlugins = $derived(PLUGINS);

    function togglePanel() {
        ui.effectsRackOpen = !ui.effectsRackOpen;
    }

    function handleAddPlugin(e: Event) {
        const select = e.target as HTMLSelectElement;
        const pluginId = select.value;
        if (!pluginId || ui.selectedTrackId === null) return;

        audio.addPlugin(ui.selectedTrackId, pluginId);
        select.value = "";
    }

    function handleRemove(index: number) {
        if (ui.selectedTrackId === null) return;
        audio.removePlugin(ui.selectedTrackId, index);
    }

    function handleBypass(index: number) {
        if (ui.selectedTrackId === null) return;
        audio.toggleBypass(ui.selectedTrackId, index);
    }

    function handleDragStart(index: number, _e: DragEvent) {
        draggedIndex = index;
    }

    function handleDragEnd() {
        draggedIndex = null;
    }

    function handleDragOver(index: number, e: DragEvent) {
        e.preventDefault();
    }

    function handleDrop(toIndex: number, _e: DragEvent) {
        if (draggedIndex === null || ui.selectedTrackId === null) return;
        if (draggedIndex !== toIndex) {
            audio.movePlugin(ui.selectedTrackId, draggedIndex, toIndex);
        }
        draggedIndex = null;
    }

    const trackLabel = $derived(
        selectedTrack ? (selectedTrack.id === MASTER_TRACK_ID ? "Master" : selectedTrack.name) : null,
    );
</script>

<div class="effects-rack" class:open={ui.effectsRackOpen}>
    <button class="toggle-btn" onclick={togglePanel}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            {#if ui.effectsRackOpen}
                <polyline points="6 9 12 15 18 9"></polyline>
            {:else}
                <polyline points="9 18 15 12 9 6"></polyline>
            {/if}
        </svg>
        Effects{trackLabel ? `: ${trackLabel}` : ""}
    </button>

    {#if ui.effectsRackOpen}
        <div class="rack-content">
            {#if selectedTrack}
                <div class="plugin-chain">
                    {#each trackPlugins as plugin (plugin.index)}
                        {#if plugin.instance}
                            <PluginSlot
                                plugin={plugin.instance}
                                pluginName={plugin.name}
                                index={plugin.index}
                                onRemove={handleRemove}
                                onBypass={handleBypass}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            />
                        {/if}
                    {/each}

                    {#if availablePlugins.length > 0}
                        <div class="add-plugin">
                            <select onchange={handleAddPlugin}>
                                <option value="">+ Add Plugin</option>
                                {#each availablePlugins as plugin (plugin.id)}
                                    <option value={plugin.id}>{plugin.name}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="empty">Select a track to view effects</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .effects-rack {
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-color);
    }

    .toggle-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 6px 12px;
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .toggle-btn:hover {
        color: var(--text-primary);
        background: var(--bg-hover);
    }

    .rack-content {
        padding: 8px 12px;
        border-top: 1px solid var(--border-color);
        overflow: auto;
        height: 250px;
    }

    .plugin-chain {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        min-height: 60px;
    }

    .add-plugin {
        min-width: 120px;
        display: flex;
        align-items: flex-start;
    }

    .add-plugin select {
        background: var(--bg-main);
        color: var(--text-secondary);
        border: 1px dashed var(--border-color);
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 11px;
        cursor: pointer;
        width: 100%;
    }

    .add-plugin select:hover {
        border-color: var(--accent-primary);
        color: var(--text-primary);
    }

    .empty {
        padding: 16px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 12px;
    }
</style>
