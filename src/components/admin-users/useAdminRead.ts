import { onScopeDispose, ref, shallowRef, watch, type WatchSource } from "vue";
import type { ApiError } from "@/types/api";

/** A changed query immediately retires its previous response, including pending failures. */
export function useAdminRead<Q, T>(
  query: WatchSource<Q | null>,
  fetch: (query: Q, signal: AbortSignal) => Promise<T>,
) {
  const data = shallowRef<T>();
  const error = shallowRef<ApiError>();
  const loading = ref(false);
  const revision = ref(0);
  let active: AbortController | undefined;
  watch(
    [query, revision],
    async ([value]) => {
      active?.abort();
      const controller = (active = new AbortController());
      data.value = undefined;
      error.value = undefined;
      loading.value = value !== null;
      if (value === null) return;
      try {
        const result = await fetch(value, controller.signal);
        if (!controller.signal.aborted) data.value = result;
      } catch (e) {
        if (!controller.signal.aborted) error.value = e as ApiError;
      } finally {
        if (!controller.signal.aborted) loading.value = false;
      }
    },
    { immediate: true },
  );
  onScopeDispose(() => active?.abort());
  return {
    data,
    loading,
    error,
    reload: () => {
      revision.value++;
    },
  };
}
