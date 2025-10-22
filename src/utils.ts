/**
 * Converts linear value to db
 * 0.001 -> -60 dB
 * 0.1 -> -20 dB
*/
export const linearToDecibel = (a: number) => 20 * Math.log10(a);
export const decibelToLinear = (a: number) => 10 ** (a / 20);

export const normalizeLinear = (value: number, min: number, max: number) => {
    return min + (max - min) * value;
}
export const denormalizeLinear = (value: number, min: number, max: number) => {
    return (value - min) / (max - min);
}

/**
 * Normalizes value in range [0..1]
 * Slow growth, fast tail
*/
export const normalizeLog = (value: number, min: number, max: number) => {
    return min + (max - min) * (value ** 2.5);
}

/**
 * Normalizes the value in range [0..1]
 * Fast growth, slow end (ideal for attack, release knobs)
*/
export const normalizeExpCurve = (value: number, min: number, max: number) => {
    return min * (max / min) ** value;
}

export const withBasePath = (path: string) => {
    const { BASE_URL } = import.meta.env;
    const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
    const pathname = path.startsWith("/") ? path.substring(1) : path;
    return base + pathname;
}

export const formatTime = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

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
        block(children: HTMLElement[]) {
            const block = document.createElement("div");
            block.className = "flex-block";
            block.append(...children);
            return block;
        },
        splitterHorizontal() {
            const splitter = document.createElement("div");
            splitter.className = "horizontal-splitter";
            return splitter;
        },
        slider(
            content: HTMLElement | string,
            onChange: (value: number, event: Event) => any,
            params: {
                min?: number;
                max?: number;
                step?: number;
                defaultValue?: number;
                value: number;
                formatter?: (value: number) => string | HTMLElement;
            } = { defaultValue: 0, value: 0 }
        ) {
            const band = document.createElement("div");
            const input = document.createElement("input");
            const label = document.createElement("label");
            const displayValueEl = document.createElement("label");

            const inputValue = params.value ?? params.defaultValue ?? 0;
            if (typeof params.formatter === "function") {
                displayValueEl.append(params.formatter(inputValue));
            } else {
                displayValueEl.innerText = (inputValue).toFixed(1)
            }

            band.className = "band";
            input.type = "range";
            input.value = String(inputValue);
            console.log("Set input value for '%s'", content, input.value, params.value);
            label.append(content);
            band.append(input, displayValueEl, label);

            Object.assign(input, params);
            // Object.entries(params).map(([key, value]) => Object.defineProperty(input, key, { value }));

            input.addEventListener("input", (ev: Event) => {
                const value = +(ev.target as HTMLInputElement).value;
                onChange(value, ev);
                displayValueEl.innerHTML = "";
                if (typeof params.formatter === "function") {
                    displayValueEl.append(params.formatter(value));
                } else {
                    displayValueEl.innerText = (value).toFixed(1)
                }
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
        knob(
            content: HTMLElement | string,
            onChange: (value: number, event: Event) => any,
            params: {
                min?: number;
                max?: number;
                speed?: number;

                /* value in coefficient 0..1 */
                value: number;
                /* value in coefficient 0..1 */
                defaultValue: number;
                formatter?: (v: number) => string;
            }
        ) {
            const knobContainer = document.createElement("div");
            knobContainer.className = "knob-container";

            const label = document.createElement("div");
            label.className = "label";
            label.append(content);

            const knob = document.createElement("div");
            const arc = document.createElement("div");
            const indicator = document.createElement("div");
            knob.className = "knob";
            arc.className = "arc";
            indicator.className = "indicator";
            knob.append(arc, indicator);

            const valueTextDiv = document.createElement("div");
            valueTextDiv.className = "value";

            const maxPercent = (params.max ?? 1) * 100;
            let percent = params.value * 100;
            let isDragging = false;
            let lastY = 0;

            const updateKnob = () => {
                const angle = (percent * 270) / maxPercent - 135;
                arc.style.setProperty("--angle", `${(270 / maxPercent) * percent}deg`);
                indicator.style.transform = `translateX(-50%) rotate(${angle}deg)`;
                valueTextDiv.textContent = params.formatter?.(percent / 100) || String(percent);
            }

            knob.addEventListener("mousedown", e => {
                isDragging = true;
                lastY = e.clientY;
            });
            knob.addEventListener("dblclick", e => {
                percent = params.defaultValue * 100;
                onChange(percent / 100, e);
                updateKnob();
            });
            document.addEventListener("mouseup", () => isDragging = false);
            document.addEventListener("mousemove", (e) => {
                if (!isDragging) return;
                const delta = lastY - e.clientY;
                lastY = e.clientY;

                percent += delta * (params.speed || 0.5);
                percent = Math.max(params.min || 0, Math.min(maxPercent, percent));
                onChange(percent / 100, e);
                updateKnob();
            });

            updateKnob();

            knobContainer.append(
                label,
                knob,
                valueTextDiv,
            );
            return knobContainer;
        },
    };
};
