import { createAuthClient } from 'better-auth/svelte';

/**
 * Sign-in and sign-out only. No `adminClient()` plugin: the admin panel acts
 * through form actions, never `authClient.admin.*`.
 */
export const authClient = createAuthClient();
