<script setup lang="ts">
import { LoaderCircleIcon, SparklesIcon } from "@lucide/vue";
import type { GatewaySkill } from "~~/shared/types";
import { Button } from "@codex-gateway/ui/button";
import { Command, CommandList } from "@codex-gateway/ui/command";
import { ScrollArea } from "@codex-gateway/ui/scroll-area";

defineProps<{
  open: boolean;
  skills: GatewaySkill[];
  selectedIndex: number;
  loading: boolean;
  query: string;
  error: string | null;
}>();

const emit = defineEmits<{
  select: [skill: GatewaySkill];
  hover: [index: number];
}>();
</script>

<template>
  <div
    v-if="open"
    data-testid="skill-menu"
    class="absolute inset-x-2 bottom-full z-30 mb-2 overflow-hidden rounded-2xl border border-hairline bg-surface p-1 shadow-xl shadow-ink/10"
    role="listbox"
    :aria-label="$t('app.skills')"
  >
    <div v-if="loading" class="flex items-center gap-2 px-3 py-2 text-sm text-ink-muted">
      <LoaderCircleIcon class="size-4 animate-spin" />
      {{ $t("app.loadingSkills") }}
    </div>
    <div v-else-if="error" class="px-3 py-2 text-sm text-danger">{{ error }}</div>
    <div v-else-if="skills.length === 0" class="px-3 py-2 text-sm text-ink-muted">
      {{ query ? $t("app.noMatchingSkills") : $t("app.noSkills") }}
    </div>
    <Command v-else>
      <CommandList>
        <ScrollArea class="h-[min(45vh,18rem)]">
          <Button
            v-for="(skill, index) in skills"
            :key="skill.path"
            type="button"
            variant="ghost"
            role="option"
            class="min-h-0 w-full justify-start gap-2 overflow-hidden rounded-xl px-3 py-2 text-left"
            :class="index === selectedIndex ? 'bg-canvas-soft text-ink' : 'text-ink-secondary'"
            :aria-selected="index === selectedIndex"
            :data-testid="`skill-option-${index}`"
            @mouseenter="emit('hover', index)"
            @mousedown.prevent
            @click="emit('select', skill)"
          >
            <SparklesIcon class="size-4 shrink-0 text-primary" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">${{ skill.name }}</span>
              <span class="block truncate text-xs text-ink-muted">{{ skill.description }}</span>
            </span>
          </Button>
        </ScrollArea>
      </CommandList>
    </Command>
  </div>
</template>
