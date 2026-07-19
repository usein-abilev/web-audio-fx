export const normalizeLinear = (value: number, min: number, max: number) => {
    return min + (max - min) * value;
};

/**
 * Normalizes value in range [0..1]
 * Slow growth, fast tail
 */
export const normalizeLog = (value: number, min: number, max: number) => {
    return min + (max - min) * value ** 2.5;
};

/**
 * Normalizes the value in range [0..1]
 * Fast growth, slow end (ideal for attack, release knobs)
 */
export const normalizeExpCurve = (value: number, min: number, max: number) => {
    return min * (max / min) ** value;
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
};
