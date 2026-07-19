export type Buffer = {
    id: string;
    sampleId: string;
    binary: AudioBuffer;
};

class BufferStore {
    private buffers = new Map<string, Buffer>();

    getBuffer(id: string): AudioBuffer | null {
        return this.buffers.get(id)?.binary ?? null;
    }

    getBufferRecord(id: string): Buffer | null {
        return this.buffers.get(id) ?? null;
    }

    getBuffersBySampleId(sampleId: string): Buffer[] {
        const results: Buffer[] = [];
        for (const [_, buf] of this.buffers) {
            if (buf.sampleId === sampleId) results.push(buf);
        }
        return results;
    }
    createBuffer(sampleId: string, data: AudioBuffer): string {
        const id = crypto.randomUUID();
        this.buffers.set(id, { id, sampleId, binary: data });
        return id;
    }

    deleteBuffersBySampleId(sampleId: string): void {
        for (const [id, buf] of this.buffers) {
            if (buf.sampleId === sampleId) this.buffers.delete(id);
        }
    }

    deleteOrphaned(activeIds: Set<string>) {
        const ids = [...this.buffers.keys()];
        for (const id of ids) {
            if (!activeIds.has(id)) {
                this.buffers.delete(id);
            }
        }
    }

    hasBuffer(id: string): boolean {
        return this.buffers.has(id);
    }
}

export const bufferStore = new BufferStore();
