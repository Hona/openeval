import { expect, test, type Locator, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };
type Layout = Record<string, Box>;

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function layout(page: Page, selectors: string[]): Promise<Layout> {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => {
          const element = document.querySelector(selector)!;
          const box = element.getBoundingClientRect();
          const fixed = ["fixed", "sticky"].includes(
            getComputedStyle(element).position,
          );
          return [
            selector,
            {
              x: box.x + (fixed ? 0 : scrollX),
              y: box.y + (fixed ? 0 : scrollY),
              width: box.width,
              height: box.height,
            },
          ];
        }),
      ),
    selectors,
  );
}

function unchanged(before: Layout, after: Layout) {
  for (const selector of Object.keys(before))
    for (const key of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(after[selector][key] - before[selector][key]),
        `${selector} ${key}`,
      ).toBeLessThanOrEqual(0.5);
}

async function ready(page: Page, path = "/") {
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".site-shell")).toHaveCount(1);
}

/** Sample every animation frame: recent-input shifts are excluded from CLS. */
async function stableClick(page: Page, control: Locator, selectors: string[]) {
  await control.scrollIntoViewIfNeeded();
  const before = await layout(page, selectors);
  await page.evaluate((selectors) => {
    const recorder = { running: true, frames: [] as Layout[] };
    (window as any).__layoutRecorder = recorder;
    const capture = () => {
      recorder.frames.push(
        Object.fromEntries(
          selectors.map((selector) => {
            const element = document.querySelector(selector)!;
            const box = element.getBoundingClientRect();
            const fixed = ["fixed", "sticky"].includes(
              getComputedStyle(element).position,
            );
            return [
              selector,
              {
                x: box.x + (fixed ? 0 : scrollX),
                y: box.y + (fixed ? 0 : scrollY),
                width: box.width,
                height: box.height,
              },
            ];
          }),
        ),
      );
      if (recorder.running) requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  }, selectors);
  await control.click();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const frames = await page.evaluate(() => {
    const recorder = (window as any).__layoutRecorder;
    recorder.running = false;
    return recorder.frames as Layout[];
  });
  for (const frame of frames) unchanged(before, frame);
  unchanged(before, await layout(page, selectors));
}

test("source tabs and response choices keep the workbench and following sections anchored", async ({
  page,
}) => {
  await ready(page);
  const selectors = [
    ".workbench",
    ".workbench-editor",
    ".workbench-evidence",
    ".response-quote",
    ".response-code",
    ".judgment-heading",
    ".landing-grid",
    ".viewer-section",
  ];
  for (const name of [
    "prompt.md",
    "benchmark.ts",
    "judge.md",
    "prompt.md",
    "judge.md",
  ]) {
    await stableClick(
      page,
      page.getByRole("tab", { name, exact: true }),
      selectors,
    );
    await expect(
      page.getByRole("tabpanel").filter({ has: page.locator(".code-block") }),
    ).toHaveCount(1);
  }
  for (const name of [
    "Assumes dialect",
    "Asks first",
    "Assumes dialect",
    "Asks first",
  ])
    await stableClick(
      page,
      page.getByRole("button", { name, exact: true }),
      selectors,
    );
  await expect(page.locator(".judgment-heading")).toContainText("2 / 2 passed");
  for (const metric of await page.locator(".metric-decision").all())
    await stableClick(page, metric, selectors);
  const inactive = page.locator('.stable-tab-panel[aria-hidden="true"]');
  expect(await inactive.count()).toBeGreaterThan(0);
  expect(
    await inactive.evaluateAll((elements) =>
      elements.every(
        (element) =>
          (element as HTMLElement).inert &&
          getComputedStyle(element).visibility === "hidden",
      ),
    ),
  ).toBe(true);
});

test("gallery tabs retain one image frame and caption boundary", async ({
  page,
}) => {
  await ready(page);
  const selectors = [
    ".viewer-section",
    ".screenshot-panels",
    ".quick-reference",
  ];
  for (const name of [
    "Judgment & evidence",
    "Live queue",
    "Model scores",
    "Live queue",
    "Model scores",
  ])
    await stableClick(
      page,
      page.getByRole("tab", { name, exact: true }),
      selectors,
    );
  const captions = await page
    .locator(".screenshot-panels figcaption")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().y),
    );
  expect(Math.max(...captions) - Math.min(...captions)).toBeLessThanOrEqual(
    0.5,
  );
  await expect(
    page.getByRole("link", { name: /Open full-size image:/ }),
  ).toHaveCount(1);
});

test("search keeps its position and size for many, one, and zero matches", async ({
  page,
}) => {
  await ready(page);
  const chrome = [".site-titlebar", ".landing-intro"];
  const pageBefore = await layout(page, chrome);
  await page.locator(".search-trigger").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  unchanged(pageBefore, await layout(page, chrome));
  const selectors = [
    ".search-dialog",
    ".search-results",
    ".search-dialog-footer",
  ];
  const before = await layout(page, selectors);
  for (const term of [
    "confidence",
    "no-match-for-this-search",
    "",
    "rubric",
    "SQL",
  ]) {
    await page
      .getByRole("textbox", { name: "Search documentation" })
      .fill(term);
    unchanged(before, await layout(page, selectors));
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".search-trigger")).toBeFocused();
  unchanged(pageBefore, await layout(page, chrome));
});

test("score changes only affect the values and filled portion of the meter", async ({
  page,
}) => {
  await ready(page, "/docs/scoring/");
  const selectors = [
    ".calculator",
    ".calculator-inputs",
    ".calculator-output",
    ".score-meter",
    "#read",
  ];
  const control = page.locator(".verdict-button").first();
  for (let i = 0; i < 6; i++) await stableClick(page, control, selectors);
  await expect(page.locator(".calculator-output strong")).toHaveText("75%");
  const controls = page.locator(".verdict-button");
  for (const index of [0, 0, 1, 2, 2])
    await stableClick(page, controls.nth(index), selectors);
  await expect(page.locator(".calculator-output strong")).toHaveText("0–100%");
  for (const index of [0, 1, 2])
    await stableClick(page, controls.nth(index), selectors);
  await expect(page.locator(".calculator-output strong")).toHaveText("100%");
  for (const index of [0, 1, 2])
    await stableClick(page, controls.nth(index), selectors);
  await expect(page.locator(".calculator-output strong")).toHaveText("0%");
});

test("lazy screenshots reserve their space before the response arrives", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/images/**", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/docs/scoring/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".screenshot").scrollIntoViewIfNeeded();
    const selectors = [
      ".screenshot",
      ".screenshot figcaption",
      ".doc-pagination",
    ];
    const before = await layout(page, selectors);
    release();
    await page
      .locator(".screenshot img")
      .evaluate((image: HTMLImageElement) => image.decode());
    unchanged(before, await layout(page, selectors));
  } finally {
    release();
  }
});

test("short and long docs keep the same header and navigation width", async ({
  page,
}) => {
  await ready(page, "/docs/rubrics/");
  const selectors = [".site-titlebar", ".brand", ".titlebar-actions"];
  const before = await layout(page, selectors);
  for (const path of ["/404.html", "/docs/reference/", "/docs/prompts/"]) {
    await ready(page, path);
    unchanged(before, await layout(page, selectors));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("slow fonts cannot cause a late text reflow", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\.(?:ttf|woff2)(?:\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/docs/rubrics/", { waitUntil: "domcontentloaded" });
    // Wait out the optional font's brief block period, with its network response held.
    await page.waitForFunction(() => performance.now() > 300);
    const selectors = [
      ".site-titlebar",
      ".doc-heading",
      "#metrics",
      "#outcomes",
      ".doc-pagination",
    ];
    const before = await layout(page, selectors);
    release();
    await page.evaluate(() => document.fonts.ready);
    const after = await layout(page, selectors);
    await test
      .info()
      .attach("font-layout.json", {
        body: JSON.stringify(
          {
            before,
            after,
            fonts: await page.evaluate(() =>
              [...document.fonts].map((f) => ({
                family: f.family,
                display: f.display,
                status: f.status,
              })),
            ),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    unchanged(before, after);
  } finally {
    release();
  }
});
