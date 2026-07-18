<script lang="ts">
    let {
        audioBuffer,
        audioContext,
        onReverse,
    }: {
        audioBuffer: AudioBuffer;
        audioContext: AudioContext | null;
        onReverse?: () => void;
    } = $props();

    let isPlaying = $state(false);
    let isLooping = $state(false);
    let sourceNode = $state<AudioBufferSourceNode | null>(null);

    function playPause() {
        if (isPlaying) {
            stop();
        } else {
            play();
        }
    }

    function play() {
        if (!audioBuffer || !audioContext) return;

        sourceNode = audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.loop = isLooping;
        sourceNode.connect(audioContext.destination);
        sourceNode.start();
        isPlaying = true;

        sourceNode.onended = () => {
            isPlaying = false;
            sourceNode = null;
        };
    }

    function stop() {
        if (sourceNode) {
            sourceNode.stop();
            sourceNode = null;
        }
        isPlaying = false;
    }

    function toggleLoop() {
        isLooping = !isLooping;
        if (sourceNode) {
            sourceNode.loop = isLooping;
        }
    }

    function reverse() {
        onReverse?.();
    }

    function trim() {
        // TODO: Implement trim functionality
        console.log("Trim not implemented yet");
    }
</script>

<div class="editor-controls">
    <button class="control-btn" onclick={playPause} aria-label={isPlaying ? "Pause" : "Play"}>
        {#if isPlaying}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
            </svg>
        {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
            </svg>
        {/if}
    </button>

    <button class="control-btn" class:active={isLooping} onclick={toggleLoop} aria-label="Loop">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="17 1 21 5 17 9"></polyline>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
            <polyline points="7 23 3 19 7 15"></polyline>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
        </svg>
    </button>

    <button class="control-btn" onclick={reverse} aria-label="Reverse">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="11,19 2,12 11,5" />
            <polygon points="22,19 13,12 22,5" />
        </svg>
    </button>

    <button class="control-btn" onclick={trim} aria-label="Trim">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
            <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
            <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
        </svg>
    </button>
</div>

<style>
    .editor-controls {
        display: flex;
        gap: 8px;
    }

    .control-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        border: 1px solid var(--border-color);
        background: var(--bg-main);
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .control-btn:hover {
        color: var(--text-primary);
        border-color: var(--text-secondary);
    }

    .control-btn.active {
        color: var(--accent-primary);
        border-color: var(--accent-primary);
    }
</style>
