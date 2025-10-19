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

export const createPluginUI = () => {
    return {
        createContainer(...items: HTMLElement[]) {
            const pluginContainer = document.createElement("div");
            pluginContainer.className = "plugin-container";
            items.forEach((item) => pluginContainer.appendChild(item));
            return pluginContainer;
        },
        createSlider(
            content: HTMLElement | string,
            onChange: (event: Event) => any,
            params: Partial<Record<"min" | "max" | "defaultValue" | "step", string>> = { defaultValue: "0" }
        ) {
            const band = document.createElement("div");
            band.className = "band";

            const input = document.createElement("input");
            input.type = "range";
            for (const key in params) {
                // @ts-ignore
                input[key] = params[key] as any;
            }
            input.onchange = onChange;
            band.ondblclick = (ev) => {
                // reset value
                input.value = params.defaultValue || "0";
                input.onchange!(ev);
            };
            const label = document.createElement("label");
            if (typeof content === "string") {
                label.innerText = content;
            } else {
                label.appendChild(content);
            }

            band.appendChild(input);
            band.appendChild(label);

            return band;
        },
    };
};
