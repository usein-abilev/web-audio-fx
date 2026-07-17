import { resolve } from "$app/paths";
import {
    openDatabase,
    createDatabaseRecord,
    fetchDatabaseRecordById,
    fetchAllAudioFileMetadata,
    deleteAudioFile,
} from "$lib/audio/storage";

export type UserSample = {
    id: string;
    name: string;
    duration: number;
};

/**
 * SampleStore handles audio storage (both in-memory and IndexedDB)
 * Independent from other states. Used by components directly.
 */
class SampleStore {
    private audioContext: AudioContext | null = null;
    private db: IDBDatabase | null = null;
    private buffers = new Map<string, AudioBuffer>();
    private samplePaths = new Map<string, string>();

    /**
     * Stores general info of any recorded/uploaded audio files
     * It is used by FileBrowser primarily.
     */
    userSamples = $state<UserSample[]>([]);

    setAudioContext(context: AudioContext): void {
        this.audioContext = context;
    }

    async init(): Promise<void> {
        try {
            this.db = await openDatabase();
            const records = await fetchAllAudioFileMetadata(this.db);
            this.userSamples = records.map((r) => ({ id: r.id, name: r.name, duration: r.duration }));
        } catch (err) {
            console.error("Failed to open IndexedDB:", err);
        }
    }

    registerSamples(samples: { id: string; path: string }[]): void {
        for (const s of samples) {
            this.samplePaths.set(s.id, s.path);
        }
    }

    getSampleName(sampleId: string): string | null {
        const path = this.samplePaths.get(sampleId);
        if (path) {
            const dot = path.lastIndexOf(".");
            return path.slice(path.lastIndexOf("/") + 1, dot === -1 ? path.length : dot);
        }
        const userSample = this.userSamples.find((s) => s.id === sampleId);
        return userSample?.name ?? null;
    }

    async getBuffer(sampleId: string): Promise<AudioBuffer | null> {
        const cached = this.buffers.get(sampleId);
        if (cached) return cached;

        if (!this.audioContext) return null;

        try {
            const path = this.samplePaths.get(sampleId);
            if (path) {
                const response = await fetch(resolve(path, {}));
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                this.buffers.set(sampleId, audioBuffer);
                return audioBuffer;
            }

            if (this.db) {
                const record = await fetchDatabaseRecordById(this.db, sampleId);
                if (record) {
                    const audioBuffer = await this.audioContext.decodeAudioData(record.arrayBuffer);
                    this.buffers.set(sampleId, audioBuffer);
                    return audioBuffer;
                }
            }

            return null;
        } catch (err) {
            console.error(`Failed to load sample ${sampleId}:`, err);
            return null;
        }
    }

    getBufferSync(sampleId: string): AudioBuffer | null {
        return this.buffers.get(sampleId) ?? null;
    }

    hasBuffer(sampleId: string): boolean {
        return this.buffers.has(sampleId);
    }

    cacheBuffer(sampleId: string, buffer: AudioBuffer): void {
        this.buffers.set(sampleId, buffer);
    }

    clearBuffer(sampleId: string): void {
        this.buffers.delete(sampleId);
    }

    async prefetchClipBuffers(clipSampleIds: string[]): Promise<void> {
        const fetchPromises = clipSampleIds.map(async (sampleId) => {
            if (!this.hasBuffer(sampleId)) {
                await this.getBuffer(sampleId);
            }
        });
        await Promise.allSettled(fetchPromises);
    }

    async deleteUserSample(sampleId: string): Promise<void> {
        if (this.db) {
            await deleteAudioFile(this.db, sampleId);
        }
        this.userSamples = this.userSamples.filter((s) => s.id !== sampleId);
        this.buffers.delete(sampleId);
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

            this.buffers.set(sampleId, audioBuffer);

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

            this.userSamples.push({ id: sampleId, name, duration: audioBuffer.duration });
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
        this.buffers.set(sampleId, audioBuffer);

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

        this.userSamples.push({ id: sampleId, name, duration: audioBuffer.duration });
    }
}

export const samples = new SampleStore();
