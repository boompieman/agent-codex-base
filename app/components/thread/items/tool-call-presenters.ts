import { jsonPreview } from "@/utils/thread-items";

import type { ThreadHistoryItem } from "~~/shared/types";
import { recordFromUnknown } from "~~/shared/utils/records";
import { trimmedOrFallback, trimmedOrNull } from "~~/shared/utils/strings";

type ToolCallItem = ThreadHistoryItem;

export type ToolCallIcon = "image" | "search" | "tool";

export interface ToolCallDetailSection {
  label: string;
  content?: string;
  markdown?: boolean;
  links?: ToolCallResultLink[];
}

export interface ToolCallResultLink {
  title: string;
  url: string;
  snippet?: string;
}

export interface ToolCallPresentation {
  title: string;
  icon: ToolCallIcon;
  details: ToolCallDetailSection[];
}

type Translate = (key: string) => string;
type ToolCallPresenter = (item: ToolCallItem, t: Translate) => ToolCallPresentation;

const emptyDetails: ToolCallDetailSection[] = [];

const toolCallPresenters: Record<string, ToolCallPresenter> = {
  mcpToolCall: (item, t) => {
    const errorMessage = trimmedOrNull(item.error?.message);
    return {
      title: `${trimmedOrFallback(item.server, "MCP")} · ${trimmedOrFallback(item.tool, "tool")}`,
      icon: "tool",
      details: compactDetails([
        { label: t("app.arguments"), content: jsonPreview(item.arguments) },
        item.result !== null && item.result !== undefined
          ? { label: t("app.result"), content: jsonPreview(item.result) }
          : null,
        errorMessage !== null
          ? { label: t("app.error"), content: errorMessage, markdown: true }
          : null,
      ]),
    };
  },

  dynamicToolCall: (item, t) => ({
    title: trimmedOrFallback(item.name, trimmedOrFallback(item.tool, "Tool call")),
    icon: "tool",
    details: compactDetails([
      { label: t("app.arguments"), content: jsonPreview(item.arguments) },
      Array.isArray(item.contentItems) && item.contentItems.length > 0
        ? { label: t("app.result"), content: jsonPreview(item.contentItems) }
        : null,
    ]),
  }),

  webSearch: webSearchPresentation,

  imageGeneration: (item, t) => {
    const savedPath = trimmedOrNull(item.savedPath);
    return {
      title: trimmedOrFallback(item.revisedPrompt, t("app.imageGeneration")),
      icon: "image",
      details: compactDetails([
        typeof item.result === "string"
          ? { label: t("app.result"), content: item.result, markdown: true }
          : null,
        savedPath !== null ? { label: t("app.savedPath"), content: savedPath } : null,
      ]),
    };
  },

  enteredReviewMode: (item, t) => reviewModePresentation(item, t, t("app.enteredReviewMode")),
  exitedReviewMode: (item, t) => reviewModePresentation(item, t, t("app.exitedReviewMode")),
};

export function presentToolCall(item: ToolCallItem, t: Translate): ToolCallPresentation {
  const presenter =
    typeof item.type === "string"
      ? (toolCallPresenters[item.type] ?? defaultToolCallPresenter)
      : defaultToolCallPresenter;
  return presenter(item, t);
}

function defaultToolCallPresenter(item: ToolCallItem): ToolCallPresentation {
  return {
    title: trimmedOrFallback(item.type, "Tool call"),
    icon: "tool",
    details: emptyDetails,
  };
}

function reviewModePresentation(item: ToolCallItem, t: Translate, title: string) {
  const review = trimmedOrNull(item.review);
  return {
    title,
    icon: "tool" as const,
    details: compactDetails([
      review !== null ? { label: t("app.review"), content: review, markdown: true } : null,
    ]),
  };
}

function webSearchPresentation(item: ToolCallItem, t: Translate): ToolCallPresentation {
  const links = webSearchResultLinks(item.results);
  return {
    title: trimmedOrFallback(item.query, "Web search"),
    icon: "search",
    details: compactDetails([
      item.action !== null && item.action !== undefined
        ? { label: t("app.action"), content: jsonPreview(item.action) }
        : null,
      links.length > 0 ? { label: t("app.result"), links } : null,
    ]),
  };
}

function compactDetails(details: Array<ToolCallDetailSection | null>) {
  return details.filter(
    (detail): detail is ToolCallDetailSection =>
      detail !== null &&
      (trimmedOrNull(detail.content) !== null ||
        (detail.links !== undefined && detail.links.length > 0)),
  );
}

function webSearchResultLinks(results: unknown): ToolCallResultLink[] {
  if (!Array.isArray(results)) return [];
  return results.flatMap((result, index) => {
    const record = recordFromUnknown(result);
    if (record === null) return [];
    const url = typeof record.url === "string" ? record.url : "";
    if (!isHttpUrl(url)) return [];
    const title = trimmedOrFallback(
      typeof record.title === "string" ? record.title : null,
      trimmedOrFallback(typeof record.ref_id === "string" ? record.ref_id : null, `#${index + 1}`),
    );
    const snippet = typeof record.snippet === "string" ? record.snippet.trim() : "";
    return [{ title, url, ...(snippet !== "" ? { snippet } : {}) }];
  });
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
