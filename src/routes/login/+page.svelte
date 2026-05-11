<script lang="ts">
    import { authClient } from '$lib/auth-client';
    import { Button } from '$lib/components/ui/button/index';
</script>

<Button onclick={async () => {await authClient.signIn.social({ provider: "github" })}}>Log in</Button>
