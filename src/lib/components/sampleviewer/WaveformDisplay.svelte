<script lang="ts">
    import { generateWaveformPath } from "$lib/utils/waveform";

    let { audioBuffer }: { audioBuffer: AudioBuffer } = $props();

    let width = $state(600);
    let height = $state(120);
    let containerEl = $state<HTMLDivElement>();

    let waveformPath = $derived(audioBuffer ? generateWaveformPath(audioBuffer, width, height) : "");

    $effect(() => {
        if (containerEl) {
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    width = entry.contentRect.width;
                }
            });
            observer.observe(containerEl);
            return () => observer.disconnect();
        }
    });
</script>

<div class="waveform-container" bind:this={containerEl}>
    <svg {width} {height} viewBox="0 0 {width} {height}">
        <rect {width} {height} fill="var(--bg-main)" />
        <path d={waveformPath} stroke="var(--accent-primary)" stroke-width="1" fill="none" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="var(--border-color)" stroke-width="1" />
    </svg>
</div>

<style>
    .waveform-container {
        width: 100%;
        height: 120px;
        overflow: hidden;
        border-radius: 4px;
        background: var(--bg-main);
    }

    svg {
        display: block;
    }
</style>
