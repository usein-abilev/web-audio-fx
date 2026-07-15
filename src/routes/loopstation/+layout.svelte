<script lang="ts">
    import { dev } from "$app/environment";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    let { children } = $props();

    onMount(() => {
        if (!dev) {
            goto("/");
        }
    });
</script>

{#if dev}
    {@render children()}
{/if}
