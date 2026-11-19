import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const realText = readFileSync(
  new URL("../public/demo/report.json", import.meta.url),
  "utf8",
);

test("actual exported inspection: entry, replay, report, keyboard, mobile and contrast", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Someone has to read the code." }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/landing-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Enter the demo inspection" }).click();
  await expect(
    page.getByRole("heading", {
      name: "fagan-mcp review v2 fixes (Codex roles)",
    }),
  ).toBeVisible();
  await expect(page.locator(".phase-banner")).toContainText(
    "Inspection closed",
  );
  const guide = page.getByRole("navigation", { name: "Inspection highlights" });
  const stage = page.getByRole("region", { name: "Inspection stage" });
  await expect(stage.getByRole("heading", { name: "A code change under review" })).toBeVisible();
  await guide.getByRole("button", { name: "Read the change" }).click();
  await expect(stage.locator(".seat.active")).toContainText("Reader");
  await expect(stage.locator(".reading-id")).toHaveText("R023");
  await guide.getByRole("button", { name: "Review the finding" }).click();
  await expect(stage.getByRole("heading", { name: "A possible problem" })).toBeVisible();
  await expect(stage.getByText("The Author waived D001.")).toHaveCount(0);
  await guide.getByRole("button", { name: "See the decision" }).click();
  await expect(stage.getByText("The Author waived D001.")).toBeVisible();
  await expect(stage.getByRole("heading", { name: "Follow-up passed" })).toBeVisible();
  const findingLink = page.getByRole("button", { name: /D001 · major/ });
  await expect(findingLink).toHaveCount(0);
  const scrubber = page.getByRole("slider", { name: "Replay position" });
  await scrubber.focus();
  await page.keyboard.press("End");
  await expect(page.locator(".event-count")).toHaveText("59 / 59 · Metrics measured");
  await expect(scrubber).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator(".event-count")).toHaveText("1 / 59 · Inspection opened");
  await expect(findingLink).toHaveCount(0);
  await guide.getByRole("button", { name: "Read the change" }).click();
  await page.getByLabel("Reduce motion").check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole("button", { name: "Play replay" })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `test-results/stage-${info.project.name}.png` });
  await stage.getByRole("button", { name: "Read the full paraphrase" }).click();
  await expect(page.locator(".reading-desk .paraphrase")).toContainText("takes a separate value");
  await page.getByText("Browse all events", { exact: true }).click();
  const phases = page.getByRole("navigation", { name: "Recorded phases" });
  expect(await phases.evaluate((rail) => rail.scrollWidth <= rail.clientWidth)).toBe(true);
  const rework = phases.getByRole("button", { name: "Jump to Rework" });
  await rework.focus();
  await page.keyboard.press("Enter");
  await expect(rework).toBeFocused();
  await expect(rework).toHaveAttribute("aria-current", "step");
  await expect(page.locator(".event-count")).toHaveText("54 / 59 · Meeting closed");
  await expect(page.locator(".reading-desk .phase-banner")).toHaveCount(0);
  await phases.getByRole("button", { name: "Jump to Closed" }).click();
  await expect(page.locator(".event-count")).toHaveText("58 / 59 · Follow-up");
  await expect(page.locator(".reading-desk .phase-banner")).toContainText("Follow-up passed");
  await findingLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "D001, major defect" })).toBeFocused();
  await expect(page.getByLabel("Reading unit", { exact: true })).toHaveValue("U023");
  await expect(page.locator(".event-count")).toHaveText("58 / 59 · Follow-up");
  await page.getByRole("button", { name: /57 Author records rework/ }).click();
  await expect(page.locator(".event-count")).toHaveText("57 / 59 · Author records rework");
  await expect(page.locator(".reading-desk .phase-banner")).toHaveCount(0);
  await page.getByLabel("Jump to event").selectOption("30");
  await expect(stage.getByRole("heading", { name: "Read the change" })).toBeVisible();
  await expect(stage.locator(".seat.active")).toContainText("Reader");
  await expect(stage.locator(".paraphrase")).not.toContainText("has not spoken");
  await page.getByLabel("Reduce motion").check();
  expect(
    await page
      .locator(".replay-scene .paraphrase")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  const beforeStep = await page.locator('.event-count').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.event-count')).not.toHaveText(beforeStep!);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.event-count')).toHaveText(beforeStep!);
  await page.keyboard.press("r");
  await expect(
    page.getByRole("heading", { name: "The inspection record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Defect log", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ghost").first()).toContainText("D001");
  await expect(page.locator(".ghost").first()).toContainText("Bound by the Author: waived");
  await expect(page.locator(".ghost").first()).toContainText("False positive: Git requires a separate -C argument and rejects the alleged attached form");
  await expect(page.locator(".ghost.verified")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `test-results/report-${info.project.name}.png`,
    fullPage: false,
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  expect(JSON.parse(readFileSync((await (await download).path())!, 'utf8'))).toEqual(JSON.parse(realText));
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('.greenbar').evaluate(e => getComputedStyle(e).overflow)).toBe('visible');
  await page.emulateMedia({ media: 'screen' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Room view" }).click();
  const eventPicker = page.getByLabel("Jump to event");
  await phases.getByRole("button", { name: "Jump to Closed" }).click();
  await page.getByLabel("Reading unit", { exact: true }).selectOption("U023");
  await expect(
    page.getByRole("article", { name: "D001, major defect" }),
  ).toBeVisible();
  await expect(page.locator(".reading-desk .phase-banner")).toContainText("Follow-up passed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const waiver = page.locator(".ghost p").filter({ hasText: "Author's waiver" });
  await waiver.scrollIntoViewIfNeeded();
  await expect(waiver).toBeInViewport();
  await page.screenshot({
    path: `test-results/room-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Shortcuts ?" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const finalEventValue = await eventPicker.locator("option").last().getAttribute("value");
  await eventPicker.selectOption(finalEventValue ?? "0");
  await page.getByRole('button', { name: 'Play replay' }).click();
  await expect(page.locator('.event-count')).toContainText(/^1 \/ /);
  await expect(page.locator('.event-count')).not.toContainText(/^1 \/ /, { timeout: 5000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(errors).toEqual([]);
});

test("upload and failures preserve untrusted strings as text", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Choose inspection report")
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("oops"),
    });
  await expect(
    page.getByRole("heading", { name: "The record could not be opened" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to load screen" }).click();
  const synthetic = JSON.parse(realText);
  synthetic.inspection.title = '<img src=x onerror="window.injected=true">';
  await page
    .getByLabel("Choose inspection report")
    .setInputFiles({
      name: "test-only.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(synthetic)),
    });
  await expect(
    page.getByRole("heading", { name: synthetic.inspection.title }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Reflect.get(window, "injected")),
  ).toBeUndefined();
  expect(await page.locator("main img").count()).toBe(0);
  await page.goto("/?report=https://example.net/report.json");
  await expect(page.getByRole("alert")).toContainText("Only report URLs");
  await page.route("**/missing.json", (route) =>
    route.fulfill({ status: 404, body: "Missing" }),
  );
  await page.goto("/?report=missing.json");
  await expect(page.getByRole("alert")).toContainText("HTTP 404");
});
