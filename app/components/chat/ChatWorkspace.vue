<script setup lang="ts">
import WorkspaceDock from "./workspace-dock/WorkspaceDock.vue";

withDefaults(
  defineProps<{
    layout?: "desktop" | "mobile";
  }>(),
  {
    layout: "desktop",
  },
);
</script>

<template>
  <section class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface">
    <WorkspaceDock :layout="layout">
      <template #mobile-header-start>
        <slot name="mobile-header-start" />
      </template>
    </WorkspaceDock>
  </section>
</template>
