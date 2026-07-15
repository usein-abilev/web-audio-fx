<script>
    let { children } = $props();
</script>

{@render children()}

<style>
    :root {
        color-scheme: light dark;
        color: var(--text-primary);
        background-color: var(--bg-main);
        font-family: var(--font-family);
        line-height: 1.5;
        font-weight: 400;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;

        --bg-main: #f0f0f2;
        --bg-surface: #f7f7f9;
        --bg-secondary: #f0f0f2;
        --bg-hover: #e2e2e6;
        --bg-grid-alt: #e4e4e8;
        --border-color: #d0d0d4;
        --text-primary: #1a1a1e;
        --text-secondary: #6a6a72;
        --accent-color: #7e2480;
        --accent-primary: #7e2480;
        --error-color: #c62828;
        --success-color: #2e7d32;
        --orange-color: #df9339;
        --font-family: "Inter", sans-serif;
        --box-shadow: 0 2px 3px rgba(0, 0, 0, 0.2);
        --grid-color: #c8c8cc;
        --grid-bar-color: #b0b0b8;
    }

    :global(.theme-dark) {
        --bg-main: #1e1e22;
        --bg-surface: #28282c;
        --bg-secondary: #28282c;
        --bg-hover: #333338;
        --bg-grid-alt: #252529;
        --border-color: #3a3a40;
        --text-primary: #e4e4e8;
        --text-secondary: #8a8a92;
        --accent-color: #c056c4;
        --accent-primary: #802382;
        --error-color: #e63946;
        --success-color: #00e676;
        --orange-color: #df9339;
        --grid-color: #3a3a40;
        --grid-bar-color: #4a4a50;
    }

    :global(*) {
        outline: none;
    }

    :global(body) {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        min-width: 320px;
        height: 100vh;
    }

    :global(h2) {
        font-size: 0.9rem;
        text-transform: uppercase;
        color: var(--text-secondary);
        letter-spacing: 1px;
        margin: 0 0 8px 0;
    }

    :global(h3) {
        font-size: 0.8rem;
        color: var(--text-secondary);
        letter-spacing: 1px;
    }

    :global(.hidden) {
        display: none;
    }

    :global(.svg-button) {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        border: none;
        background: none;
        cursor: pointer;
        transition:
            background 0.15s,
            border-color 0.15s;
        color: var(--text-primary);

        & > * {
            width: 16px;
            height: 16px;
        }

        &.active {
            background: var(--bg-main);
        }
    }
</style>
