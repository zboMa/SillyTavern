<script setup lang="ts">
import { computed } from 'vue';
import type { PluginUiContribution } from '../types';
import type { PluginContext } from '../types';

const props = defineProps<{
  items: PluginUiContribution[];
  activeId?: string | null;
  ctx?: PluginContext;
}>();

const active = computed(() => {
  if (!props.items.length) return null;
  if (!props.activeId) return props.items[0];
  return props.items.find((x) => x.id === props.activeId) ?? props.items[0];
});
</script>

<template>
  <component v-if="active" :is="active.component" :ctx="props.ctx" />
  <div v-else class="empty">No plugins registered for this slot.</div>
</template>

<style scoped>
.empty {
  color: #a3a3a3;
  font-size: 13px;
}
</style>

