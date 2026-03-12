/**
 * Screenshot capture & file management helpers.
 */

import { mkdirSync } from "fs";
import { join } from "path";
import { slugify } from "./utils.js";

/**
 * Ensure the output directory tree exists for each location.
 *
 * @param {string} baseOutputDir  – e.g. "blueshield/output"
 * @param {Array<{id: string}>} locations
 */
export function ensureOutputDirs(baseOutputDir, locations) {
    mkdirSync(baseOutputDir, { recursive: true });
    const screenshotsDir = join(baseOutputDir, "screenshots");
    mkdirSync(screenshotsDir, { recursive: true });

    for (const loc of locations) {
        mkdirSync(join(screenshotsDir, loc.id), { recursive: true });
    }
}

/**
 * Capture a full-page screenshot.
 *
 * @param {import("puppeteer").Page} page
 * @param {string} baseOutputDir
 * @param {string} locationId   – location slug, e.g. "los-angeles"
 * @param {string} providerName – raw provider name for slugifying
 * @returns {Promise<string>} saved file path
 */
export async function captureScreenshot(
    page,
    baseOutputDir,
    locationId,
    providerName,
) {
    const provSlug = slugify(providerName);
    const filePath = join(
        baseOutputDir,
        "screenshots",
        locationId,
        `${provSlug}.png`,
    );
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`   📸 Screenshot saved: ${locationId}/${provSlug}.png`);
    return filePath;
}
