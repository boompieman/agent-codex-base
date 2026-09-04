<script setup lang="ts">
import {
  ActivityIcon,
  ChartNoAxesCombinedIcon,
  GitCompareArrowsIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  PanelRightOpenIcon,
  TerminalIcon,
} from "@lucide/vue";
import { Button } from "@codex-gateway/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@codex-gateway/ui/dropdown-menu";
import { SidebarTrigger } from "@codex-gateway/ui/sidebar";

defineProps<{
  title: string;
  canLaunch: boolean;
  canOpenSummary: boolean;
  canOpenReview: boolean;
  tmuxActiveCount: number;
}>();

const emit = defineEmits<{
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
    class="flex min-h-14 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-3"
  >
    <SidebarTrigger
      data-testid="desktop-sidebar-collapse"
      class="size-11 shrink-0 rounded-xl"
      :title="$t('app.hideSidebar')"
      :aria-label="$t('app.hideSidebar')"
    />
    <div class="min-w-0 flex-1">
      <p class="truncate text-[0.9375rem] font-semibold" :title="title">{{ title }}</p>
    </div>

    <Button
      data-testid="open-summary-button"
      variant="ghost"
      size="sm"
      class="h-11 shrink-0 gap-2 rounded-xl px-3 text-ink-secondary"
      :disabled="!canOpenSummary"
      :title="$t('app.results')"
      :aria-label="$t('app.results')"
      @click="emit('openSummary')"
    >
      <PanelRightOpenIcon class="size-4" />
      <span>{{ $t("app.results") }}</span>
    </Button>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          data-testid="workspace-tools-toggle"
          variant="ghost"
          size="icon-lg"
          class="relative size-11 shrink-0 rounded-xl"
          :aria-label="$t('app.moreTools')"
        >
          <MoreHorizontalIcon class="size-5" />
          <span
            v-if="tmuxActiveCount"
            class="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground"
          >
            {{ tmuxActiveCount }}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-56">
        <DropdownMenuLabel>{{ $t("app.advancedTools") }}</DropdownMenuLabel>
        <DropdownMenuItem
          data-testid="open-review-button"
          :disabled="!canOpenReview"
          class="min-h-11"
          @select="emit('openReview')"
        >
          <GitCompareArrowsIcon class="mr-2 size-4" />
          {{ $t("app.fileGitReviewTab") }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="open-browser-button"
          :disabled="!canLaunch"
          class="min-h-11"
          @select="emit('openBrowser')"
        >
          <GlobeIcon class="mr-2 size-4" />
          {{ $t("app.openBrowser") }}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="open-terminal-button"
          :disabled="!canLaunch"
          class="min-h-11"
          @select="emit('openTerminal')"
        >
          <TerminalIcon class="mr-2 size-4" />
          {{ $t("app.openTerminal") }}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="open-tmux-button"
          :disabled="!canLaunch"
          class="min-h-11"
          @select="emit('openTmux')"
        >
          <ActivityIcon class="mr-2 size-4" />
          <span class="min-w-0 flex-1">{{ $t("app.openTmuxMonitor") }}</span>
          <span v-if="tmuxActiveCount" class="text-xs tabular-nums text-ink-muted">
            {{ tmuxActiveCount }}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="open-host-monitor-button"
          :disabled="!canLaunch"
          class="min-h-11"
          @select="emit('openHostMonitor')"
        >
          <ChartNoAxesCombinedIcon class="mr-2 size-4" />
          {{ $t("app.openHostMonitor") }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </header>
</template>
