export type ParamType = "number" | "boolean" | "select";

export interface AudioNodeParam {
    id: string;
    name: string;
    type: ParamType;
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: number | boolean | string;
    options?: { value: string; label: string }[];
    hideLabel?: boolean;
    getValue: () => number | boolean | string;
    setValue: (value: number | boolean | string) => void;
}
