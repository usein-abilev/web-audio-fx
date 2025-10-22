export const SUPPORTED_AUDIO_MIME_TYPES = [
    "audio/mpeg",
    "audio/ogg",
    "audio/wave", "audio/wav", "audio/x-wav",
    "audio/mp4",
    "audio/flac",
];

// setting limit to avoid page freezing during audio processing. 
export const MAX_AUDIO_FILE_SIZE = 8 * 1024 * 1024;

type ValidateAudioFileResult = { ok: true; } | { ok: false; message: string };

export const validateAudioFile = (file: File): ValidateAudioFileResult => {
    if (!file) return { ok: false, message: "File not found" };
    if (!SUPPORTED_AUDIO_MIME_TYPES.includes(file.type)) {
        return {
            ok: false,
            message: "Unsupported file type. Supported MIME-types: " + SUPPORTED_AUDIO_MIME_TYPES
        };
    }
    if (file.size > MAX_AUDIO_FILE_SIZE) {
        return {
            ok: false,
            message: "File size has exceeded the MAX_AUDIO_FILE_SIZE constraint: " + MAX_AUDIO_FILE_SIZE
        };
    }
    return { ok: true };
}
