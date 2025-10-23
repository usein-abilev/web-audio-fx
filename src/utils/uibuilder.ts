export default {
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

        const moveKnob = (value: number, event: Event) => {
            percent = value;
            percent = Math.max(params.min || 0, Math.min(maxPercent, percent));
            onChange(percent / 100, event);
            updateKnob();
        }

        knob.addEventListener("mousedown", e => {
            isDragging = true;
            lastY = e.clientY;
        });
        knob.addEventListener("dblclick", e => {
            moveKnob(params.defaultValue * 100, e);
        });
        knob.addEventListener("wheel", event => {
            const factor = -1 * Math.sign(event.deltaY);
            percent += factor * 2.0;
            moveKnob(percent, event);
        });
        document.addEventListener("mouseup", () => isDragging = false);
        document.addEventListener("mousemove", (event) => {
            if (!isDragging) return;
            const delta = lastY - event.clientY;
            lastY = event.clientY;
            percent += delta * (params.speed || 0.5);
            moveKnob(percent, event);
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
