import { readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";

export const prerender = true;
export const ssr = false;

type Sample = {
    id: string;
    name: string;
    path: string;
};

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".flac"]);

function scanAudioFiles(path: string, rootDir: string): Sample[] {
    const samples: Sample[] = [];
    const stack: string[] = [path];

    while (stack.length) {
        const dirname = stack.pop()!;
        const entries = readdirSync(dirname);

        for (const entry of entries) {
            const fullpath = join(dirname, entry);
            const stat = statSync(fullpath);

            if (stat.isDirectory()) {
                stack.push(fullpath);
            } else if (AUDIO_EXTENSIONS.has(extname(entry).toLowerCase())) {
                const relativePath = "/" + relative(rootDir, fullpath).replaceAll("\\", "/");
                const name = entry.replace(/\.[^.]+$/, "");
                samples.push({
                    id: relativePath,
                    name,
                    path: relativePath,
                });
            }
        }
    }

    return samples;
}

export const load = async () => {
    const staticDir = join(process.cwd(), "static");
    const sampleDir = join(staticDir, "samples");
    const impulseResponseDir = join(staticDir, "impulse-responses");

    const impulseResponses = scanAudioFiles(impulseResponseDir, staticDir);
    const samples = scanAudioFiles(sampleDir, staticDir);

    return { samples, impulseResponses };
};
