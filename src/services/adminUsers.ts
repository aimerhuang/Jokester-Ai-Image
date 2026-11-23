import { http, noAuthRefreshReplayConfig } from "./http";
import type { PageResult } from "@/types/api";

export interface UserProfile {
  id: number;
  userName: string;
  nickName: string | null;
  avatarUrl: string | null;
  email: string | null;
  status: 0 | 1;
  isSuperAdmin: boolean;
  membership: { tierCode: string; expiresAt: string } | null;
  createdAt: string;
  lastLoginTime: string | null;
}
export interface UserRow extends UserProfile {
  pointBalance: number;
}
export interface UserDetail extends UserProfile {
  phone: string | null;
  signature: string | null;
  remark: string | null;
  lastLoginIp: string | null;
  points: {
    availablePoints: number;
    permanentPoints: number;
    expiringPoints: number;
    nextExpiringPoints: number;
    nextExpireAt: string | null;
  };
}
export interface PointSummary {
  earnedPoints: number;
  imageSpentPoints: number;
  expiredPoints: number;
  clawedBackPoints: number;
  imageTaskCount: number;
  bySource: { source: string; count: number; totalPoints: number }[];
}
export interface PointEntry {
  id: number;
  createdAt: string;
  source: string;
  changePoints: number;
  balanceAfter: number;
  remark: string | null;
}
export interface StatusAudit {
  id: number;
  createdAt: string;
  action: "enable" | "disable";
  reason: string | null;
  operatorUserName: string | null;
  operatorUserId: number;
}
export interface UserQuery {
  keyword?: string;
  status?: string;
  isSuperAdmin?: string;
  sortBy: string;
  sortOrder: string;
  pageIndex: number;
  pageSize: number;
}
export interface PointRange {
  from?: string;
  to?: string;
}
export interface PointQuery extends PointRange {
  pageIndex: number;
  source: string[];
  direction?: string;
}
const root = "/admin/users";
export const listUsers = (params: UserQuery, signal: AbortSignal) =>
  http.get<unknown, PageResult<UserRow>>(root, { params, signal });
export const getUser = (id: string, signal: AbortSignal) =>
  http.get<unknown, UserDetail>(`${root}/${id}`, { signal });
export const getSummary = (
  id: string,
  params: PointRange,
  signal: AbortSignal,
) =>
  http.get<unknown, PointSummary>(`${root}/${id}/point-summary`, {
    params,
    signal,
  });
export const getEntries = (
  id: string,
  params: PointQuery,
  signal: AbortSignal,
) =>
  http.get<unknown, PageResult<PointEntry>>(`${root}/${id}/point-details`, {
    params,
    signal,
    paramsSerializer: { indexes: null },
  });
export const getAudits = (id: string, pageIndex: number, signal: AbortSignal) =>
  http.get<unknown, PageResult<StatusAudit>>(`${root}/${id}/status-audits`, {
    params: { pageIndex },
    signal,
  });
export const setStatus = (id: number, status: number, reason: string) =>
  http.put<unknown, { id: number; status: 0 | 1 }>(
    `${root}/${id}/status`,
    { status, reason },
    noAuthRefreshReplayConfig,
  );
