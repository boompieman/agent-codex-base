<script setup lang="ts">
import { basicSetup } from "codemirror";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import {
  EditorState,
  Prec,
  StateEffect,
  type Extension,
  type Range,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  placeholder as placeholderExtension,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { FileReference, GatewaySkill } from "~~/shared/types";
import type { ComposerFileReference } from "@/stores/gateway/types";
import { useGatewayRealtimeStore } from "@/stores/gateway-realtime";
import {
  expectProjectFileSearchResults,
  expectSkillListResults,
} from "@/stores/gateway-realtime/response-parsers";
import { createUuid } from "@/lib/uuid";
import ComposerFileMentionMenu from "./ComposerFileMentionMenu.vue";
import ComposerSkillMenu from "./ComposerSkillMenu.vue";

const MAX_REFERENCES = 10;

const props = defineProps<{
  modelValue: string;
  references: ComposerFileReference[];
  scopeKey: string;
  hostId: number | null;
  projectId: number | null;
  disabled: boolean;
  placeholder: string;
  limitMessage: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string, scopeKey: string];
  "update:references": [value: ComposerFileReference[], scopeKey: string];
  keydown: [event: KeyboardEvent];
  paste: [event: ClipboardEvent];
  limit: [message: string];
}>();

const container = ref<HTMLElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const menuOpen = ref(false);
const query = ref("");
const queryFrom = ref(0);
const files = ref<FileReference[]>([]);
const selectedIndex = ref(0);
const loading = ref(false);
const searchError = ref<string | null>(null);
const skillMenuOpen = ref(false);
const skillQuery = ref("");
const skillQueryFrom = ref(0);
const allSkills = ref<GatewaySkill[]>([]);
const selectedSkillIndex = ref(0);
const skillsLoading = ref(false);
const skillsError = ref<string | null>(null);
const loadedSkillsScope = ref("");
const filteredSkills = computed(() => {
  const normalized = skillQuery.value.trim().toLowerCase();
  return normalized
    ? allSkills.value.filter((skill) =>
        `${skill.name} ${skill.description}`.toLowerCase().includes(normalized),
      )
    : allSkills.value;
});
const realtime = useGatewayRealtimeStore();
const cancellationToken = `composer-files-${createUuid()}`;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchGeneration = 0;
let syncing = false;

class FileReferenceWidget extends WidgetType {
  constructor(private readonly reference: ComposerFileReference) {
    super();
  }

  override eq(other: FileReferenceWidget) {
    return other.reference.id === this.reference.id && other.reference.name === this.reference.name;
  }

  override toDOM() {
    const reference = document.createElement("span");
    reference.className = "cm-file-reference";
    reference.dataset.fileReference = this.reference.path;
    reference.textContent = `@${this.reference.name}`;
    return reference;
  }
}

onMounted(() => {
  if (!container.value) return;
  view.value = new EditorView({
    parent: container.value,
    state: EditorState.create({ doc: props.modelValue, extensions: extensions() }),
  });
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  searchGeneration += 1;
  view.value?.destroy();
  view.value = null;
});

watch(
  () => props.modelValue,
  (value) => {
    const editor = view.value;
    if (!editor || editor.state.doc.toString() === value) return;
    syncing = true;
    try {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    } finally {
      syncing = false;
    }
  },
);

watch(
  () => props.references,
  () => reconfigure(),
  { deep: true },
);
watch(() => props.disabled, reconfigure);
watch(() => props.placeholder, reconfigure);

function reconfigure() {
  const editor = view.value;
  if (!editor) return;
  editor.dispatch({ effects: StateEffect.reconfigure.of(extensions()) });
}

function extensions(): Extension[] {
  const mentionPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(editor: EditorView) {
        this.decorations = mentionDecorations(editor.state.doc);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = mentionDecorations(update.state.doc);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
  return [
    basicSetup,
    EditorView.lineWrapping,
    EditorView.editable.of(!props.disabled),
    placeholderExtension(props.placeholder),
    mentionPlugin,
    EditorView.atomicRanges.of(
      (editor) => editor.plugin(mentionPlugin)?.decorations ?? Decoration.none,
    ),
    Prec.high(
      EditorView.domEventHandlers({
        keydown: (event) => {
          if (handleMentionKeydown(event)) return true;
          emit("keydown", event);
          return event.defaultPrevented;
        },
        paste: (event) => {
          emit("paste", event);
          return event.defaultPrevented;
        },
      }),
    ),
    EditorView.contentAttributes.of({
      "aria-label": props.placeholder,
      placeholder: props.placeholder,
      "data-testid": "composer-input",
      "data-value": props.modelValue,
    }),
    EditorView.updateListener.of(handleUpdate),
  ];
}

function mentionDecorations(doc: Text) {
  const ranges: Array<Range<Decoration>> = [];
  for (const reference of props.references) {
    const literal = `@${reference.path}`;
    let offset = 0;
    while (offset < doc.length) {
      const found = doc.sliceString(offset).indexOf(literal);
      if (found < 0) break;
      const from = offset + found;
      const to = from + literal.length;
      ranges.push(
        Decoration.replace({
          widget: new FileReferenceWidget(reference),
        }).range(from, to),
      );
      offset = to;
    }
  }
  return Decoration.set(ranges.sort((left, right) => left.from - right.from));
}

function handleUpdate(update: ViewUpdate) {
  if (update.docChanged) {
    const text = update.state.doc.toString();
    update.view.contentDOM.dataset.value = text;
    if (!syncing) {
      emit("update:modelValue", text, props.scopeKey);
      const retained = props.references.filter((reference) => text.includes(`@${reference.path}`));
      if (retained.length !== props.references.length)
        emit("update:references", retained, props.scopeKey);
    }
  }
  if (update.docChanged || update.selectionSet) updateTokenQuery(update.view);
}

function updateTokenQuery(editor: EditorView) {
  if (props.disabled || props.projectId === null || editor.state.selection.ranges.length !== 1) {
    dismissMenus();
    return;
  }
  const cursor = editor.state.selection.main.head;
  const line = editor.state.doc.lineAt(cursor);
  const before = editor.state.doc.sliceString(line.from, cursor);
  const fileMatch = /(?:^|\s)@([^\s@]*)$/u.exec(before);
  if (fileMatch) {
    dismissSkillMenu();
    query.value = fileMatch[1] ?? "";
    queryFrom.value = cursor - query.value.length - 1;
    menuOpen.value = true;
    selectedIndex.value = 0;
    scheduleSearch();
    return;
  }
  const skillMatch = /(?:^|\s)\$([^\s$]*)$/u.exec(before);
  if (skillMatch) {
    dismissMenu();
    skillQuery.value = skillMatch[1] ?? "";
    skillQueryFrom.value = cursor - skillQuery.value.length - 1;
    skillMenuOpen.value = true;
    selectedSkillIndex.value = 0;
    void loadSkills();
    return;
  }
  dismissMenus();
}

async function loadSkills() {
  if (props.hostId === null || props.projectId === null) return;
  const scope = `${props.hostId}:${props.projectId}`;
  if (loadedSkillsScope.value === scope) return;
  skillsLoading.value = true;
  skillsError.value = null;
  try {
    const response = await realtime.request(
      (requestId) => ({
        type: "skill.list",
        requestId,
        hostId: props.hostId!,
        projectId: props.projectId!,
      }),
      expectSkillListResults,
    );
    if (!skillMenuOpen.value || scope !== `${props.hostId}:${props.projectId}`) return;
    allSkills.value = response.skills;
    loadedSkillsScope.value = scope;
  } catch (error) {
    skillsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    skillsLoading.value = false;
  }
}

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchGeneration += 1;
  searchTimer = setTimeout(() => void search(), 100);
}

async function search() {
  if (!menuOpen.value || props.hostId === null || props.projectId === null) return;
  const hostId = props.hostId;
  const projectId = props.projectId;
  const generation = searchGeneration;
  loading.value = true;
  searchError.value = null;
  try {
    const response = await realtime.request(
      (requestId) => ({
        type: "file.search",
        requestId,
        hostId,
        projectId,
        query: query.value,
        cancellationToken,
      }),
      expectProjectFileSearchResults,
    );
    if (generation !== searchGeneration || !menuOpen.value) return;
    files.value = response.result.files;
    selectedIndex.value = 0;
  } catch (error) {
    if (generation !== searchGeneration) return;
    files.value = [];
    searchError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (generation === searchGeneration) {
      loading.value = false;
    }
  }
}

function moveSelection(delta: number) {
  if (!menuOpen.value) return false;
  if (files.value.length === 0) return true;
  selectedIndex.value = (selectedIndex.value + delta + files.value.length) % files.value.length;
  return true;
}

function selectCurrent() {
  if (!menuOpen.value) return false;
  if (files.value.length === 0) return true;
  selectFile(files.value[selectedIndex.value]!);
  return true;
}

function handleMentionKeydown(event: KeyboardEvent) {
  if (event.isComposing) return false;
  if (skillMenuOpen.value) {
    const handlers: Partial<Record<string, () => boolean>> = {
      ArrowDown: () => moveSkillSelection(1),
      ArrowUp: () => moveSkillSelection(-1),
      Enter: selectCurrentSkill,
      Escape: dismissSkillMenu,
    };
    return handlers[event.key]?.() ?? false;
  }
  if (!menuOpen.value) return false;
  const handlers: Partial<Record<string, () => boolean>> = {
    ArrowDown: () => moveSelection(1),
    ArrowUp: () => moveSelection(-1),
    Enter: selectCurrent,
    Escape: dismissMenu,
  };
  return handlers[event.key]?.() ?? false;
}

function moveSkillSelection(delta: number) {
  if (filteredSkills.value.length === 0) return true;
  selectedSkillIndex.value =
    (selectedSkillIndex.value + delta + filteredSkills.value.length) % filteredSkills.value.length;
  return true;
}

function selectCurrentSkill() {
  const skill = filteredSkills.value[selectedSkillIndex.value];
  if (skill) selectSkill(skill);
  return true;
}

function selectSkill(skill: GatewaySkill) {
  const editor = view.value;
  if (!editor) return;
  const cursor = editor.state.selection.main.head;
  editor.dispatch({
    changes: { from: skillQueryFrom.value, to: cursor, insert: `$${skill.name} ` },
    selection: { anchor: skillQueryFrom.value + skill.name.length + 2 },
  });
  dismissSkillMenu();
  editor.focus();
}

function selectFile(file: FileReference) {
  const editor = view.value;
  if (!editor) return;
  const existing = props.references.find((reference) => reference.path === file.path);
  if (!existing && props.references.length >= MAX_REFERENCES) {
    emit("limit", props.limitMessage);
    return;
  }
  const cursor = editor.state.selection.main.head;
  editor.dispatch({
    changes: { from: queryFrom.value, to: cursor, insert: `@${file.path} ` },
    selection: { anchor: queryFrom.value + file.path.length + 2 },
  });
  if (!existing) {
    emit(
      "update:references",
      [
        ...props.references,
        { ...file, id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${file.path}` },
      ],
      props.scopeKey,
    );
  }
  dismissMenu();
  editor.focus();
}

function dismissMenu() {
  if (!menuOpen.value) return false;
  menuOpen.value = false;
  files.value = [];
  searchError.value = null;
  searchGeneration += 1;
  loading.value = false;
  return true;
}

function dismissSkillMenu() {
  if (!skillMenuOpen.value) return false;
  skillMenuOpen.value = false;
  skillsError.value = null;
  skillsLoading.value = false;
  return true;
}

function dismissMenus() {
  return dismissMenu() || dismissSkillMenu();
}

function insertTrigger(trigger: "@" | "$" | "/") {
  const editor = view.value;
  if (!editor || props.disabled) return;
  const selection = editor.state.selection.main;
  const before = editor.state.doc.sliceString(0, selection.from);
  const prefix = before !== "" && !/\s$/u.test(before) ? " " : "";
  const insert = `${prefix}${trigger}`;
  editor.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + insert.length },
  });
  editor.focus();
}

function removeReference(path: string) {
  const editor = view.value;
  if (!editor) return;
  const literal = `@${path}`;
  const text = editor.state.doc.toString();
  const changes = [];
  let offset = 0;
  while (offset < text.length) {
    const from = text.indexOf(literal, offset);
    if (from < 0) break;
    const to = from + literal.length + (text[from + literal.length] === " " ? 1 : 0);
    changes.push({ from, to });
    offset = to;
  }
  if (changes.length === 0) return;
  editor.dispatch({ changes });
  editor.focus();
}

defineExpose({ insertTrigger, removeReference });
</script>

<template>
  <ComposerFileMentionMenu
    :open="menuOpen"
    :files="files"
    :selected-index="selectedIndex"
    :loading="loading"
    :query="query"
    :error="searchError"
    @hover="selectedIndex = $event"
    @select="selectFile"
  />
  <ComposerSkillMenu
    :open="skillMenuOpen"
    :skills="filteredSkills"
    :selected-index="selectedSkillIndex"
    :loading="skillsLoading"
    :query="skillQuery"
    :error="skillsError"
    @hover="selectedSkillIndex = $event"
    @select="selectSkill"
  />
  <div ref="container" data-testid="composer-editor" class="composer-editor" />
</template>

<style>
.composer-editor .cm-editor {
  max-height: min(28dvh, 10rem);
  min-height: 3.25rem;
  background: transparent;
}
.composer-editor .cm-scroller {
  overflow: auto;
  font-family: inherit;
}
.composer-editor .cm-content {
  min-height: 3.25rem;
  padding: 0.5rem 0.25rem;
  font-size: 1rem;
  line-height: 1.5rem;
  caret-color: var(--ink);
}
.composer-editor .cm-focused {
  outline: none;
}
.composer-editor .cm-gutters {
  display: none;
}
.composer-editor .cm-activeLine,
.composer-editor .cm-activeLineGutter {
  background: transparent;
}
.composer-editor .cm-file-reference {
  display: inline-flex;
  max-width: min(100%, 28rem);
  align-items: center;
  gap: 0.25rem;
  overflow: hidden;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--primary) 13%, transparent);
  padding: 0.0625rem 0.25rem 0.0625rem 0.375rem;
  color: var(--primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
  vertical-align: baseline;
  white-space: nowrap;
}
@media (min-width: 48rem) {
  .composer-editor .cm-editor {
    max-height: min(24vh, 12rem);
    min-height: clamp(3.75rem, 10vh, 6rem);
  }
  .composer-editor .cm-content {
    min-height: clamp(3.75rem, 10vh, 6rem);
    line-height: 1.75rem;
  }
}
</style>
