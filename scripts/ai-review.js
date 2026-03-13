/**
 * AI Screenshot Review Script
 *
 * Fetches scan results where status='found' and ai_reviewed=false,
 * sends each screenshot to Gemini for verification, and stores
 * the AI's suggestion back in the database.
 *
 * Usage:
 *   node scripts/ai-review.js               # review all pending
 *   node scripts/ai-review.js --limit 5     # review max 5 rows
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Config ──────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const MODEL = google("gemini-2.5-flash");

const REVIEW_PROMPT = `You are an insurance provider listing quality reviewer.

You are given a screenshot from an insurance company's "Find a Doctor" directory page showing a provider's listing details.

Analyze the screenshot and verify whether the provider listing looks correct and complete. Check for:

1. **Provider Name** — Is the name clearly displayed?
2. **Specialty** — Is the medical specialty listed?
3. **Address** — Is a complete practice address shown?
4. **Phone Number** — Is a phone number visible?
5. **Accepting New Patients** — Is there an indicator for whether they accept new patients?
6. **Network Status** — Is their network/plan participation clear?
7. **Overall Listing Quality** — Does the listing look professional and complete?

Respond with a concise assessment in this format:

**Status**: ✅ Listing looks correct / ⚠️ Needs attention / ❌ Issues found
**Summary**: One-line summary of the listing quality.
**Details**: Brief list of what's present and any issues or improvements needed.

Keep your response under 200 words. Be specific and actionable.`;

// ─── CLI args ────────────────────────────────────────
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = { limit: 50 };
    for (let i = 0; i < args.length; i += 2) {
        if (args[i] === "--limit") opts.limit = parseInt(args[i + 1]) || 50;
    }
    return opts;
}

// ─── Main ────────────────────────────────────────────
async function main() {
    const opts = parseArgs();
    console.log("🤖 AI Screenshot Review");
    console.log(`   Model: Gemini 2.0 Flash`);
    console.log(`   Limit: ${opts.limit} rows\n`);

    // 1. Fetch unreviewed rows
    const { data: rows, error: fetchErr } = await supabase
        .from("scan_results")
        .select("id, provider_name, location_name, insurance_name, screenshot_url")
        .eq("status", "found")
        .eq("ai_reviewed", false)
        .not("screenshot_url", "is", null)
        .order("scanned_at", { ascending: false })
        .limit(opts.limit);

    if (fetchErr) {
        console.error("❌ Failed to fetch rows:", fetchErr.message);
        process.exit(1);
    }

    if (!rows || rows.length === 0) {
        console.log("✅ No unreviewed screenshots found. All done!");
        return;
    }

    console.log(`📋 Found ${rows.length} screenshots to review\n`);

    let reviewed = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const label = `[${i + 1}/${rows.length}] ${row.provider_name} @ ${row.location_name}`;
        console.log(`🔍 ${label}`);

        try {
            // 2. Send screenshot URL to Gemini for analysis
            const { text } = await generateText({
                model: MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: REVIEW_PROMPT },
                            {
                                type: "image",
                                image: new URL(row.screenshot_url),
                            },
                        ],
                    },
                ],
            });

            const suggestion = text.trim();
            console.log(`   💡 ${suggestion.split("\n")[0]}`);

            // 3. Update the row with suggestion and flag
            const { error: updateErr } = await supabase
                .from("scan_results")
                .update({
                    ai_suggestion: suggestion,
                    ai_reviewed: true,
                })
                .eq("id", row.id);

            if (updateErr) {
                console.log(`   ⚠️ DB update failed: ${updateErr.message}`);
                failed++;
            } else {
                console.log(`   ✅ Saved`);
                reviewed++;
            }
        } catch (err) {
            console.log(`   ❌ AI error: ${(err.message || "").substring(0, 100)}`);
            failed++;
        }

        // Brief pause between API calls to avoid rate limits
        if (i < rows.length - 1) {
            await new Promise((r) => setTimeout(r, 2000));
        }
    }

    console.log(`\n${"═".repeat(50)}`);
    console.log(`✅ Reviewed: ${reviewed} | ❌ Failed: ${failed} | Total: ${rows.length}`);
    console.log(`${"═".repeat(50)}\n`);
}

main().catch((err) => {
    console.error("\n❌ Fatal error:", err.message);
    process.exit(1);
});
