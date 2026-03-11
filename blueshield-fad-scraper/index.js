/**
 * Blue Shield FAD Scraper — puppeteer-extra stealth + Stagehand AI
 *
 * Strategy:
 * 1. Launch real Chrome via puppeteer-extra with stealth plugin
 *    (handles CDP detection vectors that Akamai checks)
 * 2. Connect Stagehand to the running browser via cdpUrl for AI features
 * 3. Navigate and interact via Stagehand act()/extract()
 *
 * The stealth plugin patches:
 * - navigator.webdriver, chrome.runtime, plugins, languages
 * - WebGL vendor/renderer, codec support
 * - Window dimensions, iframe contentWindow
 * - sourceURL annotations from injected scripts
 * All without using Page.addScriptToEvaluateOnNewDocument directly
 */

import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Enable stealth
puppeteer.use(StealthPlugin());

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const SCREENSHOTS_DIR = join(OUTPUT_DIR, "screenshots");

/** Helper: run act() with error handling */
async function safeAct(stagehand, instruction, label) {
    try {
        await stagehand.act(instruction);
        console.log(`   ✅ ${label || instruction.substring(0, 50)}`);
        return true;
    } catch (err) {
        console.log(`   ⚠️ ${label || 'act()'} failed: ${(err.message || "").substring(0, 80)}`);
        return false;
    }
}

/** Helper: select "Search all plans" via DOM */
async function selectPlan(page) {
    const opened = await page.evaluate(() => {
        const planInput = document.querySelector('input#choose-plan');
        if (planInput) { planInput.click(); return true; }
        return false;
    });
    if (opened) {
        console.log('   ✅ Opened plan dropdown');
    } else {
        console.log('   ⚠️ input#choose-plan not found');
        return false;
    }
    await new Promise(r => setTimeout(r, 3000));

    const selected = await page.evaluate(() => {
        const link = document.querySelector('div.search-all-plans-container a');
        if (link) { link.click(); return 'search-all-plans-container'; }
        const allLinks = document.querySelectorAll('a');
        for (const a of allLinks) {
            if ((a.textContent || '').trim() === 'Search all plans') {
                a.click(); return 'text-match';
            }
        }
        return null;
    });
    if (selected) console.log(`   ✅ Selected "Search all plans"`);
    else console.log('   ⚠️ "Search all plans" link not found');
    await new Promise(r => setTimeout(r, 2000));
    return !!selected;
}

/** Provider list */
const PROVIDERS = [
    'Barbara Huynh',
    'Bessy Martirosyan',
    'Barry Stein',
    'Bernice Ponce De Leon',
    'Debbie Chang',
];

async function main() {
    const startTime = Date.now();
    console.log("═══════════════════════════════════════════════════════");
    console.log("  Blue Shield CA — Find a Doctor Scraper");
    console.log("  puppeteer-extra stealth + Stagehand AI");
    console.log("  ZIP: 90071 | Providers: " + PROVIDERS.length);
    console.log("═══════════════════════════════════════════════════════\n");

    mkdirSync(OUTPUT_DIR, { recursive: true });
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    // Fresh user_data
    const userDataDir = join(__dirname, "user_data");
    try {
        rmSync(userDataDir, { recursive: true, force: true });
        mkdirSync(userDataDir, { recursive: true });
        console.log("🧹 Cleaned user_data directory");
    } catch (_) { }

    // ─── Step 1: Launch Chrome via puppeteer-extra + stealth ───────
    console.log("🚀 Launching Chrome with stealth plugin...");
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        userDataDir: userDataDir,
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

    // Get the CDP WebSocket endpoint
    const wsEndpoint = browser.wsEndpoint();
    console.log(`   ✅ Chrome launched (ws: ${wsEndpoint.substring(0, 40)}...)`);

    // Grant geolocation via CDP on the browser context
    const pages = await browser.pages();
    const puppeteerPage = pages[0] || await browser.newPage();

    // Grant geolocation
    const context = browser.defaultBrowserContext();
    await context.overridePermissions("https://www.blueshieldca.com", ["geolocation"]);

    // Set geolocation (LA 90071)
    await puppeteerPage.setGeolocation({
        latitude: 34.052996,
        longitude: -118.2548551,
        accuracy: 100,
    });
    console.log("   ✅ Geolocation set to LA 90071");

    // ─── Step 2: Connect Stagehand to the running browser ─────────
    console.log("🤖 Connecting Stagehand to browser...");
    const stagehand = new Stagehand({
        env: "LOCAL",
        headless: false,
        enableCaching: false,
        model: "google/gemini-2.5-flash",
        localBrowserLaunchOptions: {
            cdpUrl: wsEndpoint,
        },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];
    console.log("   ✅ Stagehand connected");

    try {
        // ─── Step 3: Navigate to FAD page ─────────────────────────
        console.log("\n🌐 Navigating to Blue Shield FAD page...");
        await page.goto("https://www.blueshieldca.com/fad/home", {
            waitUntil: "domcontentloaded",
            timeout: 45000,
        });
        await page.waitForTimeout(5000);
        console.log("   ✅ FAD page loaded");

        // ─── Step 3b: Dismiss cookie banner ───────────────────────
        console.log("🍪 Dismissing cookie banner...");
        await safeAct(stagehand,
            'Click the blue "Continue" button on the cookie consent banner',
            'Dismiss cookie banner');
        await page.waitForTimeout(3000);

        // ─── Step 4: Search each provider (location + plan set per search) ──
        console.log(`\n👤 Searching ${PROVIDERS.length} providers individually:\n`);
        PROVIDERS.forEach((n, i) => console.log(`   ${i + 1}. ${n}`));
        console.log();

        const providers = [];

        for (let i = 0; i < PROVIDERS.length; i++) {
            const provName = PROVIDERS[i];
            const safeName = provName.replace(/[^a-zA-Z0-9 ,.-]/g, '').replace(/\s+/g, '_').substring(0, 60);
            console.log(`\n${'═'.repeat(55)}`);
            console.log(`   [${i + 1}/${PROVIDERS.length}] Searching: ${provName}`);
            console.log(`${'═'.repeat(55)}`);

            try {
                // ── Navigate to FAD home for each provider ──
                if (i > 0) {
                    console.log("   🌐 Navigating to FAD home...");
                    await page.goto("https://www.blueshieldca.com/fad/home", {
                        waitUntil: "domcontentloaded",
                        timeout: 45000,
                    });
                    await page.waitForTimeout(4000);
                }

                // ── Set location for this search ──
                console.log("   📍 Setting location to 90071...");
                await safeAct(stagehand,
                    'Click the Location field in the search bar to open the location popup',
                    'Open location modal');
                await page.waitForTimeout(3000);

                const zipTyped = await page.evaluate(() => {
                    const input = document.querySelector('input#autocomplete');
                    if (!input) return false;
                    input.focus();
                    input.value = '90071';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { key: '1', bubbles: true }));
                    return true;
                });
                if (zipTyped) {
                    console.log('   ✅ Typed "90071" in input#autocomplete');
                } else {
                    await safeAct(stagehand,
                        'In the location modal popup, click the input field labeled "Zip Code or Address" and type "90071"',
                        'Type ZIP via Stagehand');
                }
                await page.waitForTimeout(3000);

                // Select suggestion
                const suggestionClicked = await page.evaluate(() => {
                    const items = document.querySelectorAll('li, [role="option"], [class*="suggestion"], [class*="result"]');
                    for (const item of items) {
                        const text = (item.textContent || '').toLowerCase();
                        if (text.includes('90071') || (text.includes('los angeles') && text.includes('ca'))) {
                            item.click();
                            return item.textContent.trim().substring(0, 60);
                        }
                    }
                    return null;
                });
                if (suggestionClicked) {
                    console.log(`   ✅ Location: "${suggestionClicked}"`);
                } else {
                    await safeAct(stagehand,
                        'Click on the location suggestion containing "90071" or "Los Angeles"',
                        'Select location suggestion');
                }
                await page.waitForTimeout(2000);

                // ── Set plan for this search ──
                console.log("   📋 Selecting plan...");
                const planOk = await selectPlan(page);
                if (!planOk) {
                    await safeAct(stagehand,
                        'Click the Plan dropdown and select "Search all plans"',
                        'Select plan via Stagehand');
                }
                await page.waitForTimeout(2000);

                // ── Type provider name in search field ──
                console.log("   🔍 Typing provider name...");
                await safeAct(stagehand,
                    `Click on the "Doctor name, specialty, condition" search input field, clear any existing text, then type "${provName}"`,
                    `Type "${provName}"`);
                await page.waitForTimeout(4000);

                // Click matching dropdown suggestion
                console.log("   📋 Looking for provider in dropdown...");
                const clickedDropdown = await page.evaluate((name) => {
                    const items = document.querySelectorAll('[class*="typeahead"] li, [class*="suggestion"] li, [class*="dropdown"] li, [role="option"], [role="listbox"] li');
                    const lowerName = name.toLowerCase();
                    for (const item of items) {
                        const text = (item.textContent || '').toLowerCase();
                        if (text.includes(lowerName) || lowerName.split(' ').every(part => text.includes(part))) {
                            item.click();
                            return item.textContent.trim().substring(0, 60);
                        }
                    }
                    return null;
                }, provName);

                if (clickedDropdown) {
                    console.log(`   ✅ Clicked dropdown: "${clickedDropdown}"`);
                } else {
                    await safeAct(stagehand,
                        `Click on the search suggestion or dropdown item that matches "${provName}"`,
                        `Click dropdown for ${provName}`);
                }

                // Wait for search results
                await page.waitForTimeout(6000);

                // Check for errors
                const hasError = await page.evaluate(() => {
                    return document.body.innerText.includes("aren't able to complete");
                });
                if (hasError) {
                    console.log("   ⚠️ Search returned error — trying submit button...");
                    await safeAct(stagehand, 'Click the search button to submit', 'Submit search');
                    await page.waitForTimeout(5000);
                }

                // ── Click provider's name to open their detail page ──
                const nameParts = provName.split(' ');
                const firstName = nameParts[0];
                const lastName = nameParts[nameParts.length - 1];

                console.log("   🔗 Opening provider detail page...");
                const detailOpened = await page.evaluate(([first, last]) => {
                    const allLinks = document.querySelectorAll('a');
                    for (const link of allLinks) {
                        const text = (link.textContent || '').toLowerCase();
                        if (text.includes(first.toLowerCase()) && text.includes(last.toLowerCase())) {
                            link.click();
                            return { text: link.textContent.trim().substring(0, 60) };
                        }
                    }
                    return null;
                }, [firstName, lastName]);

                if (detailOpened) {
                    console.log(`   ✅ Opened detail page (via ${detailOpened.via}): "${detailOpened.text}"`);
                    // Wait for the detail page to fully load
                    await page.waitForTimeout(6000);
                } else {
                    // Fallback: use Stagehand
                    console.log("   ⚠️ Trying Stagehand to click provider...");
                    await safeAct(stagehand,
                        `Click on the provider name "${provName}" or the "View details" link to open their detail page`,
                        `Open ${provName} detail page`);
                    await page.waitForTimeout(6000);
                }

                // Screenshot the DETAIL page (not the search results)
                const screenshotPath = join(SCREENSHOTS_DIR, `${safeName}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`   📸 Screenshot saved: ${safeName}.png`);

                // Scroll to top for extraction
                await page.evaluate(() => window.scrollTo(0, 0));
                await page.waitForTimeout(2000);

                // Extract provider data from the detail page
                try {
                    const result = await stagehand.extract({
                        instruction: `Extract the provider details for the doctor shown on this page. Get their full name with credentials, specialty, address, phone, and whether they are accepting new patients.`,
                        schema: z.object({
                            name: z.string().describe("Full name with credentials"),
                            specialty: z.string().describe("Medical specialty"),
                            address: z.string().describe("Full address"),
                            phone: z.string().describe("Phone number"),
                            acceptingNewPatients: z.boolean().describe("Accepting new patients"),
                        }),
                    });
                    providers.push(result);
                    console.log(`   📋 Extracted: ${result.name} | ${result.specialty}`);
                } catch (extractErr) {
                    console.log(`   ⚠️ Extract failed: ${(extractErr.message || '').substring(0, 60)}`);
                    providers.push({ name: provName, specialty: 'N/A', address: 'N/A', phone: 'N/A', acceptingNewPatients: false });
                }

                console.log(`   ✅ Done with ${provName}\n`);

            } catch (err) {
                console.log(`   ⚠️ Error on ${provName}: ${(err.message || '').substring(0, 80)}`);
                providers.push({ name: provName, specialty: 'N/A', address: 'N/A', phone: 'N/A', acceptingNewPatients: false });
            }
        }

        console.log('\n✅ All providers searched\n');

        // ─── Summary ────────────────────────────────────────────
        if (providers.length > 0) {
            console.log("📋 Provider Summary:");
            console.log("─".repeat(100));
            console.log(pad("Name", 35) + pad("Specialty", 25) + pad("Phone", 18) + "Accepting");
            console.log("─".repeat(100));
            for (const p of providers) {
                console.log(
                    pad(p.name, 35) + pad(p.specialty, 25) + pad(p.phone, 18) +
                    (p.acceptingNewPatients ? "Yes" : "No")
                );
            }
            console.log("─".repeat(100));
        }

        // ─── Export ─────────────────────────────────────────────
        console.log("\n📁 Exporting...");
        writeFileSync(join(OUTPUT_DIR, "providers.json"), JSON.stringify(providers, null, 2));
        console.log("   ✅ JSON saved");

        const csvHeaders = ["Name", "Specialty", "Address", "Phone", "Accepting"];
        const csvRows = providers.map(p => [
            `"${(p.name || "").replace(/"/g, '""')}"`,
            `"${(p.specialty || "").replace(/"/g, '""')}"`,
            `"${(p.address || "").replace(/"/g, '""')}"`,
            `"${(p.phone || "").replace(/"/g, '""')}"`,
            p.acceptingNewPatients ? "Yes" : "No"
        ].join(","));
        writeFileSync(join(OUTPUT_DIR, "providers.csv"), [csvHeaders.join(","), ...csvRows].join("\n"));
        console.log("   ✅ CSV saved");

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n═══════════════════════════════════════════════════════`);
        console.log(`  ✅ Done in ${elapsed}s — ${providers.length} providers`);
        console.log(`═══════════════════════════════════════════════════════`);
    } finally {
        await stagehand.close();
        await browser.close();
    }
}

function pad(str, len) {
    return (str || "N/A").substring(0, len - 1).padEnd(len);
}

main().catch((err) => {
    console.error("\n❌ Fatal error:", err.message);
    console.error(err.stack);
    process.exit(1);
});
