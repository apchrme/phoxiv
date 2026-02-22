<!-- <script lang="ts">
  import type { PageProps } from "./$types";
  import { enhance } from "$app/forms";

  let { data }: PageProps = $props();

  let name = $state('');
  let message = $state('');
  let characterCount = $derived(message.length);

</script>

<div>
  {#each data.messages as message}
    <div class="message">
      <h3>{message.name} ({message.country})</h3>
      <p>{message.message}</p>
      <span class="date">Posted on {message.createdAt}</span>
    </div>
  {:else}
    <p>No messages yet</p>
  {/each}
</div>

<hr class="my-3">

<form method="post" use:enhance>
    <div>
      <label for="name">Name</label>
      <input id="name" type="text" bind:value={name} name="name" />
    </div>
    <div>
      <label for="msg">Message</label>
      <textarea id="msg" bind:value={message} name="message"></textarea>
      <span class="count">{characterCount} characters</span>
    </div>
    <button type="submit" disabled={characterCount < 5}>Post</button>
</form> -->