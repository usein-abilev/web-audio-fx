import { linearToDecibel } from "./utils"

const CANVAS_WIDTH = 80;
const METER_FFT_SIZE = 1024 * 4;

const calcRMS = (data: Float32Array) => {
    return Math.sqrt(data.reduce((a, c) => a + c * c, 0) / data.length);
}

export const createVolumeMeter = (audioContext: AudioContext) => {
    const canvas = document.getElementById("audio-volume-meter")! as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;

    const leftAnalyser = audioContext.createAnalyser();
    leftAnalyser.fftSize = METER_FFT_SIZE;

    const rightAnalyser = audioContext.createAnalyser();
    rightAnalyser.fftSize = METER_FFT_SIZE;

    const leftData = new Float32Array(METER_FFT_SIZE);
    const rightData = new Float32Array(METER_FFT_SIZE);

    const minDecibel = 60;
    const barPadding = 2;

    const renderMetricFor = (data: Float32Array, channel: number) => {
        const rms = calcRMS(data);
        const dB = linearToDecibel(rms);

        const greenThreshold = -20;
        const orangeThreshold = -6;

        const greenPercent = (Math.min(greenThreshold, dB) + minDecibel) / minDecibel;
        const orangePercent = (Math.min(orangeThreshold, dB) + minDecibel) / minDecibel;
        const redPercent = (Math.min(0, dB) + minDecibel) / minDecibel;

        const greenBar = canvas.height - greenPercent * canvas.height;
        const orangeBar = canvas.height - orangePercent * canvas.height;
        const redBar = canvas.height - redPercent * canvas.height;

        const barWidth = canvas.width / 2 + barPadding * (channel * 2 - 1);
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(channel * barWidth, redBar, canvas.width / 2, canvas.height);
        ctx.fillStyle = "#ffbb4a";
        ctx.fillRect(channel * barWidth, orangeBar, canvas.width / 2, canvas.height);
        ctx.fillStyle = "#50bb4a";
        ctx.fillRect(channel * barWidth, greenBar, canvas.width / 2, canvas.height);
    }

    const renderVolumeMetrics = () => {
        requestAnimationFrame(renderVolumeMetrics);

        leftAnalyser.getFloatTimeDomainData(leftData);
        rightAnalyser.getFloatTimeDomainData(rightData);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderMetricFor(leftData, 0);
        renderMetricFor(rightData, 1);

        const yOffset = canvas.height / (minDecibel / 5);
        for (let i = 0; i <= minDecibel / 5; i++) {
            const y = i * yOffset;
            ctx.fillStyle = "#fefefe";
            ctx.font = "9px Consolas";
            ctx.fillText(`${i * 5}`, 1, y - 2);
            ctx.fillStyle = "#888";
            ctx.fillRect(0, y, 10, 1);
        }
    }
    renderVolumeMetrics();

    return {
        connect(node: AudioNode) {
            const splitter = audioContext.createChannelSplitter(2);
            splitter.connect(leftAnalyser, 0);
            splitter.connect(rightAnalyser, 1);

            node.connect(splitter);
        },
        resize(width: number, height: number) {
            canvas.width = width;
            canvas.height = height;
        },
        getWidth: () => CANVAS_WIDTH,
    }
}
