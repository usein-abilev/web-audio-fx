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
    return {
        createContainer(...items: HTMLElement[]) {
            const pluginContainer = document.createElement("div");
            pluginContainer.className = "plugin-container";
            items.forEach((item) => pluginContainer.appendChild(item));
            return pluginContainer;
        },
        slider(
            content: HTMLElement | string,
            onChange: (value: number, event: Event) => any,
            params: {
                min?: number;
                max?: number;
                step?: number;
                defaultValue?: number; 
            } = { defaultValue: 0 }
        ) {
            const band = document.createElement("div");
            const input = document.createElement("input");
            const label = document.createElement("label");
            const displayValueEl = document.createElement("label");

            displayValueEl.innerText = (params.defaultValue || 0).toFixed(1)
            band.className = "band";
            input.type = "range";

            label.append(content);
            band.append(input, displayValueEl, label);

            Object.assign(input, params);
            // Object.entries(params).map(([key, value]) => Object.defineProperty(input, key, { value }));

            input.addEventListener("input", (ev: Event) => {
                const value = +(ev.target as HTMLInputElement).value;
                onChange(value, ev);
                displayValueEl.innerText = `${value}`;
            });

            band.addEventListener("dblclick", () => {
                input.value = String(params.defaultValue ?? 0);
                input.dispatchEvent(new Event("input"));
            });

            return band;
        },
        select(
            content: HTMLElement | string,
            onChange: (selected: string, event: any) => any,
            params: {
                options: { value: string; displayText: string; }[],
                selectedValue?: string;
            }
        ) {
            const selectBlock = document.createElement("div");
            selectBlock.className = "select-block";

            const label = document.createElement("span");
            const select = document.createElement("select");

            select.name = "plugin-select";
            select.value = params.selectedValue || "";

            const childs = params.options.map(({ value, displayText }) => {
                const option = document.createElement("option");
                option.value = value;
                option.innerText = displayText;
                if (params.selectedValue === value) option.setAttribute("selected", "true");
                return option;
            });
            select.addEventListener("change", (ev: any) => {
                onChange(ev.target.value, ev);
            });

            label.append(content);
            select.append(...childs);
            selectBlock.append(label, select);

            return selectBlock;
        },
        checkbox(
            content: HTMLElement | string,
            onChange: (checked: boolean, event: Event) => any,
            params: { defaultValue?: boolean }
        ) {
// <label for="loop-playback">Loop: <input type="checkbox" id="loop-playback" value="off" tabindex="-1" aria-disabled="true"></label>
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox";

            input.checked = !!params.defaultValue;
            input.addEventListener("change", (ev: Event) => {
                onChange((ev.target as HTMLInputElement).checked, ev);
            });

            label.append(
                content,
                input,
            );

            return label;
        },
    };
};
