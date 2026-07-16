// This file contains implementation of IndexedDB client to store/fetch audio files
const DB_NAME = "web-audio";
const DB_STORE_NAME = "audio-files";
const DB_VERSION = 1;

export type AudioFileRecord = {
    id: string;
    name: string;
    arrayBuffer: ArrayBuffer;
    duration: number;
    format: string;
    createdAt: number;
};

export type AudioFileMetadata = Omit<AudioFileRecord, "arrayBuffer">;

export function openDatabase(): Promise<IDBDatabase> {
    if (!window.indexedDB) {
        throw new Error("IndexedDB is not supported");
    }

    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.currentTarget as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
                const objectStore = db.createObjectStore(DB_STORE_NAME, {
                    keyPath: "id",
                });
                console.log("Object store initialized", objectStore);
            }
        };
        request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
        request.onerror = (error) => reject(error);
        request.onblocked = () => {
            reject(new Error("Database upgrade blocked: close other tabs"));
        };
    });
}

export function createDatabaseRecord(db: IDBDatabase, record: AudioFileRecord): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE_NAME, "readwrite", {});
        const store = tx.objectStore(DB_STORE_NAME);
        const request = store.add(record); // use add to catch duplicates
        request.onsuccess = () => resolve();
        request.onerror = (error) => reject(error);
    });
}

export function fetchDatabaseRecordById(db: IDBDatabase, id: AudioFileRecord["id"]): Promise<AudioFileRecord | null> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE_NAME, "readonly", {});
        const store = tx.objectStore(DB_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (error) => reject(error);
    });
}

export function fetchAllAudioFileMetadata(db: IDBDatabase): Promise<AudioFileMetadata[]> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE_NAME, "readonly", {});
        const store = tx.objectStore(DB_STORE_NAME);
        const request = store.openCursor();
        const results: AudioFileMetadata[] = [];

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                const { arrayBuffer, ...metadata } = cursor.value;
                results.push(metadata);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = (error) => reject(error);
    });
}

export function deleteAudioFile(db: IDBDatabase, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE_NAME, "readwrite", {});
        const store = tx.objectStore(DB_STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (error) => reject(error);
    });
}
