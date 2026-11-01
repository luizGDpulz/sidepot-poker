<script setup lang="ts">
defineProps<{
  roomId?: string;
}>();
</script>

<template>
  <main class="min-h-dvh bg-zinc-950 text-zinc-100 p-6">
    <p class="text-sm text-zinc-400">TV Display {{ roomId }}</p>
  </main>
</template>
