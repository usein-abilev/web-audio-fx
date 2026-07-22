export function darkenColor(hex: string, amount: number): string {
    if (hex[0] !== "#" || hex.length < 4) throw new Error("invalid hex");

    hex = hex.slice(1);
    if (hex.length === 3) {
        // #fea -> #ffeeaa
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    const f = 1 - amount;
    const r = Math.round(parseInt(hex.slice(0, 2), 16) * f);
    const g = Math.round(parseInt(hex.slice(2, 4), 16) * f);
    const b = Math.round(parseInt(hex.slice(4, 6), 16) * f);
    const result = `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`;
    return hex.length === 8 ? result + hex.slice(-2) : result;
}
