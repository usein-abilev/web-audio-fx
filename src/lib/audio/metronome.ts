/**
 * Plays a metronome sound on the output device
 * @param {number} beat - the current beat, plays higher note each 0 beat.
 * @param {number} time - current time provided by AudioContext.currentTime
 */
export function playMetronome(audioContext: AudioContext, beat: number, time: number) {
    const osc = audioContext.createOscillator();
    const envelope = audioContext.createGain();

    osc.connect(envelope);
    envelope.connect(audioContext.destination);

    osc.frequency.value = beat === 0 ? 1000 : 800;

    envelope.gain.setValueAtTime(1, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.start(time);
    osc.stop(time + 0.1);
}
