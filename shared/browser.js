/**
 * Browser launch helper — puppeteer-extra stealth.
 *
 * Centralises stealth + Chrome launch config so every insurance
 * scraper gets the same anti-detection baseline.
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";

// Register stealth once at module level
puppeteer.use(StealthPlugin());

/**
 * @param {object} opts
 * @param {string} opts.userDataDir   – per-run temp Chrome profile dir
 * @param {{ latitude: number, longitude: number }} [opts.geolocation]
 * @param {string[]} [opts.permissions] – e.g. ["geolocation"]
 * @param {string} [opts.permissionOrigin] – origin for overridePermissions
 * @returns {Promise<{ browser: import("puppeteer").Browser, page: import("puppeteer").Page }>}
 */
export async function launchBrowser({
    userDataDir,
    geolocation,
    permissions = [],
    permissionOrigin,
}) {
    // Fresh profile every run
    try {
        rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) { }
    mkdirSync(userDataDir, { recursive: true });

    const browser = await puppeteer.launch({
        headless: false,
        executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        userDataDir,
        args: [
            "--window-size=1440,1080",
            "--window-position=0,0",
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--disable-notifications",
            "--no-restore-last-session",
            "--disable-session-crashed-bubble",
            "--hide-crash-restore-bubble",
            "--disable-features=ChromeWhatsNewUI,IsolateOrigins",
            "--disable-ipc-flooding-protection",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
        defaultViewport: { width: 1440, height: 900 },
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    // Grant permissions (e.g. geolocation)
    if (permissions.length > 0 && permissionOrigin) {
        const context = browser.defaultBrowserContext();
        await context.overridePermissions(permissionOrigin, permissions);
    }

    // Set geolocation if provided
    if (geolocation) {
        await page.setGeolocation({
            latitude: geolocation.latitude,
            longitude: geolocation.longitude,
            accuracy: 100,
        });
    }

    return { browser, page };
}
