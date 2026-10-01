import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("code observations render as readable checks and remain bounded on narrow screens", async ({ page }, info) => {
  await page.goto("/docs/code-judges/#execution");
  const example = page.locator(".observations-example");
  await expect(example.getByRole("cell", { name: "Input schema", exact: true })).toBeVisible();
  await expect(example.getByRole("cell", { name: "Pass", exact: true })).toBeVisible();
  await expect(example.getByRole("cell", { name: "Fail", exact: true })).toBeVisible();
  await expect(example.getByRole("cell", { name: "Two rows missing", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (info.project.name === "desktop") {
    await mkdir("test-results/observation-images", { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    const target = example.locator(".json-observations");
    const current = await target.innerHTML();
    // A labeled reconstruction of the previous flat renderer, using this same
    // generic data example. It is not a model-result or benchmark screenshot.
    await target.evaluate(node => {
      node.replaceChildren();
      for (const [key,value] of Object.entries({ checks: [{name:"Input schema",pass:true},{name:"Returned rows",pass:false,error:"Two rows missing"}], elapsedMs:1400, reportedCoverage:"3/5" })) {
        const term=document.createElement("dt"),detail=document.createElement("dd");term.textContent=key;detail.textContent=typeof value==="object"?JSON.stringify(value):String(value);node.append(term,detail);
      }
    });
    await example.screenshot({ path: "test-results/observation-images/before.png" });
    await target.evaluate((node,html) => { node.innerHTML=html; }, current);
    await example.screenshot({ path: "test-results/observation-images/after.png" });
  }
});
