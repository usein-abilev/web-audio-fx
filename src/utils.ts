export const randomId = () => {
    const timestamp = Date.now().toString(16);
    const random = Math.floor(Math.random() * 2 ** 52).toString(16);
    return `${timestamp}-${random}`;
};

export const distance2D = (x: number, y: number, x1: number, y1: number): number => {
    return Math.sqrt((x1 - x) ** 2 + (y1 - y) ** 2);
}

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
    const appendChild = (parent: HTMLElement, child: any) => {
        if (child instanceof HTMLElement) {
            parent.appendChild(child);
        } else {
            parent.innerText = String(child)
        }
    }
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
            appendChild(label, content);

            band.appendChild(input);
            band.appendChild(label);

            return band;
        },
        createSelect(
            content: HTMLElement | string,
            onChange: (event: Event, selected: string) => any,
            options: { value: string; displayText: string; }[]
        ) {
            const label = document.createElement("label");
            appendChild(label, content);

            const select = document.createElement("select");
            const childs = options.map(({ value, displayText }) => {
                const option = document.createElement("option");
                option.value = value;
                option.innerText = displayText;
                return option;
            });
            select.addEventListener("change", (ev: any) => {
                onChange(ev, ev.target.value);
            });
            childs.forEach((child) => select.appendChild(child));
            label.appendChild(select);

            return label;
        }
    };
};
