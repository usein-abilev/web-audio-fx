<script lang="ts">
    import BPMInput from "./BPMInput.svelte";
    import TimeSignatureSelect from "./TimeSignatureSelect.svelte";
    import MetronomeToggle from "./MetronomeToggle.svelte";
    import TransportControls from "./TransportControls.svelte";
    import RecordButton from "./RecordButton.svelte";
    import ThemeToggle from "./ThemeToggle.svelte";
</script>

<header>
    <div class="header-items">
        <BPMInput />
        <TimeSignatureSelect />
        <MetronomeToggle />
        <TransportControls />
        <RecordButton />
    </div>
    <div class="header-items">
        <ThemeToggle />
    </div>
</header>

<style>
    header {
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border-color);
        padding: 3px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .header-items {
        display: flex;
        gap: 8px;
        align-items: center;
    }
</style>
