<script lang="ts">
    type KnobSize = "small" | "medium" | "large";

    let {
        value = 0.5,
        min = 0,
        max = 1,
        defaultValue = 0.5,
        label = "",
        size = "medium",
        formatter = (v: number) => v.toFixed(2),
        onchange,
    }: {
        value: number;
        min?: number;
        max?: number;
        defaultValue?: number;
        label: string;
        size?: KnobSize;
        formatter?: (v: number) => string;
        onchange: (value: number) => void;
    } = $props();

    let isDragging = false;
    let lastY = 0;
    let knobEl = $state<HTMLDivElement>();

    const range = $derived(max - min);
    const percent = $derived(((value - min) / range) * 100);
    const angle = $derived((percent / 100) * 270 - 135);

    const sizePx = $derived(size === "small" ? 16 : size === "large" ? 32 : 24);
    const fontSize = $derived(size === "small" ? 7 : size === "large" ? 10 : 8);
    const indicatorWidth = $derived(size === "small" ? 1.5 : size === "large" ? 2.5 : 2);
    const gap = $derived(size === "small" ? 1 : 2);

    function clamp(v: number): number {
        return Math.max(min, Math.min(max, v));
    }

    function handleMouseDown(e: MouseEvent) {
        isDragging = true;
        lastY = e.clientY;
        e.preventDefault();
    }

    function handleWheel(e: WheelEvent) {
        const step = range * 0.02;
        const delta = -Math.sign(e.deltaY) * step;
        onchange(clamp(value + delta));
        e.preventDefault();
    }

    function handleDoubleClick() {
        onchange(defaultValue);
    }

    function handleGlobalMouseMove(e: MouseEvent) {
        if (!isDragging) return;
        const delta = lastY - e.clientY;
        lastY = e.clientY;
        const step = range * 0.005;
        onchange(clamp(value + delta * step));
    }

    function handleGlobalMouseUp() {
        isDragging = false;
    }
</script>

<svelte:window onmousemove={handleGlobalMouseMove} onmouseup={handleGlobalMouseUp} />

<div class="knob-container" style="--gap: {gap}px">
    {#if label}
        <div class="label" style="font-size: {fontSize}px">{label}</div>
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="knob"
        style="width: {sizePx}px; height: {sizePx}px"
        bind:this={knobEl}
        onmousedown={handleMouseDown}
        onwheel={handleWheel}
        ondblclick={handleDoubleClick}
    >
        <div class="arc" style="--angle: {(270 / range) * (value - min)}deg"></div>
        <div class="indicator" style="width: {indicatorWidth}px; transform: translateX(-50%) rotate({angle}deg)"></div>
    </div>
    <div class="value" style="font-size: {fontSize}px">{formatter(value)}</div>
</div>

<style>
    .knob-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--gap, 2px);
        user-select: none;
        width: 100%;
    }

    .label {
        color: var(--text-secondary);
        letter-spacing: 0.5px;
        white-space: nowrap;
        line-height: 1;
    }

    .knob {
        position: relative;
        border-radius: 50%;
        background: var(--bg-main);
        border: 1.5px solid var(--border-color);
        cursor: grab;
        flex-shrink: 0;
    }

    .knob:active {
        cursor: grabbing;
    }

    .arc {
        position: absolute;
        inset: 2px;
        border-radius: 50%;
        background: conic-gradient(
            from -135deg,
            var(--accent-primary) 0deg,
            var(--accent-primary) var(--angle),
            transparent var(--angle),
            transparent 270deg
        );
        mask: radial-gradient(circle, transparent 55%, black 56%, black 100%);
        -webkit-mask: radial-gradient(circle, transparent 55%, black 56%, black 100%);
    }

    .indicator {
        position: absolute;
        bottom: 50%;
        left: 50%;
        height: 40%;
        background: var(--text-primary);
        transform-origin: bottom center;
        border-radius: 1px;
    }

    .value {
        color: var(--text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        line-height: 1;
    }
</style>
