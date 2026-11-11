<template>
  <div class="prompt-editor-wrap">
    <div
      ref="root"
      class="prompt-editor"
      :class="{ empty: isEmpty, expanded }"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="placeholder"
      :aria-placeholder="placeholder"
      :placeholder="placeholder"
      :data-placeholder="placeholder"
      spellcheck="false"
      data-testid="canvas-prompt-input"
      @input="handleInput"
      @compositionstart="composing = true"
      @compositionend="handleCompositionEnd"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @drop.prevent
      @blur="closeMentionLater"
    />
    <div v-if="mentionOpen && inputs.length" class="mention-menu" role="listbox">
      <button
        v-for="(input, index) in inputs"
        :key="input.nodeId"
        type="button"
        role="option"
        :aria-selected="index === mentionIndex"
        :class="{ active: index === mentionIndex }"
        @mousedown.prevent="insertMention(index)"
      >
        <span class="reference-index">{{ index + 1 }}</span>
        {{ input.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Prompt input that renders @-referenced inputs ("图片1") as atomic tags. The stored prompt stays plain text so the
// canvas document, the backend validator and the generation request keep their existing contract; tags are derived
// from the current input labels on every render, and one Backspace/Delete removes a whole tag.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CanvasPanelInput } from '@/types/canvas'

const props = withDefaults(defineProps<{
  modelValue: string
  inputs: CanvasPanelInput[]
  placeholder: string
  maxLength?: number
  expanded?: boolean
}>(), { maxLength: 4000, expanded: false })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()

type Segment = { type: 'text'; text: string } | { type: 'chip'; label: string }

const ZWSP = '\u200B'
const SVG_NS = 'http://www.w3.org/2000/svg'

const root = ref<HTMLDivElement | null>(null)
const composing = ref(false)
const isEmpty = ref(!props.modelValue)
const mentionOpen = ref(false)
const mentionIndex = ref(0)
let current = props.modelValue || ''
let mentionCloseTimer: ReturnType<typeof setTimeout> | null = null

// Longest first so "图片12" wins over "图片1"; the digit lookahead keeps "图片1" from matching inside "图片12".
const labels = computed(() => [...new Set(props.inputs.map((input) => input.label).filter(Boolean))]
  .sort((a, b) => b.length - a.length))
const labelPattern = computed(() => labels.value.length
  ? new RegExp(`(?:${labels.value.map(escapeRegExp).join('|')})(?![0-9])`, 'g')
  : null)

onMounted(() => render(current, null))
onBeforeUnmount(() => {
  if (mentionCloseTimer) clearTimeout(mentionCloseTimer)
})

watch(() => props.modelValue, (value) => {
  const next = value || ''
  if (next === current) return
  current = next
  render(next, isFocused() ? Math.min(caretOffset() ?? next.length, next.length) : null)
})

watch(() => labels.value.join('\n'), () => {
  render(current, isFocused() ? caretOffset() : null)
})

defineExpose({ focus: () => root.value?.focus() })

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parse(value: string): Segment[] {
  const pattern = labelPattern.value
  if (!pattern) return value ? [{ type: 'text', text: value }] : []
  const segments: Segment[] = []
  let last = 0
  pattern.lastIndex = 0
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
    if (match.index > last) segments.push({ type: 'text', text: value.slice(last, match.index) })
    segments.push({ type: 'chip', label: match[0] })
    last = match.index + match[0].length
  }
  if (last < value.length) segments.push({ type: 'text', text: value.slice(last) })
  return segments
}

function isChip(node: Node | null | undefined): node is HTMLElement {
  return node instanceof HTMLElement && node.classList.contains('prompt-chip')
}

function isSentinel(node: Node | null | undefined) {
  return node instanceof HTMLElement && node.tagName === 'BR' && node.dataset.sentinel === '1'
}

function createChip(label: string) {
  const chip = document.createElement('span')
  chip.className = 'prompt-chip'
  chip.contentEditable = 'false'
  chip.dataset.label = label
  const icon = document.createElementNS(SVG_NS, 'svg')
  icon.setAttribute('viewBox', '0 0 16 16')
  icon.setAttribute('aria-hidden', 'true')
  icon.classList.add('prompt-chip-icon')
  const frame = document.createElementNS(SVG_NS, 'rect')
  Object.entries({ x: '2', y: '2.5', width: '12', height: '11', rx: '2' }).forEach(([key, value]) => frame.setAttribute(key, value))
  const sun = document.createElementNS(SVG_NS, 'circle')
  Object.entries({ cx: '6', cy: '6.5', r: '1.3' }).forEach(([key, value]) => sun.setAttribute(key, value))
  const hill = document.createElementNS(SVG_NS, 'path')
  hill.setAttribute('d', 'M2.5 12 6.5 8.5 9 10.5 11 9 13.5 11.5')
  icon.append(frame, sun, hill)
  const text = document.createElement('span')
  text.textContent = label
  chip.append(icon, text)
  return chip
}

// Rebuilds the editor DOM from the plain-text value. A zero-width space follows (or precedes, at the start) any chip that
// has no adjacent text so the caret can always be placed beside it; serialization strips it again.
function render(value: string, caret: number | null) {
  const element = root.value
  isEmpty.value = !value
  if (!element) return
  const segments = parse(value)
  const fragment = document.createDocumentFragment()
  segments.forEach((segment, index) => {
    if (segment.type === 'text') {
      fragment.append(document.createTextNode(segment.text))
      return
    }
    if (index === 0) fragment.append(document.createTextNode(ZWSP))
    fragment.append(createChip(segment.label))
    if (segments[index + 1]?.type !== 'text') fragment.append(document.createTextNode(ZWSP))
  })
  // A trailing newline only renders as an empty line when something follows it.
  if (value.endsWith('\n')) {
    const sentinel = document.createElement('br')
    sentinel.dataset.sentinel = '1'
    fragment.append(sentinel)
  }
  element.replaceChildren(fragment)
  if (caret !== null) setCaret(caret)
}

function serialize(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent || '').replaceAll(ZWSP, '')
    } else if (isChip(child)) {
      out += child.dataset.label || ''
    } else if (child instanceof HTMLElement) {
      if (child.tagName === 'BR') {
        // Browsers add a placeholder <br> at the end of an emptied line; only interior breaks are content.
        if (!isSentinel(child) && child.nextSibling) out += '\n'
      } else {
        const block = child.tagName === 'DIV' || child.tagName === 'P'
        if (block && out && !out.endsWith('\n')) out += '\n'
        out += serialize(child)
      }
    }
  })
  return out
}

// Describes the DOM in the same shape render() produces, to decide whether a re-render is needed.
function domShape(element: HTMLElement) {
  const shape: string[] = []
  let text = ''
  const flush = () => {
    if (text) shape.push(`t:${text}`)
    text = ''
  }
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += (child.textContent || '').replaceAll(ZWSP, '')
    } else if (isChip(child)) {
      flush()
      shape.push(`c:${child.dataset.label}`)
    } else if (isSentinel(child)) {
      flush()
      shape.push('s')
    } else {
      return null
    }
  }
  flush()
  return shape.join('\u0000')
}

function valueShape(value: string) {
  const shape = parse(value).map((segment) => segment.type === 'text' ? `t:${segment.text}` : `c:${segment.label}`)
  if (value.endsWith('\n')) shape.push('s')
  return shape.join('\u0000')
}

function isFocused() {
  return Boolean(root.value && document.activeElement === root.value)
}

function offsetAt(container: Node, offset: number) {
  const element = root.value
  if (!element) return 0
  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(container, offset)
  return serialize(range.cloneContents()).length
}

function selectionOffsets() {
  const element = root.value
  const selection = window.getSelection()
  if (!element || !selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null
  return { start: offsetAt(range.startContainer, range.startOffset), end: offsetAt(range.endContainer, range.endOffset) }
}

function caretOffset() {
  return selectionOffsets()?.end ?? null
}

function setCaret(offset: number) {
  const element = root.value
  const selection = window.getSelection()
  if (!element || !selection) return
  const range = document.createRange()
  let remaining = Math.max(0, offset)
  let placed = false
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const raw = child.textContent || ''
      if (raw === ZWSP) {
        if (remaining === 0) {
          range.setStart(child, 1)
          placed = true
          break
        }
        continue
      }
      if (remaining <= raw.length) {
        range.setStart(child, remaining)
        placed = true
        break
      }
      remaining -= raw.length
    } else if (isChip(child)) {
      const length = (child.dataset.label || '').length
      if (remaining === 0) {
        range.setStartBefore(child)
        placed = true
        break
      }
      if (remaining < length) {
        range.setStartAfter(child)
        placed = true
        break
      }
      remaining -= length
    }
  }
  if (!placed) {
    const sentinel = element.lastChild && isSentinel(element.lastChild) ? element.lastChild : null
    if (sentinel) range.setStartBefore(sentinel)
    else range.setStart(element, element.childNodes.length)
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function commit(value: string, caret: number | null) {
  let next = value
  let nextCaret = caret
  if (next.length > props.maxLength) {
    next = next.slice(0, props.maxLength)
    nextCaret = nextCaret === null ? null : Math.min(nextCaret, props.maxLength)
  }
  const element = root.value
  if (element && (next !== value || domShape(element) !== valueShape(next))) render(next, nextCaret)
  current = next
  isEmpty.value = !next
  if (next !== props.modelValue) emit('update:modelValue', next)
  updateMention(next, nextCaret)
}

function sync() {
  const element = root.value
  if (!element) return
  commit(serialize(element), caretOffset())
}

function handleInput(event: Event) {
  if (composing.value || (event as InputEvent).isComposing) return
  sync()
}

function handleCompositionEnd() {
  composing.value = false
  sync()
}

function replaceSelection(text: string) {
  const offsets = selectionOffsets() || { start: current.length, end: current.length }
  const value = `${current.slice(0, offsets.start)}${text}${current.slice(offsets.end)}`
  const caret = offsets.start + text.length
  render(value, caret)
  commit(value, caret)
}

function adjacentChip(direction: 'before' | 'after') {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed || !selection.anchorNode) return null
  const node = selection.anchorNode
  const offset = selection.anchorOffset
  const step = (item: Node | null) => (direction === 'before' ? item?.previousSibling : item?.nextSibling) || null
  let sibling: Node | null
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.textContent || ''
    const between = direction === 'before' ? raw.slice(0, offset) : raw.slice(offset)
    if (between.replaceAll(ZWSP, '')) return null
    sibling = step(node)
  } else {
    sibling = node.childNodes[direction === 'before' ? offset - 1 : offset] || null
  }
  while (sibling && sibling.nodeType === Node.TEXT_NODE && !(sibling.textContent || '').replaceAll(ZWSP, '')) sibling = step(sibling)
  return isChip(sibling) && root.value?.contains(sibling) ? sibling : null
}

function removeChip(chip: HTMLElement) {
  const start = offsetAt(chip.parentNode as Node, Array.prototype.indexOf.call(chip.parentNode?.childNodes || [], chip))
  const length = (chip.dataset.label || '').length
  const value = `${current.slice(0, start)}${current.slice(start + length)}`
  render(value, start)
  commit(value, start)
}

function handleKeydown(event: KeyboardEvent) {
  // Keep canvas shortcuts (Delete, Space, Ctrl+Z…) away from the editor.
  event.stopPropagation()
  if (composing.value || event.isComposing || event.keyCode === 229) return
  if (mentionOpen.value && props.inputs.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      mentionIndex.value = (mentionIndex.value + delta + props.inputs.length) % props.inputs.length
      return
    }
    if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey) || event.key === 'Tab') {
      event.preventDefault()
      insertMention(mentionIndex.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      mentionOpen.value = false
      return
    }
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) emit('submit')
    else replaceSelection('\n')
    return
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    const chip = adjacentChip(event.key === 'Backspace' ? 'before' : 'after')
    if (chip) {
      event.preventDefault()
      removeChip(chip)
    }
  }
}

function handlePaste(event: ClipboardEvent) {
  const data = event.clipboardData
  const text = data?.getData('text/plain') || ''
  if (text) {
    event.preventDefault()
    replaceSelection(text.replace(/\r\n?/g, '\n'))
    return
  }
  // Image-only clipboards bubble to the canvas, which uploads them as reference inputs; block any other rich paste.
  const hasImage = [...(data?.items || [])].some((item) => item.kind === 'file' && item.type.startsWith('image/'))
  if (!hasImage) event.preventDefault()
}

function updateMention(value: string, caret: number | null) {
  const open = caret !== null && caret > 0 && value.charAt(caret - 1) === '@'
  if (open && !mentionOpen.value) mentionIndex.value = 0
  mentionOpen.value = open
}

async function insertMention(index: number) {
  const label = props.inputs[index]?.label
  mentionOpen.value = false
  if (!label) return
  const caret = caretOffset() ?? current.length
  const before = current.slice(0, caret).replace(/@$/, '')
  const value = `${before}${label}${current.slice(caret)}`
  const nextCaret = before.length + label.length
  root.value?.focus()
  await nextTick()
  render(value, nextCaret)
  commit(value, nextCaret)
}

function closeMentionLater() {
  if (mentionCloseTimer) clearTimeout(mentionCloseTimer)
  mentionCloseTimer = setTimeout(() => {
    mentionOpen.value = false
  }, 150)
}
</script>

<style scoped>
.prompt-editor-wrap {
  position: relative;
}

.prompt-editor {
  position: relative;
  height: 90px;
  margin-top: 10px;
  overflow-y: auto;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  outline: none;
  cursor: text;
}

.prompt-editor.expanded {
  height: 220px;
}

.prompt-editor.empty::before {
  position: absolute;
  top: 0;
  left: 0;
  color: var(--color-text-muted);
  content: attr(data-placeholder);
  pointer-events: none;
}

.prompt-editor :deep(.prompt-chip) {
  display: inline-flex;
  height: 20px;
  align-items: center;
  gap: 3px;
  margin: 0 2px;
  padding: 0 6px 0 4px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
  border-radius: 6px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  vertical-align: 1px;
  white-space: nowrap;
  user-select: none;
  cursor: default;
}

.prompt-editor :deep(.prompt-chip-icon) {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.4;
}

.mention-menu {
  position: absolute;
  top: 34px;
  left: 0;
  z-index: 5;
  display: flex;
  min-width: 140px;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card-hover);
}

.mention-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.mention-menu button:hover,
.mention-menu button.active {
  background: var(--color-primary-soft);
}

.reference-index {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-text);
  font-size: 10px;
  font-weight: 600;
}
</style>
