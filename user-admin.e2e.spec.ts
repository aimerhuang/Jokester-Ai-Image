import { expect, test, type Page } from "playwright/test";

async function setup(page: Page, isAdmin = true) {
  const calls: URL[] = [];
  const writes: unknown[] = [];
  let status = 1;
  let failSummary = false;
  const alice = {
    id: 2,
    userName: "alice",
    nickName: "Alice",
    email: "alice@example.test",
    pointBalance: 100,
    createdAt: "2026-11-01T00:00:00Z",
    lastLoginTime: null,
    isSuperAdmin: false,
    membership: null,
  };
  await page.addInitScript(() => {
    localStorage.setItem("accessToken", "user-admin-test");
    localStorage.setItem("locale", "zh-CN");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const ok = (data: unknown) =>
      route.fulfill({ json: { code: 0, data, message: "success" } });
    if (url.pathname.startsWith("/api/admin/users")) calls.push(url);
    if (url.pathname === "/api/auth/profile")
      return ok({
        id: 1,
        userName: "operator",
        isSuperAdmin: isAdmin,
        pointBalance: 0,
      });
    if (url.pathname === "/api/points/balance")
      return ok({ availablePoints: 0 });
    const paged = (items: unknown[], total = items.length) => ({
      items,
      total,
      pageIndex: Number(url.searchParams.get("pageIndex") || 1),
      pageSize: 20,
    });
    switch (url.pathname) {
      case "/api/admin/users":
        return ok(
          paged(
            [
              { ...alice, status },
              ...[1, 3].map((id) => ({
                ...alice,
                id,
                userName: `admin${id}`,
                nickName: `Admin${id}`,
                email: null,
                isSuperAdmin: true,
                status: 1,
              })),
            ],
            42,
          ),
        );
      case "/api/admin/users/2":
        return ok({
          ...alice,
          status,
          points: {
            availablePoints: 100,
            permanentPoints: 100,
            expiringPoints: 0,
            nextExpiringPoints: 0,
            nextExpireAt: null,
          },
        });
      case "/api/admin/users/2/status": {
        const body = route.request().postDataJSON();
        writes.push(body);
        status = body.status;
        return ok({ id: 2, status });
      }
      case "/api/admin/users/2/status-audits":
        return ok(paged([]));
      case "/api/admin/users/2/point-summary":
        if (failSummary) {
          failSummary = false;
          return route.fulfill({
            status: 503,
            json: { code: "SERVICE_UNAVAILABLE", message: "summary offline" },
          });
        }
        return ok({
          earnedPoints: 100,
          imageSpentPoints: 25,
          expiredPoints: 0,
          clawedBackPoints: 0,
          imageTaskCount: 1,
          bySource: [{ source: "new_kind", totalPoints: 5, count: 1 }],
        });
      case "/api/admin/users/2/point-details":
        return ok(paged([]));
    }
    return route.fulfill({
      status: 404,
      json: { code: "RESOURCE_NOT_FOUND", message: "absent" },
    });
  });
  return {
    calls,
    writes,
    failNextSummary: () => {
      failSummary = true;
    },
  };
}

test("普通用户无法浏览用户管理", async ({ page }) => {
  const mock = await setup(page, false);
  for (const path of ["/admin/users", "/admin/users/2"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/playground$/);
    await expect(page.getByRole("link", { name: "用户管理" })).toHaveCount(0);
  }
  expect(mock.calls).toEqual([]);
});

test("行内操作和禁用保护", async ({ page }) => {
  const mock = await setup(page);
  await page.goto("/admin/users");
  const row = page.getByRole("row").filter({ hasText: "Alice" });
  for (const user of ["Admin1", "Admin3"])
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: user })
        .getByRole("button", { name: "禁用" }),
    ).toHaveCount(0);
  await row.getByRole("button", { name: "禁用" }).dblclick();
  const dialog = page.getByRole("dialog");
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(dialog.getByRole("button", { name: "确认" })).toBeDisabled();
  await dialog.getByRole("textbox").fill("人工复核");
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(row.getByRole("button", { name: "启用" })).toBeVisible();
  expect(mock.writes).toEqual([{ status: 0, reason: "人工复核" }]);
  await row.getByRole("button", { name: "详情" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/2$/);
  await page.getByRole("button", { name: "启用", exact: true }).click();
  await dialog.getByRole("button", { name: "确认" }).click();
  await expect(
    page.getByRole("button", { name: "禁用", exact: true }),
  ).toBeVisible();
  expect(mock.writes[1]).toEqual({ status: 1, reason: "" });
});

test("保留列表条件，三种详情入口与独立重试", async ({ page }) => {
  const mock = await setup(page);
  await page.goto("/admin/users");
  await page.getByRole("searchbox").fill("alice");
  await expect(page).toHaveURL(/keyword=alice/);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page).toHaveURL(/pageIndex=2/);
  const listUrl = page.url();
  const row = page.getByRole("row").filter({ hasText: "Alice" });
  await row.dblclick({ position: { x: 20, y: 18 } });
  await expect(
    page.getByRole("cell", { name: "其他 · new_kind", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回列表" }).click();
  await expect(page).toHaveURL(listUrl);
  await row.focus();
  await row.press("Enter");
  await expect(page).toHaveURL(/\/admin\/users\/2\?/);
  await expect(page.getByText("该时间范围内没有积分变动")).toBeVisible();
  const before = mock.calls.length;
  mock.failNextSummary();
  await page.getByLabel("时间范围").selectOption("week");
  await expect(page.getByText("summary offline")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();
  await page.getByRole("button", { name: "重试" }).click();
  await expect(
    page.getByRole("cell", { name: "其他 · new_kind", exact: true }),
  ).toBeVisible();
  const changed = mock.calls.slice(before);
  const from = changed
    .find((url) => url.pathname.endsWith("point-summary"))
    ?.searchParams.get("from");
  expect(from).toBeTruthy();
  expect(
    changed
      .find((url) => url.pathname.endsWith("point-details"))
      ?.searchParams.get("from"),
  ).toBe(from);
  await page.getByLabel("时间范围").selectOption("custom");
  await page.getByLabel("起始日期").fill("2026-11-01");
  await page.getByLabel("结束日期").fill("2026-11-02");
  await expect
    .poll(() =>
      mock.calls.some(
        (url) =>
          url.pathname.endsWith("point-details") && url.searchParams.has("to"),
      ),
    )
    .toBe(true);
  await page.goto("/admin/users/999");
  await expect(page.getByRole("heading", { name: "用户不存在" })).toBeVisible();
});
