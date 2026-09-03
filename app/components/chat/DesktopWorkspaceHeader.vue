<script setup lang="ts">
import {
  ActivityIcon,
  ChartNoAxesCombinedIcon,
  GitCompareArrowsIcon,
  GlobeIcon,
  MonitorIcon,
  PanelRightOpenIcon,
  TerminalIcon,
} from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import { SidebarTrigger } from "@codex-gateway/ui/sidebar";

defineProps<{
  title: string;
  subtitle: string | null;
  canLaunch: boolean;
  canOpenSummary: boolean;
  canOpenReview: boolean;
  tmuxActiveCount: number;
}>();

const emit = defineEmits<{
  openAgent: [];
  openSummary: [];
  openReview: [];
  openTerminal: [];
  openBrowser: [];
  openTmux: [];
  openHostMonitor: [];
}>();
</script>

<template>
  <header
    data-testid="desktop-workspace-header"
    class="flex h-12 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3"
  >
    <SidebarTrigger
      data-testid="desktop-sidebar-collapse"
      class="size-8 shrink-0"
      :title="$t('app.hideSidebar')"
      :aria-label="$t('app.hideSidebar')"
    />
    <div aria-hidden="true" class="h-5 w-px shrink-0 bg-hairline" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-semibold" :title="title">{{ title }}</p>
      <p v-if="subtitle" class="hidden truncate text-xs text-ink-muted lg:block" :title="subtitle">
        {{ subtitle }}
      </p>
    </div>

    <nav class="flex shrink-0 items-center gap-1" :aria-label="$t('app.workspaceTools')">
      <Button
        data-testid="open-agent-button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5 px-2 text-ink-muted hover:text-ink"
        :title="$t('app.agentTab')"
        :aria-label="$t('app.agentTab')"
        @click="emit('openAgent')"
      >
        <MonitorIcon class="size-4" />
        <span class="hidden xl:inline">{{ $t("app.agentTab") }}</span>
      </Button>
      <Button
        data-testid="open-summary-button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5 px-2 text-ink-muted hover:text-ink"
        :disabled="!canOpenSummary"
        :title="$t('app.workspaceSummary')"
        :aria-label="$t('app.workspaceSummary')"
        @click="emit('openSummary')"
      >
        <PanelRightOpenIcon class="size-4" />
        <span class="hidden xl:inline">{{ $t("app.workspaceSummary") }}</span>
      </Button>
      <Button
        data-testid="open-review-button"
        variant="ghost"
        size="sm"
        class="h-8 gap-1.5 px-2 text-ink-muted hover:text-ink"
        :disabled="!canOpenReview"
        :title="$t('app.fileGitReviewTab')"
        :aria-label="$t('app.fileGitReviewTab')"
        @click="emit('openReview')"
      >
        <GitCompareArrowsIcon class="size-4" />
        <span class="hidden xl:inline">{{ $t("app.fileGitReviewTab") }}</span>
      </Button>

      <div aria-hidden="true" class="mx-1 h-5 w-px shrink-0 bg-hairline" />
      <Button
        data-testid="open-tmux-button"
        variant="ghost"
        size="icon"
        class="relative size-8 shrink-0"
        :disabled="!canLaunch"
        :title="$t('app.openTmuxMonitor')"
        :aria-label="$t('app.openTmuxMonitor')"
        @click="emit('openTmux')"
      >
        <ActivityIcon class="size-4" />
        <span
          v-if="tmuxActiveCount"
          class="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground"
        >
          {{ tmuxActiveCount }}
        </span>
      </Button>
      <Button
        data-testid="open-host-monitor-button"
        variant="ghost"
        size="icon"
        class="size-8 shrink-0"
        :disabled="!canLaunch"
        :title="$t('app.openHostMonitor')"
        :aria-label="$t('app.openHostMonitor')"
        @click="emit('openHostMonitor')"
      >
        <ChartNoAxesCombinedIcon class="size-4" />
      </Button>
      <Button
        data-testid="open-browser-button"
        variant="ghost"
        size="icon"
        class="size-8 shrink-0"
        :disabled="!canLaunch"
        :title="$t('app.openBrowser')"
        :aria-label="$t('app.openBrowser')"
        @click="emit('openBrowser')"
      >
        <GlobeIcon class="size-4" />
      </Button>
      <Button
        data-testid="open-terminal-button"
        variant="outline"
        size="sm"
        class="h-8 gap-1.5 px-2"
        :disabled="!canLaunch"
        :title="$t('app.openTerminal')"
        :aria-label="$t('app.openTerminal')"
        @click="emit('openTerminal')"
      >
        <TerminalIcon class="size-4" />
        <span class="hidden 2xl:inline">{{ $t("app.openTerminal") }}</span>
      </Button>
    </nav>
  </header>
</template>
