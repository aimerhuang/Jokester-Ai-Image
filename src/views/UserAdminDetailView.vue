<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  getAudits,
  getEntries,
  getSummary,
  getUser,
  type PointRange,
  type UserDetail,
} from "@/services/adminUsers";
import { useAuthStore } from "@/stores/auth";
import { SOURCE_LABEL_KEYS } from "@/utils/pointSources";
import { useAdminRead } from "@/components/admin-users/useAdminRead";
import { useUserPresentation } from "@/components/admin-users/presentation";
import StatusDialog from "@/components/admin-users/StatusDialog.vue";
const route = useRoute();
const auth = useAuthStore();
const id = computed(() => String(route.params.id));
const { app, t, date, number, signed, source } = useUserPresentation();
const period = ref("month");
const start = ref("");
const end = ref("");
const sources = ref<string[]>([]);
const direction = ref("");
const ledgerPage = ref(1);
const auditPage = ref(1);
const target = ref<UserDetail>();
const settledId = ref("");
const range = computed<PointRange | null>(() => {
  if (period.value === "all") return {};
  if (period.value === "custom") {
    if (!start.value || !end.value || start.value > end.value) return null;
    const first = new Date(`${start.value}T00:00:00`);
    const after = new Date(`${end.value}T00:00:00`);
    after.setDate(after.getDate() + 1);
    return { from: first.toISOString(), to: after.toISOString() };
  }
  const first = new Date();
  first.setHours(0, 0, 0, 0);
  first.setDate(first.getDate() - (period.value === "week" ? 6 : 29));
  return { from: first.toISOString() };
});
watch(
  id,
  () => {
    target.value = undefined;
    ledgerPage.value = auditPage.value = 1;
    sources.value = [];
    direction.value = "";
    settledId.value = "";
  },
  { flush: "sync" },
);
watch(
  [range, sources, direction],
  () => {
    ledgerPage.value = 1;
  },
  { flush: "sync" },
);
const {
  data: user,
  error: userError,
  loading: userLoading,
  reload: reloadUser,
} = useAdminRead(id, async (key, signal) => {
  // Detail settles expired points. Start the first ledger read after that transaction has finished.
  try {
    return await getUser(key, signal);
  } finally {
    if (!signal.aborted) settledId.value = key;
  }
});
const scope = computed(() =>
  settledId.value === id.value && range.value && userError.value?.status !== 404
    ? { id: id.value, range: range.value }
    : null,
);
const {
  data: summary,
  error: summaryError,
  reload: reloadSummary,
} = useAdminRead(scope, (q, signal) => getSummary(q.id, q.range, signal));
const entryQuery = computed(() =>
  scope.value
    ? {
        ...scope.value,
        pageIndex: ledgerPage.value,
        source: sources.value,
        direction: direction.value || undefined,
      }
    : null,
);
const {
  data: entries,
  error: entriesError,
  reload: reloadEntries,
} = useAdminRead(entryQuery, (q, signal) =>
  getEntries(
    q.id,
    {
      ...q.range,
      pageIndex: q.pageIndex,
      source: q.source,
      direction: q.direction,
    },
    signal,
  ),
);
const {
  data: audits,
  error: auditsError,
  reload: reloadAudits,
} = useAdminRead(
  computed(() => ({ id: id.value, page: auditPage.value })),
  (q, signal) => getAudits(q.id, q.page, signal),
);
const missing = computed(() =>
  [userError, summaryError, entriesError, auditsError].some(
    (state) => state.value?.status === 404,
  ),
);
const sourceOptions = computed(() => [
  ...new Set([
    ...Object.keys(SOURCE_LABEL_KEYS),
    ...(summary.value?.bySource.map((x) => x.source) || []),
    ...sources.value,
  ]),
]);
const summaryKeys = [
  "earnedPoints",
  "imageSpentPoints",
  "expiredPoints",
  "clawedBackPoints",
  "imageTaskCount",
] as const;
const pointKeys = [
  "availablePoints",
  "permanentPoints",
  "expiringPoints",
] as const;
function saved() {
  reloadUser();
  auditPage.value = 1;
  reloadAudits();
}
</script>
<template>
  <section class="ua-detail">
    <router-link
      class="ua-back"
      :to="{ name: 'admin-users', query: route.query }"
      >← {{ t("back") }}</router-link
    >
    <article v-if="missing" class="page-card ua-panel">
      <h2>{{ t("missing") }}</h2>
    </article>
    <template v-else>
      <article class="page-card ua-panel">
        <p v-if="userLoading" role="status">{{ app.t("common.loading") }}</p>
        <p v-else-if="userError" role="alert">
          {{ userError.message }}
          <el-button @click="reloadUser">{{ app.t("common.retry") }}</el-button>
        </p>
        <template v-else-if="user">
          <div class="ua-profile">
            <el-avatar :src="user.avatarUrl || undefined" :size="56">{{
              user.userName.slice(0, 1)
            }}</el-avatar>
            <div>
              <h2>{{ user.nickName || user.userName }}</h2>
              <p>{{ user.userName }} · ID {{ user.id }}</p>
            </div>
            <div class="ua-badges">
              <el-tag :type="user.status ? 'success' : 'info'">{{
                t(user.status ? "enabled" : "disabled")
              }}</el-tag>
              <el-tag v-if="user.isSuperAdmin">{{ t("admin") }}</el-tag>
              <el-button
                v-if="
                  !user.status ||
                  (!user.isSuperAdmin && user.id !== auth.user?.id)
                "
                @click="target = user"
                >{{ t(user.status ? "disable" : "enable") }}</el-button
              >
            </div>
          </div>
          <dl class="ua-facts">
            <div
              v-for="[key, value] in [
                ['email', user.email],
                ['phone', user.phone],
                [
                  'vip',
                  user.membership && 'VIP · ' + date(user.membership.expiresAt),
                ],
                ['createdAt', date(user.createdAt)],
                ['lastLoginTime', date(user.lastLoginTime)],
                ['ip', user.lastLoginIp],
                ['remark', user.remark],
              ]"
              :key="key!"
            >
              <dt>{{ t(key!) }}</dt>
              <dd>{{ value || "—" }}</dd>
            </div>
          </dl>
        </template>
      </article>
      <section v-if="user" :aria-label="t('balance')" class="ua-cards">
        <div v-for="key in pointKeys" :key="key" class="page-card ua-stat">
          <span>{{ t(key) }}</span
          ><strong>{{ number(user.points[key]) }}</strong>
        </div>
        <div class="page-card ua-stat">
          <span>{{ t("nextExpiry") }}</span
          ><strong>{{
            user.points.nextExpireAt
              ? number(user.points.nextExpiringPoints)
              : "—"
          }}</strong
          ><small v-if="user.points.nextExpireAt">{{
            date(user.points.nextExpireAt)
          }}</small>
        </div>
      </section>
      <article class="page-card ua-panel">
        <div class="ua-section-head ua-toolbar">
          <h2>{{ t("usage") }}</h2>
          <select v-model="period" :aria-label="t('range')">
            <option
              v-for="key in ['week', 'month', 'all', 'custom']"
              :key="key"
              :value="key"
            >
              {{ t(key) }}
            </option>
          </select>
        </div>
        <div v-if="period === 'custom'" class="ua-toolbar">
          <label>{{ t("from") }} <input v-model="start" type="date" /></label
          ><label
            >{{ t("to") }} <input v-model="end" type="date" :min="start"
          /></label>
        </div>
        <p v-if="!range">{{ t("datesHint") }}</p>
        <p v-else-if="summaryError" role="alert">
          {{ summaryError.message }}
          <el-button @click="reloadSummary">{{
            app.t("common.retry")
          }}</el-button>
        </p>
        <template v-else-if="summary">
          <div class="ua-cards ua-summary">
            <div v-for="key in summaryKeys" :key="key" class="ua-stat">
              <span>{{ t(key) }}</span
              ><strong>{{ number(summary[key]) }}</strong>
            </div>
          </div>
          <h3>{{ t("bySource") }}</h3>
          <table v-if="summary.bySource.length">
            <thead>
              <tr>
                <th>{{ t("source") }}</th>
                <th>{{ t("count") }}</th>
                <th>{{ t("points") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summary.bySource" :key="row.source">
                <td>{{ source(row.source) }}</td>
                <td>{{ number(row.count) }}</td>
                <td>{{ signed(row.totalPoints) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>{{ t("emptyLedger") }}</p>
        </template>
        <p v-else role="status">{{ app.t("common.loading") }}</p>
      </article>
      <article class="page-card ua-panel">
        <h2>{{ t("ledger") }}</h2>
        <div class="ua-toolbar">
          <el-select
            v-model="sources"
            multiple
            clearable
            collapse-tags
            :placeholder="t('source')"
            :aria-label="t('source')"
            style="width: min(320px, 100%)"
            ><el-option
              v-for="code in sourceOptions"
              :key="code"
              :value="code"
              :label="source(code)"
          /></el-select>
          <label
            >{{ t("direction") }}
            <select v-model="direction">
              <option value="">{{ t("all") }}</option>
              <option value="in">{{ t("in") }}</option>
              <option value="out">{{ t("out") }}</option>
            </select></label
          >
        </div>
        <p v-if="!range">{{ t("datesHint") }}</p>
        <p v-else-if="entriesError" role="alert">
          {{ entriesError.message }}
          <el-button @click="reloadEntries">{{
            app.t("common.retry")
          }}</el-button>
        </p>
        <template v-else-if="entries"
          ><div v-if="entries.items.length" class="ua-scroll">
            <table>
              <thead>
                <tr>
                  <th
                    v-for="key in [
                      'time',
                      'source',
                      'change',
                      'after',
                      'remark',
                    ]"
                    :key="key"
                  >
                    {{ t(key) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in entries.items" :key="row.id">
                  <td>{{ date(row.createdAt) }}</td>
                  <td>{{ source(row.source) }}</td>
                  <td
                    :class="{
                      positive: row.changePoints > 0,
                      negative: row.changePoints < 0,
                    }"
                  >
                    {{ signed(row.changePoints) }}
                  </td>
                  <td>{{ number(row.balanceAfter) }}</td>
                  <td>{{ row.remark || "—" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else>
            {{ t(sources.length || direction ? "noMatches" : "emptyLedger") }}
          </p>
          <el-pagination
            v-if="entries.total > 20"
            v-model:current-page="ledgerPage"
            :page-size="20"
            :total="entries.total"
            layout="prev, pager, next"
          />
        </template>
        <p v-else role="status">{{ app.t("common.loading") }}</p>
      </article>
      <article class="page-card ua-panel">
        <h2>{{ t("audits") }}</h2>
        <p v-if="auditsError" role="alert">
          {{ auditsError.message }}
          <el-button @click="reloadAudits">{{
            app.t("common.retry")
          }}</el-button>
        </p>
        <template v-else-if="audits"
          ><div v-if="audits.items.length" class="ua-scroll">
            <table>
              <thead>
                <tr>
                  <th
                    v-for="key in ['time', 'action', 'reason', 'operator']"
                    :key="key"
                  >
                    {{ t(key) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in audits.items" :key="row.id">
                  <td>{{ date(row.createdAt) }}</td>
                  <td>{{ t(row.action) }}</td>
                  <td>{{ row.reason || "—" }}</td>
                  <td>{{ row.operatorUserName || row.operatorUserId }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else>{{ t("emptyAudits") }}</p>
          <el-pagination
            v-if="audits.total > 20"
            v-model:current-page="auditPage"
            :page-size="20"
            :total="audits.total"
            layout="prev, pager, next"
          />
        </template>
        <p v-else role="status">{{ app.t("common.loading") }}</p>
      </article>
    </template>
    <StatusDialog
      v-if="target"
      :user="target"
      @close="target = undefined"
      @saved="saved"
    />
  </section>
</template>
<style src="@/components/admin-users/adminUsers.css"></style>
