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

    // Launch browser
    console.log("🚀 Launching Chrome with stealth plugin...");
    const userDataDir = join(__dirname, "user_data");
    const { browser, page: puppeteerPage } = await launchBrowser({
        userDataDir,
        geolocation: { latitude: 34.052996, longitude: -118.2548551 },
        permissions: ["geolocation"],
        permissionOrigin: "https://www.blueshieldca.com",
    });

    const wsEndpoint = browser.wsEndpoint();
    console.log(`   ✅ Chrome launched (ws: ${wsEndpoint.substring(0, 40)}...)`);

    // Connect Stagehand
    console.log("🤖 Connecting Stagehand to browser...");
    const { stagehand, page } = await connectStagehand(wsEndpoint);
    console.log("   ✅ Stagehand connected");

    const results = [];

    try {
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

                try {
                    // Navigate to FAD home
                    if (li > 0 || pi > 0) {
                        await page.goto(FAD_URL, {
                            waitUntil: "domcontentloaded",
                            timeout: 45000,
                        });
                        await sleep(4000);
                    }

                    // Set location + plan + search
                    await setLocation(page, stagehand, loc.zip);
                    await selectPlan(page, stagehand);
                    await searchProvider(page, stagehand, prov.name);
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
        await stagehand.close();
        await browser.close();
    }
}

main().catch((err) => {
    console.error("\n❌ Fatal error:", err.message);
    console.error(err.stack);
    process.exit(1);
});
