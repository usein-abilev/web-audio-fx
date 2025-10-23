type ContextMenuOption = {
    key: string;
    displayText: string | (() => string);
    canShow?: () => boolean;
    handler: (ev: PointerEvent) => any;
};

export const createContextMenu = (
    element: HTMLElement,
    canOpen: (event: PointerEvent) => boolean,
    options: ContextMenuOption[]
) => {
    const contextMenuElement = document.getElementById("context-menu")!;
    const ul = document.createElement("ul");
    contextMenuElement.innerHTML = "";
    contextMenuElement.append(ul);

    element.addEventListener("mousedown", () => {
        contextMenuElement.style.display = "none";
    });
    element.addEventListener("contextmenu", (event: PointerEvent) => {
        event.preventDefault();
        const { clientX, clientY } = event;
        if (!canOpen(event)) return;
        const filtered = options.map((option) => {
            if (!option.canShow?.()) return;
            const item = document.createElement("li");
            item.dataset.action = option.key;
            item.innerText = typeof option.displayText === "string" ? option.displayText : option.displayText();
            item.addEventListener("click", (ev) => {
                ev.preventDefault();
                option.handler(ev);
                contextMenuElement.style.display = "none";
            });
            return item;
        }).filter((option => option)) as HTMLLIElement[]
        if (!filtered.length) return;

        ul.innerHTML = "";
        ul.append(...filtered);
        contextMenuElement.style.display = "block";
        contextMenuElement.style.left = `${clientX}px`;
        contextMenuElement.style.top = `${clientY}px`;
    });
};

