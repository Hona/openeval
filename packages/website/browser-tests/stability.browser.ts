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

test("judge tabs switch the matching task without moving the numbered steps", async ({
  page,
}) => {
  await ready(page);
  const selectors = [
    ".guide",
    ".guide-task-code",
    ".guide-judge",
    "#guide-run",
    ".results-card",
  ];
  for (const name of ["judge.ts", "judge.md", "judge.ts", "judge.md"]) {
    await stableClick(
      page,
      page.getByRole("tab", { name, exact: true }),
      selectors,
    );
    await expect(
      page.locator(".guide-judge").getByRole("tabpanel"),
    ).toHaveCount(1);
    await expect(
      page.locator('.guide-task-code > [aria-hidden="false"] pre'),
    ).toContainText(
      name === "judge.ts" ? "Reply with exactly APPLE." : "Write a SQL query",
    );
  }
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

test("selecting models updates their metrics within the same results card", async ({
  page,
}) => {
  await ready(page);
  const selectors = [".results-card", ".score-chart", ".results-card-foot"];
  for (const index of [1, 5, 0]) {
    const row = page.locator(".chart-model").nth(index);
    const name = await row.locator(".model-identity strong").textContent();
    await stableClick(page, row.locator(".chart-row"), selectors);
    await expect(page.locator(".results-card-model")).toHaveText(name!);
  }
  await page.getByRole("tab", { name: "ask-dialect", exact: true }).click();
  await expect(page.locator(".criterion-legend li")).toHaveText([
    "Asks for the SQL dialect",
    "Uses bound parameters",
  ]);
  await page.getByRole("tab", { name: "exact-answer", exact: true }).click();
  await expect(page.locator(".criterion-legend li")).toHaveText([
    "Correct answer",
  ]);
});

test("agent prompt copies setup instructions without moving the hero", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__copiedPrompt = text;
        },
      },
    });
  });
  const button = page.getByRole("button", {
    name: "Copy agent prompt",
    exact: true,
  });
  await stableClick(page, button, [".lp-hero", ".agent-prompt", ".guide"]);
  await expect(page.locator(".agent-prompt button")).toHaveText("Copied");
  const copied = await page.evaluate(
    () => (window as any).__copiedPrompt as string,
  );
  expect(copied).toContain("https://openev.al/docs/quickstart/");
  expect(copied).toContain("prompt.md");
  expect(copied).toContain("judge.ts");
  expect(copied).toContain("openeval run");
  expect(copied).toContain("openeval view");

  // Embedded browsers can block the async clipboard API.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          (window as any).__focusBeforeFallback = document.activeElement;
          throw new Error("Clipboard denied");
        },
      },
    });
    document.execCommand = (command) => {
      (window as any).__fallbackPrompt = (
        document.activeElement as HTMLTextAreaElement
      ).value;
      return command === "copy";
    };
  });
  await stableClick(page, page.locator(".agent-prompt button"), [
    ".lp-hero",
    ".agent-prompt",
    ".guide",
  ]);
  expect(await page.evaluate(() => (window as any).__fallbackPrompt)).toBe(
    copied,
  );
  await expect(page.locator(".agent-prompt button")).toHaveText("Copied");
  expect(
    await page.evaluate(
      () => document.activeElement === (window as any).__focusBeforeFallback,
    ),
  ).toBe(true);
  await expect(page.locator("textarea")).toHaveCount(0);
});

test("search keeps its position and size for many, one, and zero matches", async ({
  page,
}) => {
  await ready(page);
  const chrome = [".site-titlebar", ".lp-hero"];
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
      "#criteria",
      "#outcomes",
      ".doc-pagination",
    ];
    const before = await layout(page, selectors);
    release();
    await page.evaluate(() => document.fonts.ready);
    const after = await layout(page, selectors);
    await test.info().attach("font-layout.json", {
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
