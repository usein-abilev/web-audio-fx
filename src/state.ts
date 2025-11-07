export enum FloatingWindowType {
    SampleViewer = "sample-viewer-window",
    Graph = "graph-window",
};

type AppState = {
    bpm: number;
    playing: boolean;
    recording: boolean;
    metronome: boolean;

    activeFloatingWindow?: FloatingWindowType;
};

let state: AppState;

const observers = new Map<keyof AppState, WatchCallback<any>[]>();

export const initState = () => {
    const proxyOptions: ProxyHandler<AppState> = {
        get: (obj, property) => {
            return Reflect.get(obj, property);
        },
        set: (obj, property: keyof AppState, value) => {
            Reflect.set(obj, property, value);

            if (observers.has(property)) {
                observers.get(property)!.forEach(observer => observer(value, state));
            }

            return true;
        },
    };

    state = new Proxy({
        bpm: 120,
        playing: false,
        recording: false,
        metronome: false,
    }, proxyOptions);
}

type WatchCallback<P extends keyof AppState> = (newValue: AppState[P], state: AppState) => void;

export const watchState = <P extends keyof AppState>(
    property: P,
    callback: WatchCallback<P>
) => {
    if (observers.has(property)) {
        observers.get(property)!.push(callback);
    } else {
        observers.set(property, [callback]);
    }
};

export const getState = () => state;

