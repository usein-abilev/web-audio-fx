import { SvelteSet } from "svelte/reactivity";

class UIState {
    selectedSampleId = $state<string | null>(null);
    selectedClipIds = $state(new SvelteSet<number>());
    lastSelectedClipId = $state<number | null>(null);
    selectedTrackId = $state<number | null>(null);
    bufferViewerOpen = $state(true);
    effectsRackOpen = $state(false);
    darkMode = $state(false);

    selectClip(clipId: number, addToSelection: boolean = false) {
        if (addToSelection) {
            if (this.selectedClipIds.has(clipId)) {
                this.selectedClipIds.delete(clipId);
            } else {
                this.selectedClipIds.add(clipId);
                this.lastSelectedClipId = clipId;
            }
        } else {
            this.selectedClipIds.clear();
            this.selectedClipIds.add(clipId);
            this.lastSelectedClipId = clipId;
        }
    }

    setSelectedClips(ids: number[]) {
        this.selectedClipIds.clear();
        for (const id of ids) {
            this.selectedClipIds.add(id);
        }
    }

    deselectAllClips() {
        this.selectedClipIds.clear();
    }

    isClipSelected(clipId: number): boolean {
        return this.selectedClipIds.has(clipId);
    }

    removeClipsFromSelection(ids: number[]) {
        for (const id of ids) {
            this.selectedClipIds.delete(id);
        }
    }
}

export const ui = new UIState();
