import { expect, test } from "@playwright/test";
import type { EvalRunIndex, ViewerExport } from "@hona/openeval/view";

test("Demo opens the real saved viewer and its candidate and judge evidence", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const demo = page.getByRole("link", { name: "Demo", exact: true });
  await expect(demo).toHaveAttribute("href", "/demo/");
  expect(
    await demo.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  await demo.click();
  await expect(page).toHaveURL(/\/demo\//);
  await expect(page).toHaveTitle("OpenEval | Demo");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".history-group button")).toHaveCount(1);
  await expect(page.locator(".chart-model")).toHaveCount(6);
  await page.getByRole("tab", { name: "Eval breakdown", exact: true }).click();
  await page
    .locator(".chart-model")
    .filter({ hasText: "GPT-6 Astra" })
    .locator(".chart-row")
    .first()
    .click();
  await expect(page.locator(".session-inspector")).not.toHaveAttribute(
    "data-candidate-sessions",
    "0",
  );
  await expect(
    page.locator('[data-component="session-timeline"]'),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Judge", exact: true }).click();
  await expect(page.locator(".session-inspector")).not.toHaveAttribute(
    "data-judge-sessions",
    "0",
  );
  await expect(page.locator(".judgment-criteria article")).toHaveCount(2);
  await page
    .getByRole("button", { name: /Read response/ })
    .first()
    .click();
  await expect(
    page.locator(".judge-check-detail .checkpoint-content"),
  ).toContainText("customer_id");
  await page
    .getByRole("button", { name: "Show raw JSON", exact: true })
    .click();
  await expect(page.locator(".raw-document")).toContainText('"messages"');
  expect(
    requests.filter(
      (url) =>
        /^https?:/.test(url) && new URL(url).pathname.startsWith("/api/"),
    ),
  ).toEqual([]);
  expect(
    requests.filter(
      (url) =>
        /^https?:/.test(url) &&
        new URL(url).origin !== new URL(page.url()).origin,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("every selected repetition opens its real native recording or code judgment", async ({
  page,
  request,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Full recording coverage is viewport-independent",
  );
  test.setTimeout(180_000);
  const manifest = (await (
    await request.get("/demo/data/manifest.json")
  ).json()) as ViewerExport;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let candidates = 0,
    llmJudges = 0,
    codeJudges = 0;
  for (const [id, refs] of Object.entries(manifest.results)) {
    if (!refs.runs) continue;
    const result = (await (
      await request.get(`/demo/data/${refs.runs.path}`)
    ).json()) as EvalRunIndex;
    expect(result.runs).toHaveLength(18);
    for (const run of result.runs) {
      const query = new URLSearchParams({
        result: manifest.source.benchmarkId,
        view: "evals",
        eval: result.eval,
        run: id,
        evalRun: run.id,
      });
      await page.goto(`/demo/?${query}`);
      await expect(page.locator(".session-inspector")).not.toHaveAttribute(
        "data-candidate-sessions",
        "0",
      );
      await expect(
        page.locator('[data-component="session-timeline"]'),
      ).toBeVisible();
      await expect(page.locator(".session-inspector")).not.toContainText(
        "Could not render this recorded timeline",
      );
      candidates++;
      await page.getByRole("tab", { name: "Judge", exact: true }).click();
      if (run.judge.kind === "code") {
        await expect(page.locator(".session-inspector")).toHaveAttribute(
          "data-code-only",
          "true",
        );
        await expect(page.locator(".code-judgment")).toContainText(
          "correct_answer",
        );
        codeJudges++;
      } else {
        await expect(page.locator(".session-inspector")).not.toHaveAttribute(
          "data-judge-sessions",
          "0",
        );
        await expect(
          page.locator('[data-component="session-timeline"]'),
        ).toBeVisible();
        await expect(page.locator(".judgment-criteria article")).toHaveCount(2);
        llmJudges++;
      }
    }
  }
  expect({ candidates, llmJudges, codeJudges }).toEqual({
    candidates: 36,
    llmJudges: 18,
    codeJudges: 18,
  });
  expect(errors).toEqual([]);
});
