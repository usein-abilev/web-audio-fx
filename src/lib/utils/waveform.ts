/**
 * Generate SVG path data from AudioBuffer for waveform rendering.
 * Normalizes to the buffer's peak amplitude so the waveform always fills the available height.
 * Optionally renders only a sub-range via offsetFraction/durationFraction.
 */
export function generateWaveformPath(
    buffer: AudioBuffer,
    width: number,
    height: number,
    offsetFraction: number = 0,
    durationFraction: number = 1,
): string {
    const channelData = buffer.getChannelData(0);
    const totalSamples = channelData.length;

    let peak = 0;
    for (let i = 0; i < totalSamples; i++) {
        const abs = Math.abs(channelData[i]);
        peak = Math.max(peak, abs);
    }
    const scale = peak > 1 ? 1 / peak : 1;

    const startSample = Math.min(Math.floor(offsetFraction * totalSamples), totalSamples);
    const endSample = Math.min(Math.floor((offsetFraction + durationFraction) * totalSamples), totalSamples);
    const activeSamples = endSample - startSample;
    if (activeSamples <= 0) return "";
    const samplesPerPixel = Math.ceil(activeSamples / width);
    const middleY = height / 2;

    let path = "";

    for (let x = 0; x < width; x++) {
        const start = startSample + Math.floor((x / width) * activeSamples);
        const end = Math.min(endSample, start + samplesPerPixel, totalSamples);

        let min = 1;
        let max = -1;

        for (let i = start; i < end; i++) {
            const sample = channelData[i];
            if (sample > max) max = sample;
            if (sample < min) min = sample;
        }

        const yMin = (1 + min * scale) * middleY;
        const yMax = (1 + max * scale) * middleY;

        if (x === 0) {
            path += `M ${x} ${yMax}`;
        } else {
            path += ` L ${x} ${yMax}`;
        }
        path += ` L ${x} ${yMin}`;
    }

    return path;
}
