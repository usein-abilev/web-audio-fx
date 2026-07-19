import { resolve } from "$app/paths";
import {
    openDatabase,
    createDatabaseRecord,
    fetchDatabaseRecordById,
    fetchAllAudioFileMetadata,
    deleteAudioFile,
} from "$lib/audio/storage";
import { bufferStore } from "$lib/stores/buffer.svelte";

export enum SampleType {
    Url = "url",
    File = "file",
}

export type AudioSample = {
    id: string;
    name: string;
    type: SampleType;
    audioUrl?: string;
    builtin: boolean;
};

class SampleStore {
    private audioContext: AudioContext | null = null;
    private db: IDBDatabase | null = null;

    samples = $state<AudioSample[]>([]);

    builtinSamples = $derived(this.samples.filter((s) => s.builtin));
    userSamples = $derived(this.samples.filter((s) => !s.builtin));

    async init(): Promise<void> {
        try {
            this.audioContext = new AudioContext();
            this.db = await openDatabase();
            const records = await fetchAllAudioFileMetadata(this.db);
            for (const r of records) {
                this.samples.push({
                    id: r.id,
                    name: r.name,
                    type: SampleType.File,
                    builtin: false,
                });
            }
        } catch (err) {
            console.error("Failed to open IndexedDB:", err);
        }
    }

    registerSamples(samples: { id: string; path: string }[]): void {
        for (const s of samples) {
            const dot = s.path.lastIndexOf(".");
            const name = s.path.slice(s.path.lastIndexOf("/") + 1, dot === -1 ? s.path.length : dot);
            this.samples.push({
                id: s.id,
                name,
                type: SampleType.Url,
                audioUrl: s.path,
                builtin: true,
            });
        }
    }

    getSample(id: string): AudioSample | null {
        return this.samples.find((s) => s.id === id) ?? null;
    }

    async allocateOrFetchBuffers(sampleId: string): Promise<AudioBuffer | null> {
        const sample = this.getSample(sampleId);
        if (!sample) return null;

        const existing = bufferStore.getBuffersBySampleId(sampleId);
        if (existing.length > 0) return existing[0].binary;

        if (!this.audioContext) return null;

        try {
            if (sample.type === SampleType.Url && sample.audioUrl) {
                const response = await fetch(resolve(sample.audioUrl, {}));
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                bufferStore.createBuffer(sampleId, audioBuffer);

                return audioBuffer;
            } else if (sample.type === SampleType.File && this.db) {
                const record = await fetchDatabaseRecordById(this.db, sampleId);
                if (record) {
                    const audioBuffer = await this.audioContext.decodeAudioData(record.arrayBuffer);

                    bufferStore.createBuffer(sampleId, audioBuffer);

                    return audioBuffer;
                }
            }

            return null;
        } catch (err) {
            console.error(`Failed to load sample ${sampleId}:`, err);
            return null;
        }
    }

    getBufferSync(bufferId: string): AudioBuffer | null {
        return bufferStore.getBuffer(bufferId);
    }

    hasBuffer(bufferId: string): boolean {
        return bufferStore.hasBuffer(bufferId);
    }

    async prefetchClipBuffers(bufferIds: string[]): Promise<void> {
        await Promise.allSettled(
            bufferIds.map(async (bufferId) => {
                if (!bufferStore.hasBuffer(bufferId)) {
                    const record = bufferStore.getBufferRecord(bufferId);
                    if (record) {
                        await this.allocateOrFetchBuffers(record.sampleId);
                    }
                }
            }),
        );
    }

    async deleteUserSample(sampleId: string): Promise<void> {
        bufferStore.deleteBuffersBySampleId(sampleId);
        if (this.db) {
            await deleteAudioFile(this.db, sampleId);
        }
        this.samples = this.samples.filter((s) => s.id !== sampleId);
    }

    async uploadFile(file: File): Promise<string | null> {
        if (!this.audioContext) return null;

        const supportedFormats = [".wav", ".mp3", ".ogg", ".flac"];
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (!supportedFormats.includes(ext)) return null;

        try {
            const rawBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(rawBuffer.slice(0));
            const sampleId = crypto.randomUUID();
            const name = file.name.replace(/\.[^.]+$/, "");

            if (this.db) {
                await createDatabaseRecord(this.db, {
                    id: sampleId,
                    name,
                    arrayBuffer: rawBuffer.slice(0),
                    duration: audioBuffer.duration,
                    format: file.type,
                    createdAt: Date.now(),
                });
            }

            this.samples.push({
                id: sampleId,
                name,
                type: SampleType.File,
                builtin: false,
            });
            return sampleId;
        } catch (err) {
            console.error("Failed to upload file:", err);
            return null;
        }
    }

    async saveRecording(
        sampleId: string,
        name: string,
        rawBuffer: ArrayBuffer,
        audioBuffer: AudioBuffer,
    ): Promise<void> {
        bufferStore.createBuffer(sampleId, audioBuffer);

        if (this.db) {
            await createDatabaseRecord(this.db, {
                id: sampleId,
                name,
                arrayBuffer: rawBuffer,
                duration: audioBuffer.duration,
                format: "audio/webm",
                createdAt: Date.now(),
            });
        }

        this.samples.push({
            id: sampleId,
            name,
            type: SampleType.File,
            builtin: false,
        });
    }

    // TODO: Does it belong here?
    // We only need audioContext
    createReversedBuffer(bufferId: string): string {
        const record = bufferStore.getBufferRecord(bufferId);
        if (!this.audioContext || !record) return bufferId;
        const original = record.binary;

        const newBuffer = this.audioContext.createBuffer(
            original.numberOfChannels,
            original.length,
            original.sampleRate,
        );

        for (let ch = 0; ch < original.numberOfChannels; ch++) {
            const sourceData = original.getChannelData(ch);
            const destData = newBuffer.getChannelData(ch);
            for (let i = 0; i < sourceData.length; i++) {
                destData[i] = sourceData[sourceData.length - 1 - i];
            }
        }

        return bufferStore.createBuffer(record.sampleId, newBuffer);
    }
}

export const samples = new SampleStore();
