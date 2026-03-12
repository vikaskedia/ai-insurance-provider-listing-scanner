/**
 * Blue Shield CA — Find a Doctor Scraper
 *
 * Entry point: iterates providers × locations using shared modules
 * and Blue Shield–specific scraper logic.
 *
 * Usage:
 *   node blueshield/index.js                                    # run all
 *   node blueshield/index.js --provider "Barbara" --location "los-angeles"  # run one
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import {
    launchBrowser,
    connectStagehand,
    captureScreenshot,
    ensureOutputDirs,
    loadConfig,
    getTaskId,
    safeAct,
    sleep,
    randomDelay,
    pad,
    banner,
} from "../../shared/index.js";

import {
    setLocation,
    selectPlan,
    searchProvider,
    openProviderDetail,
    extractProviderData,
} from "./scraper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");
const INSURANCE_ID = "blueshield";
const FAD_URL = "https://www.blueshieldca.com/fad/home";

/* ─── Anti-bot tuning ──────────────────────────────────────────── */
const BATCH_SIZE = 5;   // restart browser every N providers

/* ─── CLI args ─────────────────────────────────────────────────── */

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i += 2) {
        if (args[i] === "--provider") opts.provider = args[i + 1];
        if (args[i] === "--location") opts.location = args[i + 1];
    }
    return opts;
}

/* ─── Main ─────────────────────────────────────────────────────── */

async function main() {
    const startTime = Date.now();
    const config = loadConfig();
    const cliOpts = parseArgs();

    // Filter providers / locations if CLI args given
    let providers = config.providers;
    let locations = config.locations;

    if (cliOpts.provider) {
        providers = providers.filter((p) =>
            p.name.toLowerCase().includes(cliOpts.provider.toLowerCase()),
        );
    }
    if (cliOpts.location) {
        locations = locations.filter(
            (l) =>
                l.id === cliOpts.location ||
                l.name.toLowerCase().includes(cliOpts.location.toLowerCase()),
        );
    }

    banner([
        "Blue Shield CA — Find a Doctor Scraper",
        "puppeteer-extra stealth + Stagehand AI",
        `Providers: ${providers.length} | Locations: ${locations.length}`,
        `Total searches: ${providers.length * locations.length}`,
    ]);

    // Ensure output dirs
    ensureOutputDirs(OUTPUT_DIR, locations);

    /* ─── Browser launch helper (reused on session rotation) ───── */
    const userDataDir = join(__dirname, "user_data");

    async function startSession() {
        console.log("\n🚀 Launching Chrome with stealth plugin...");
        const { browser, page: puppeteerPage } = await launchBrowser({
            userDataDir,
            geolocation: { latitude: 34.052996, longitude: -118.2548551 },
            permissions: ["geolocation"],
            permissionOrigin: "https://www.blueshieldca.com",
        });

        const wsEndpoint = browser.wsEndpoint();
        console.log(`   ✅ Chrome launched (ws: ${wsEndpoint.substring(0, 40)}...)`);

        console.log("🤖 Connecting Stagehand to browser...");
        const { stagehand, page } = await connectStagehand(wsEndpoint);
        console.log("   ✅ Stagehand connected");

        // Navigate to FAD and dismiss cookie banner
        console.log("\n🌐 Navigating to Blue Shield FAD page...");
        await page.goto(FAD_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
        });
        await sleep(5000);
        console.log("   ✅ FAD page loaded");

        console.log("🍪 Dismissing cookie banner...");
        await safeAct(
            stagehand,
            'Click the blue "Continue" button on the cookie consent banner',
            "Dismiss cookie banner",
        );
        await sleep(3000);

        return { browser, stagehand, page };
    }

    const results = [];
    let session = await startSession();
    let browser = session.browser;
    let stagehand = session.stagehand;
    let page = session.page;
    let providerCounter = 0;   // tracks providers in current batch

    try {

        // ─── Outer loop: locations ────────────────────────────────
        for (let li = 0; li < locations.length; li++) {
            const loc = locations[li];
            console.log(`\n${"═".repeat(60)}`);
            console.log(
                `📍 [Location ${li + 1}/${locations.length}] ${loc.name} — ${loc.zip}`,
            );
            console.log(`${"═".repeat(60)}`);

            // ─── Inner loop: providers at this location ───────────
            for (let pi = 0; pi < providers.length; pi++) {
                const prov = providers[pi];
                const taskId = getTaskId(config, INSURANCE_ID, prov.id, loc.id);

                console.log(
                    `\n   [${pi + 1}/${providers.length}] ${prov.name}  (task: ${taskId})`,
                );

                // ── Session rotation: restart browser every BATCH_SIZE providers ──
                if (providerCounter >= BATCH_SIZE) {
                    console.log(`\n🔄 Restarting browser (batch of ${BATCH_SIZE} done)...`);

                    // Tear down old session (best-effort)
                    try { await stagehand.close(); } catch (_) { }
                    try { await browser.close(); } catch (_) { }
                    await sleep(2000);  // let OS release resources

                    await randomDelay(240_000, 300_000, "Break before new session");

                    // Start fresh session
                    session = await startSession();
                    browser = session.browser;
                    stagehand = session.stagehand;
                    page = session.page;
                    providerCounter = 0;
                }

                try {
                    // Navigate to FAD home (skip only on the very first provider
                    // of a fresh session — startSession already navigated there)
                    if (providerCounter > 0) {
                        await page.goto(FAD_URL, {
                            waitUntil: "domcontentloaded",
                            timeout: 45000,
                        });
                        await randomDelay(4_000, 8_000, "Page load settle");
                    }

                    // Set location + plan + search (with retry on rate-limit)
                    const MAX_RETRIES = 3;
                    let searchResult = { blocked: false };
                    let attempt = 0;

                    for (attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                        if (attempt > 0) {
                            console.log(`   🔁 Retry ${attempt}/${MAX_RETRIES} for "${prov.name}"...`);

                            // After first retry failure → restart browser entirely
                            if (attempt >= 2) {
                                console.log(`   🔄 Restarting browser to clear rate-limit...`);
                                try { await stagehand.close(); } catch (_) { }
                                try { await browser.close(); } catch (_) { }
                                await sleep(2000);
                                await randomDelay(60_000, 120_000, "⏳ Long cooldown before fresh session");

                                session = await startSession();
                                browser = session.browser;
                                stagehand = session.stagehand;
                                page = session.page;
                                providerCounter = 0;
                            } else {
                                // First retry — just wait and reload the page
                                await randomDelay(60_000, 90_000, "⏳ Waiting for rate-limit to clear");
                                await page.goto(FAD_URL, {
                                    waitUntil: "domcontentloaded",
                                    timeout: 45000,
                                });
                                await sleep(5000);
                            }
                        }

                        await setLocation(page, stagehand, loc.zip);
                        await selectPlan(page, stagehand);
                        searchResult = await searchProvider(page, stagehand, prov.name);

                        if (!searchResult.blocked) break;

                        console.log(`   🚫 Still blocked after attempt ${attempt + 1}`);
                    }

                    if (searchResult.blocked) {
                        console.log(`   ❌ All ${MAX_RETRIES} retries exhausted for "${prov.name}" — skipping`);
                        results.push({
                            name: prov.name,
                            specialty: "N/A",
                            address: "N/A",
                            phone: "N/A",
                            acceptingNewPatients: false,
                            locationId: loc.id,
                            locationName: loc.name,
                            taskId,
                        });
                        providerCounter++;
                        continue;
                    }

                    await openProviderDetail(page, stagehand, prov.name);

                    // Screenshot
                    await captureScreenshot(page, OUTPUT_DIR, loc.id, prov.name);

                    // Scroll up for extraction
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await sleep(2000);

                    // Extract data
                    const data = await extractProviderData(stagehand, prov.name);
                    results.push({
                        ...data,
                        locationId: loc.id,
                        locationName: loc.name,
                        taskId,
                    });

                    console.log(`   ✅ Done with ${prov.name} @ ${loc.name}`);
                } catch (err) {
                    console.log(
                        `   ⚠️ Error: ${(err.message || "").substring(0, 80)}`,
                    );
                    results.push({
                        name: prov.name,
                        specialty: "N/A",
                        address: "N/A",
                        phone: "N/A",
                        acceptingNewPatients: false,
                        locationId: loc.id,
                        locationName: loc.name,
                        taskId,
                    });
                }

                providerCounter++;

                // ── Cooldown between providers (60–90s to avoid rate-limit) ──
                if (pi < providers.length - 1) {
                    await randomDelay(120_000, 150_000, "⏳ Cooldown before next provider");
                }
            }
        }

        console.log("\n✅ All searches complete\n");

        // ─── Summary ─────────────────────────────────────────────
        if (results.length > 0) {
            console.log("📋 Results Summary:");
            console.log("─".repeat(110));
            console.log(
                pad("Name", 35) +
                pad("Location", 18) +
                pad("Specialty", 22) +
                pad("Phone", 16) +
                "Accepting",
            );
            console.log("─".repeat(110));
            for (const r of results) {
                console.log(
                    pad(r.name, 35) +
                    pad(r.locationName, 18) +
                    pad(r.specialty, 22) +
                    pad(r.phone, 16) +
                    (r.acceptingNewPatients ? "Yes" : "No"),
                );
            }
            console.log("─".repeat(110));
        }

        // ─── Export ──────────────────────────────────────────────
        writeFileSync(
            join(OUTPUT_DIR, "results.json"),
            JSON.stringify(results, null, 2),
        );
        console.log("   ✅ JSON saved");

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        banner([
            `✅ Done in ${elapsed}s`,
            `${results.length} results across ${locations.length} locations`,
        ]);
    } finally {
        try { await stagehand.close(); } catch (_) { }
        try { await browser.close(); } catch (_) { }
    }
}

main().catch((err) => {
    console.error("\n❌ Fatal error:", err.message);
    console.error(err.stack);
    process.exit(1);
});
