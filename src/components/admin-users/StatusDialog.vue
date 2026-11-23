<script setup lang="ts">
import { computed, ref } from "vue";
import { useAppStore } from "@/stores/app";
import { setStatus, type UserProfile } from "@/services/adminUsers";
import type { ApiError } from "@/types/api";
const props = defineProps<{ user: UserProfile }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useAppStore();
const reason = ref("");
const busy = ref(false);
const error = ref("");
const disabling = computed(() => props.user.status === 1);
const title = computed(() =>
  app.t(disabling.value ? "users.disable" : "users.enable"),
);
async function submit() {
  if (busy.value || (disabling.value && !reason.value.trim())) return;
  busy.value = true;
  error.value = "";
  try {
    await setStatus(
      props.user.id,
      disabling.value ? 0 : 1,
      reason.value.trim(),
    );
    emit("saved");
    emit("close");
  } catch (e) {
    error.value = (e as ApiError).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <el-dialog
    :model-value="true"
    :title="title"
    width="min(460px, 94vw)"
    :show-close="!busy"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    @close="emit('close')"
  >
    <p>
      <strong>{{ user.userName }}</strong> · {{ user.email || "—" }}
    </p>
    <p v-if="disabling">{{ app.t("users.consequence") }}</p>
    <label
      >{{ app.t(disabling ? "users.requiredReason" : "users.optionalReason") }}
      <el-input
        v-model="reason"
        type="textarea"
        maxlength="200"
        :rows="3"
        show-word-limit
        :disabled="busy"
      />
    </label>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <el-button :disabled="busy" @click="emit('close')">{{
        app.t("common.cancel")
      }}</el-button>
      <el-button
        :type="disabling ? 'danger' : 'primary'"
        :loading="busy"
        :disabled="disabling && !reason.trim()"
        @click="submit"
        >{{ app.t("common.confirm") }}</el-button
      >
    </template>
  </el-dialog>
</template>
