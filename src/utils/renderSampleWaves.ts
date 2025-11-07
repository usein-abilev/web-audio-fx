
const renderSampleWaves = (
    buffer: AudioBuffer, 
    width: number, height: number, 
    sampleScale: number, scaleOffsetX: number,
    wavesColor?: string,
): HTMLCanvasElement => {
    const localCanvas = document.createElement("canvas");
    localCanvas.width = width;
    localCanvas.height = height;
    const ctx = localCanvas.getContext("2d")!;

    if (!buffer) {
        throw new Error("Audio Buffer isn't provided");
    }

    const channelBuffer = buffer.getChannelData(0);

    const scaledWidth = width * sampleScale;
    const totalSamples = channelBuffer.length;
    const samplePerPixel = Math.ceil(totalSamples / scaledWidth);

    ctx.beginPath();
    const middleY = height / 2;
    for (let x = 0; x < width; x++) {
        const start = Math.floor(((x - scaleOffsetX) / scaledWidth) * totalSamples);
        const end = Math.min(totalSamples, start + samplePerPixel);
        let min = 1;
        let max = -1;
        for (let i = start; i < end && i < channelBuffer.length; i++) {
            const sample = channelBuffer[i];
            if (sample > max) max = sample;
            if (sample < min) min = sample;
        }

        ctx.moveTo(x, (1 + min) * middleY);
        ctx.lineTo(x, (1 + max) * middleY);
    }
    ctx.closePath();
    ctx.strokeStyle = wavesColor ?? "rgba(126, 36, 128, 1)"
    ctx.stroke();

    return localCanvas;
};

export default renderSampleWaves;
