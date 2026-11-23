<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { listUsers, type UserQuery, type UserRow } from "@/services/adminUsers";
import { useAuthStore } from "@/stores/auth";
import { useAdminRead } from "@/components/admin-users/useAdminRead";
import { useUserPresentation } from "@/components/admin-users/presentation";
import StatusDialog from "@/components/admin-users/StatusDialog.vue";
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const { app, t, date, number } = useUserPresentation();
const sortKeys = ["createdAt", "lastLoginTime", "pointBalance"];
const query = computed<UserQuery>(() => {
  const q = route.query;
  return {
    keyword: String(q.keyword || "").slice(0, 100) || undefined,
    status: ["1", "0"].includes(String(q.status))
      ? String(q.status)
      : undefined,
    isSuperAdmin: ["true", "false"].includes(String(q.isSuperAdmin))
      ? String(q.isSuperAdmin)
      : undefined,
    pageIndex: Math.max(
      1,
      Math.min(21474836, parseInt(String(q.pageIndex)) || 1),
    ),
    pageSize: [20, 50, 100].includes(Number(q.pageSize))
      ? Number(q.pageSize)
      : 20,
    sortBy: sortKeys.includes(String(q.sortBy))
      ? String(q.sortBy)
      : "createdAt",
    sortOrder: q.sortOrder === "asc" ? "asc" : "desc",
  };
});
const { data, loading, error, reload } = useAdminRead(query, listUsers);
const target = ref<UserRow>();
const keyword = ref("");
let timer: ReturnType<typeof setTimeout>;
watch(
  () => query.value.keyword,
  (value) => {
    clearTimeout(timer);
    keyword.value = value || "";
  },
  { immediate: true },
);
onScopeDispose(() => clearTimeout(timer));
function update(key: keyof UserQuery, value: string | number) {
  clearTimeout(timer);
  void router.replace({
    name: "admin-users",
    query: {
      ...route.query,
      keyword: keyword.value.trim() || undefined,
      pageIndex: undefined,
      [key]: value || undefined,
    },
  });
}
function search() {
  clearTimeout(timer);
  timer = setTimeout(() => update("keyword", keyword.value.trim()), 300);
}
function select(key: keyof UserQuery, event: Event) {
  update(key, (event.target as HTMLSelectElement).value);
}
function open(id: number) {
  void router.push({ name: "admin-user", params: { id }, query: route.query });
}
async function copy(email: string) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage.success(t("copied"));
  } catch {
    ElMessage.error(t("copyFailed"));
  }
}
</script>
<template>
  <section class="page-card ua-panel ua" :aria-label="t('title')">
    <div class="ua-toolbar">
      <el-input
        v-model="keyword"
        type="search"
        :aria-label="t('search')"
        :placeholder="t('search')"
        maxlength="100"
        class="ua-search"
        clearable
        @input="search"
      />
      <select
        :aria-label="t('status')"
        :value="query.status || ''"
        @change="select('status', $event)"
      >
        <option value="">{{ t("allStatus") }}</option>
        <option value="1">{{ t("enabled") }}</option>
        <option value="0">{{ t("disabled") }}</option>
      </select>
      <select
        :aria-label="t('type')"
        :value="query.isSuperAdmin || ''"
        @change="select('isSuperAdmin', $event)"
      >
        <option value="">{{ t("allTypes") }}</option>
        <option value="false">{{ t("regular") }}</option>
        <option value="true">{{ t("admin") }}</option>
      </select>
      <select
        :aria-label="t('sort')"
        :value="query.sortBy"
        @change="select('sortBy', $event)"
      >
        <option v-for="key in sortKeys" :key="key" :value="key">
          {{ t(key) }}
        </option>
      </select>
      <select
        :aria-label="t('order')"
        :value="query.sortOrder"
        @change="select('sortOrder', $event)"
      >
        <option value="desc">{{ t("desc") }}</option>
        <option value="asc">{{ t("asc") }}</option>
      </select>
    </div>
    <p v-if="loading" role="status">{{ app.t("common.loading") }}</p>
    <p v-else-if="error" role="alert">
      {{ error.message }}
      <el-button @click="reload">{{ app.t("common.retry") }}</el-button>
    </p>
    <template v-else-if="data">
      <h2>
        {{ t("total") }} <span>{{ number(data.total) }}</span>
      </h2>
      <div class="ua-scroll">
        <table>
          <thead>
            <tr>
              <th
                v-for="key in [
                  'user',
                  'ID',
                  'email',
                  'pointBalance',
                  'vip',
                  'flag',
                  'status',
                  'createdAt',
                  'lastLoginTime',
                  'actions',
                ]"
                :key="key"
                :class="{ num: key === 'pointBalance' }"
              >
                {{ key === "ID" ? key : t(key) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.items"
              :key="row.id"
              tabindex="0"
              @dblclick="open(row.id)"
              @keydown.enter.self.prevent="open(row.id)"
            >
              <td>
                <div class="ua-identity">
                  <el-avatar :src="row.avatarUrl || undefined" :size="32">{{
                    row.userName.slice(0, 1)
                  }}</el-avatar>
                  <div>
                    <strong>{{ row.nickName || row.userName }}</strong
                    ><small>{{ row.userName }}</small>
                  </div>
                </div>
              </td>
              <td>{{ row.id }}</td>
              <td>
                {{ row.email || "—" }}
                <el-button
                  v-if="row.email"
                  link
                  @dblclick.stop
                  @click.stop="copy(row.email)"
                  >{{ t("copy") }}</el-button
                >
              </td>
              <td class="num">{{ number(row.pointBalance) }}</td>
              <td>
                <template v-if="row.membership"
                  >VIP
                  <small>{{ date(row.membership.expiresAt) }}</small></template
                >
              </td>
              <td>
                <el-tag v-if="row.isSuperAdmin">{{ t("admin") }}</el-tag>
              </td>
              <td>
                <el-tag :type="row.status ? 'success' : 'info'">{{
                  t(row.status ? "enabled" : "disabled")
                }}</el-tag>
              </td>
              <td>{{ date(row.createdAt) }}</td>
              <td>{{ date(row.lastLoginTime) }}</td>
              <td @dblclick.stop>
                <el-button link @click.stop="open(row.id)">{{
                  t("detail")
                }}</el-button
                ><el-button
                  v-if="
                    !row.status ||
                    (!row.isSuperAdmin && row.id !== auth.user?.id)
                  "
                  link
                  @click.stop="target = row"
                  >{{ t(row.status ? "disable" : "enable") }}</el-button
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!data.items.length">{{ t("empty") }}</p>
      <el-pagination
        layout="sizes, prev, pager, next"
        :total="data.total"
        :page-sizes="[20, 50, 100]"
        :current-page="query.pageIndex"
        :page-size="query.pageSize"
        @update:current-page="update('pageIndex', $event)"
        @update:page-size="update('pageSize', $event)"
      />
    </template>
    <StatusDialog
      v-if="target"
      :user="target"
      @close="target = undefined"
      @saved="reload"
    />
  </section>
</template>
<style src="@/components/admin-users/adminUsers.css"></style>
