/**
 * Blue Shield CA — FAD-specific scraper functions.
 *
 * Each function handles one piece of the Blue Shield "Find a Doctor"
 * page interaction.  They are imported by blueshield/index.js.
 */

import { z } from "zod";
import { safeAct, sleep } from "../../shared/index.js";

/* ─── Location ──────────────────────────────────────────────────── */

/**
 * Open the location modal, type a ZIP, and select the suggestion.
 */
export async function setLocation(page, stagehand, zip) {
    console.log(`   📍 Setting location to ${zip}...`);

    await safeAct(
        stagehand,
        "Click the Location field in the search bar to open the location popup",
        "Open location modal",
    );
    await sleep(3000);

    // Type ZIP via DOM
    const zipTyped = await page.evaluate((z) => {
        const input = document.querySelector("input#autocomplete");
        if (!input) return false;
        input.focus();
        input.value = z;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "1", bubbles: true }),
        );
        input.dispatchEvent(
            new KeyboardEvent("keyup", { key: "1", bubbles: true }),
        );
        return true;
    }, zip);

    if (zipTyped) {
        console.log(`   ✅ Typed "${zip}" in input#autocomplete`);
    } else {
        await safeAct(
            stagehand,
            `In the location modal popup, click the input field labeled "Zip Code or Address" and type "${zip}"`,
            "Type ZIP via Stagehand",
        );
    }
    await sleep(3000);

    // Select suggestion
    const suggestionClicked = await page.evaluate((zip) => {
        const items = document.querySelectorAll(
            'li, [role="option"], [class*="suggestion"], [class*="result"]',
        );
        for (const item of items) {
            const text = (item.textContent || "").toLowerCase();
            if (text.includes(zip) || (text.includes("los angeles") && text.includes("ca"))) {
                item.click();
                return item.textContent.trim().substring(0, 60);
            }
        }
        return null;
    }, zip);

    if (suggestionClicked) {
        console.log(`   ✅ Location: "${suggestionClicked}"`);
    } else {
        await safeAct(
            stagehand,
            `Click on the location suggestion containing "${zip}"`,
            "Select location suggestion",
        );
    }
    await sleep(2000);
}

/* ─── Plan ──────────────────────────────────────────────────────── */

/**
 * Select "Search all plans" via DOM click.
 */
export async function selectPlan(page, stagehand) {
    console.log("   📋 Selecting plan...");

    const opened = await page.evaluate(() => {
        const planInput = document.querySelector("input#choose-plan");
        if (planInput) {
            planInput.click();
            return true;
        }
        return false;
    });

    if (opened) {
        console.log("   ✅ Opened plan dropdown");
    } else {
        console.log("   ⚠️ input#choose-plan not found");
    }
    await sleep(3000);

    const selected = await page.evaluate(() => {
        const link = document.querySelector(
            "div.search-all-plans-container a",
        );
        if (link) {
            link.click();
            return "search-all-plans-container";
        }
        const allLinks = document.querySelectorAll("a");
        for (const a of allLinks) {
            if ((a.textContent || "").trim() === "Search all plans") {
                a.click();
                return "text-match";
            }
        }
        return null;
    });

    if (selected) {
        console.log('   ✅ Selected "Search all plans"');
    } else {
        console.log('   ⚠️ "Search all plans" link not found');
        await safeAct(
            stagehand,
            'Click the Plan dropdown and select "Search all plans"',
            "Select plan via Stagehand",
        );
    }
    await sleep(2000);
}

/* ─── Provider search ───────────────────────────────────────────── */

/**
 * Type a provider name in the search box and click the dropdown match.
 * @returns {{ blocked: boolean }} – `blocked` is true when the site
 *   returns "aren't able to complete your search" (rate-limit).
 */
export async function searchProvider(page, stagehand, providerName) {
    console.log("   🔍 Typing provider name...");

    await safeAct(
        stagehand,
        `Click on the "Doctor name, specialty, condition" search input field, clear any existing text, then type "${providerName}"`,
        `Type "${providerName}"`,
    );
    await sleep(4000);

    // Click matching dropdown suggestion
    console.log("   📋 Looking for provider in dropdown...");
    const clickedDropdown = await page.evaluate((name) => {
        const items = document.querySelectorAll(
            '[class*="typeahead"] li, [class*="suggestion"] li, [class*="dropdown"] li, [role="option"], [role="listbox"] li',
        );
        const lowerName = name.toLowerCase();
        for (const item of items) {
            const text = (item.textContent || "").toLowerCase();
            if (
                text.includes(lowerName) ||
                lowerName.split(" ").every((part) => text.includes(part))
            ) {
                item.click();
                return item.textContent.trim().substring(0, 60);
            }
        }
        return null;
    }, providerName);

    if (clickedDropdown) {
        console.log(`   ✅ Clicked dropdown: "${clickedDropdown}"`);
    } else {
        await safeAct(
            stagehand,
            `Click on the search suggestion or dropdown item that matches "${providerName}"`,
            `Click dropdown for ${providerName}`,
        );
    }

    await sleep(6000);

    // Check for rate-limit / block error
    const blocked = await page.evaluate(() =>
        document.body.innerText.includes("aren't able to complete"),
    );
    if (blocked) {
        console.log("   🚫 Search blocked — site returned rate-limit error");
        return { blocked: true };
    }

    return { blocked: false };
}

/* ─── Detail page ───────────────────────────────────────────────── */

/**
 * Click the provider's name link to open their detail page.
 */
export async function openProviderDetail(page, stagehand, providerName) {
    const nameParts = providerName.split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    console.log("   🔗 Opening provider detail page...");
    const detailOpened = await page.evaluate(
        ([first, last]) => {
            const allLinks = document.querySelectorAll("a");
            for (const link of allLinks) {
                const text = (link.textContent || "").toLowerCase();
                if (
                    text.includes(first.toLowerCase()) &&
                    text.includes(last.toLowerCase())
                ) {
                    link.click();
                    return { text: link.textContent.trim().substring(0, 60) };
                }
            }
            return null;
        },
        [firstName, lastName],
    );

    if (detailOpened) {
        console.log(`   ✅ Opened detail page: "${detailOpened.text}"`);
        await sleep(6000);
    } else {
        console.log("   ⚠️ Trying Stagehand to click provider...");
        await safeAct(
            stagehand,
            `Click on the provider name "${providerName}" or the "View details" link to open their detail page`,
            `Open ${providerName} detail page`,
        );
        await sleep(6000);
    }
}

/* ─── Data extraction ───────────────────────────────────────────── */

/**
 * Extract structured provider data from the detail page via Stagehand.
 */
export async function extractProviderData(stagehand, providerName) {
    try {
        const result = await stagehand.extract({
            instruction:
                "Extract the provider details for the doctor shown on this page. Get their full name with credentials, specialty, address, phone, and whether they are accepting new patients.",
            schema: z.object({
                name: z.string().describe("Full name with credentials"),
                specialty: z.string().describe("Medical specialty"),
                address: z.string().describe("Full address"),
                phone: z.string().describe("Phone number"),
                acceptingNewPatients: z
                    .boolean()
                    .describe("Accepting new patients"),
            }),
        });
        console.log(`   📋 Extracted: ${result.name} | ${result.specialty}`);
        return result;
    } catch (err) {
        console.log(
            `   ⚠️ Extract failed: ${(err.message || "").substring(0, 60)}`,
        );
        return {
            name: providerName,
            specialty: "N/A",
            address: "N/A",
            phone: "N/A",
            acceptingNewPatients: false,
        };
    }
}
