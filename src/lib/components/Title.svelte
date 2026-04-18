<script lang="ts">

    const { title, description }: { title: string; description: string } = $props();

</script>


<header class="py-5 md:py-10">
    <h1 class = "mb-1 text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
    </h1>
    <p class="m-0 prose text-muted-foreground">
        {description}
    </p>
</header>