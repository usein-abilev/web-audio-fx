/**
 * Converts linear value to db
 * 0.001 -> -60 dB
 * 0.1 -> -20 dB
*/
export const linearToDecibel = (a: number) => 20 * Math.log10(a);
export const decibelToLinear = (a: number) => 10 ** (a / 20);

export const normalizeLinear = (value: number, min: number, max: number) => {
    return min + (max - min) * value;
}
export const denormalizeLinear = (value: number, min: number, max: number) => {
    return (value - min) / (max - min);
}

/**
 * Normalizes value in range [0..1]
 * Slow growth, fast tail
*/
export const normalizeLog = (value: number, min: number, max: number) => {
    return min + (max - min) * (value ** 2.5);
}

/**
 * Normalizes the value in range [0..1]
 * Fast growth, slow end (ideal for attack, release knobs)
*/
export const normalizeExpCurve = (value: number, min: number, max: number) => {
    return min * (max / min) ** value;
}

export const distance2D = (x: number, y: number, x1: number, y1: number): number => {
    return Math.sqrt((x1 - x) ** 2 + (y1 - y) ** 2);
}

export const withBasePath = (path: string) => {
    const { BASE_URL } = import.meta.env;
    const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
    const pathname = path.startsWith("/") ? path.substring(1) : path;
    return base + pathname;
}

export const formatTime = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const randomId = () => {
    const timestamp = Date.now().toString(16);
    const random = Math.floor(Math.random() * 2 ** 52).toString(16);
    return `${timestamp}-${random}`;
};

export const compressFloat32Array = <T extends ArrayBufferLike>(array: Float32Array<T>, rate: number): Float32Array => {
    if (rate === 0) throw new Error("compression rate cannot be zero");
    const compressed = new Float32Array(array.length / rate);

    for (let i = 0, k = 0; i < array.length; i += rate, k++) {
        let sum = 0;
        for (let j = i; j < i + rate; j++) {
            sum += array[j];
        }
        compressed[k] = sum / rate;
    }
    return compressed;
};

export const fetchAudioAsArrayBuffer = async (audioUrl: string): Promise<ArrayBuffer> => {
    try {
        const response = await fetch(audioUrl);
        const buffer = await response.arrayBuffer();
        return buffer;
    } catch (error) {
        console.error("Error fetching audio array buffer:", error);
        throw new Error("Error fetching audio data");
    }
};

export const disconnectAudioNodesSafe = (source: AudioNode, target: AudioNode): boolean => {
    try {
        source.disconnect(target);
        return true;
    } catch (error) {
        return false;
    }
}
