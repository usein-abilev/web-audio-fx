class UIState {
    selectedSampleId = $state<number | null>(null);
    selectedClipId = $state<number | null>(null);
    selectedTrackId = $state<number | null>(null);
    bufferViewerOpen = $state(false);
    effectsRackOpen = $state(false);
    darkMode = $state(false);
}

export const ui = new UIState();
