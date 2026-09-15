import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  test.skip(
    !(await page.evaluate(
      () =>
        matchMedia(
          "(max-width: 760px), (max-width: 1000px) and (pointer: coarse)",
        ).matches,
    )),
    "Mobile reading and touch contract",
  );
});

test("landing has readable text, aligned actions, and 44px touch targets", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, height: r.height };
    };
    return {
      body: parseFloat(getComputedStyle(document.body).fontSize),
      prose: parseFloat(
        getComputedStyle(document.querySelector(".landing-intro p")!).fontSize,
      ),
      main: box(".landing-intro"),
      primary: box(".intro-actions .primary"),
      secondary: box(".intro-actions a:last-child"),
      install: box(".install-command"),
      workbench: box(".workbench"),
      targets: [
        ".mobile-toggle",
        ".search-trigger",
        ".github-link",
        ".install-command button",
        ".intro-actions .primary",
        ".workbench-editor [role=tab]",
        ".response-switch button",
        ".criterion-decision",
        ".viewer-section [role=tab]",
        ".screenshot-open",
      ].map(box),
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  });
  expect(geometry.body).toBeGreaterThanOrEqual(16);
  expect(geometry.prose).toBeGreaterThanOrEqual(16);
  for (const region of geometry.viewport <= 760
    ? [
        geometry.primary,
        geometry.secondary,
        geometry.install,
        geometry.workbench,
      ]
    : [geometry.workbench]) {
    expect(Math.abs(region.left - geometry.main.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(region.right - geometry.main.right)).toBeLessThanOrEqual(
      0.5,
    );
  }
  if (geometry.viewport > 760) {
    expect(
      Math.abs(geometry.primary.left - geometry.main.left),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(geometry.secondary.left - geometry.primary.left),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(geometry.install.right - geometry.main.right),
    ).toBeLessThanOrEqual(0.5);
  }
  for (const target of geometry.targets) {
    expect(target.height).toBeGreaterThanOrEqual(43.5);
    expect(target.width).toBeGreaterThanOrEqual(43.5);
  }
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
});

test("all authoring pages fit the viewport and use 16px reading text", async ({
  page,
}) => {
  for (const slug of [
    "quickstart",
    "terminology",
    "prompts",
    "rubrics",
    "code-judges",
    "workspaces",
    "running",
    "scoring",
    "evidence",
    "reference",
  ]) {
    await page.goto(`/docs/${slug}/`);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      prose: [
        ...document.querySelectorAll(
          ".doc-heading > p, .doc-section > p, .note p",
        ),
      ].map((e) => parseFloat(getComputedStyle(e).fontSize)),
      code: [...document.querySelectorAll(".code-block pre code")].map((e) =>
        parseFloat(getComputedStyle(e).fontSize),
      ),
      proseCodeFits: [...document.querySelectorAll(".code-prose pre")].every(
        (e) => e.scrollWidth <= e.clientWidth + 1,
      ),
      captionActions: [...document.querySelectorAll(".screenshot-open")].map(
        (e) => e.getBoundingClientRect().height,
      ),
    }));
    expect(result.width, slug).toBeLessThanOrEqual(result.viewport);
    expect(result.proseCodeFits, `${slug}: prompt and rubric wrapping`).toBe(
      true,
    );
    for (const size of result.prose)
      expect(size, `${slug}: prose`).toBeGreaterThanOrEqual(16);
    for (const size of result.code)
      expect(size, `${slug}: code`).toBeGreaterThanOrEqual(14);
    for (const height of result.captionActions)
      expect(height, `${slug}: image action`).toBeGreaterThanOrEqual(43.5);
  }
});

test("mobile navigation closes with Escape and search input avoids iOS text zoom", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator("#content")).toHaveAttribute("inert", "");
  const targets = await page
    .locator("#docs-navigation nav a")
    .evaluateAll((elements) =>
      elements.map((e) => ({
        size: parseFloat(getComputedStyle(e).fontSize),
        height: e.getBoundingClientRect().height,
      })),
    );
  for (const target of targets) {
    expect(target.size).toBeGreaterThanOrEqual(16);
    expect(target.height).toBeGreaterThanOrEqual(43.5);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#content")).not.toHaveAttribute("inert", "");
  expect(
    await page.locator("#content").evaluate((e) => (e as HTMLElement).inert),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Search documentation", exact: true })
    .click();
  const input = page.getByRole("textbox", {
    name: "Search documentation",
    exact: true,
  });
  expect(
    await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await input.fill("confidence");
  await expect(page.locator(".search-results a")).toHaveCount(1);
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
});

test("the mobile outline jumps to a section and wide tables scroll locally", async ({
  page,
}) => {
  await page.goto("/docs/reference/");
  await page.locator(".mobile-outline summary").click();
  await page
    .getByRole("navigation", { name: "Page sections" })
    .getByRole("link", { name: "Flags", exact: true })
    .click();
  await expect(page.locator(".mobile-outline")).not.toHaveAttribute("open", "");
  await expect(page).toHaveURL(/#flags$/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector("#flags")!.getBoundingClientRect().top -
          document.querySelector(".site-titlebar")!.getBoundingClientRect()
            .bottom,
      ),
    )
    .toBeCloseTo(20, 0);
  const table = page.locator(".doc-section:has(#flags) .table-scroll");
  const before = await table.evaluate((e) => ({
    width: e.clientWidth,
    content: e.scrollWidth,
  }));
  if (before.width < 620) {
    expect(before.content).toBeGreaterThan(before.width);
    await table.evaluate((e) => {
      e.scrollLeft = 100;
    });
    expect(await table.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
