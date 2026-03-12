/**
 * General utility helpers shared across all scrapers.
 */

/**
 * Run stagehand.act() with error handling.
 * @returns {Promise<boolean>} true on success
 */
export async function safeAct(stagehand, instruction, label) {
    try {
        await stagehand.act(instruction);
        console.log(`   ✅ ${label || instruction.substring(0, 50)}`);
        return true;
    } catch (err) {
        console.log(
            `   ⚠️ ${label || "act()"} failed: ${(err.message || "").substring(0, 80)}`,
        );
        return false;
    }
}

/**
 * Create a URL-safe slug from any string.
 * "Dr. Barbara Huynh, DO" → "dr_barbara_huynh_do"
 */
export function slugify(name) {
    return name
        .replace(/[^a-zA-Z0-9 ,.-]/g, "")
        .replace(/[,.\s]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase()
        .substring(0, 80);
}

/** Pad string to fixed width for console tables */
export function pad(str, len) {
    return (str || "N/A").substring(0, len - 1).padEnd(len);
}

/** Promisified sleep */
export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Print a boxed banner to stdout.
 * @param {string[]} lines
 */
export function banner(lines) {
    const width = 55;
    const bar = "═".repeat(width);
    console.log(bar);
    for (const line of lines) console.log(`  ${line}`);
    console.log(bar + "\n");
}
