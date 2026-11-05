import { computed, ref } from 'vue'
import type { CanvasDocument } from '@/types/canvas'

const MAX_HISTORY = 50

type Snapshot = Pick<CanvasDocument, 'nodes' | 'connections'>

// Undo/redo over nodes and connections only; viewport changes are not history steps.
export function useCanvasHistory(getDocument: () => CanvasDocument, applySnapshot: (snapshot: Snapshot) => void) {
  const past = ref<string[]>([])
  const future = ref<string[]>([])
  let current = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function serialize() {
    const document = getDocument()
    return JSON.stringify({ nodes: document.nodes, connections: document.connections })
  }

  function reset() {
    if (timer) clearTimeout(timer)
    timer = null
    past.value = []
    future.value = []
    current = serialize()
  }

  // Coalesce rapid edits (dragging, typing) into a single step.
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(commit, 350)
  }

  function commit() {
    if (timer) clearTimeout(timer)
    timer = null
    const next = serialize()
    if (next === current) return
    past.value = [...past.value, current].slice(-MAX_HISTORY)
    future.value = []
    current = next
  }

  function undo() {
    commit()
    const previous = past.value[past.value.length - 1]
    if (previous === undefined) return
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, current]
    current = previous
    applySnapshot(JSON.parse(previous) as Snapshot)
  }

  function redo() {
    commit()
    const next = future.value[future.value.length - 1]
    if (next === undefined) return
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, current].slice(-MAX_HISTORY)
    current = next
    applySnapshot(JSON.parse(next) as Snapshot)
  }

  return { canUndo, canRedo, reset, schedule, commit, undo, redo }
}
