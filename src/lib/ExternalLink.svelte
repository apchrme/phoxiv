<script lang="ts">
    const { url, label=url.substring(1) } = $props();
    
</script>

<a href={url} target="_blank">
{label}
</a>