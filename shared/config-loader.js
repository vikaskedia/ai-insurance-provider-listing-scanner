/**
 * Config loader — reads and queries config.json.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "config.json");

/**
 * Load and parse the master config.json.
 * @returns {object}
 */
export function loadConfig() {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

/**
 * Get the insurance object by its id.
 */
export function getInsurance(config, insuranceId) {
    return config.insurances.find((i) => i.id === insuranceId);
}

/**
 * Get all task entries for a given insurance type.
 */
export function getTasksForInsurance(config, insuranceId) {
    return config.tasks.filter((t) => t.insuranceId === insuranceId);
}

/**
 * Look up a single task ID for a specific combination.
 * @returns {number|null}
 */
export function getTaskId(config, insuranceId, providerId, locationId) {
    const entry = config.tasks.find(
        (t) =>
            t.insuranceId === insuranceId &&
            t.providerId === providerId &&
            t.locationId === locationId,
    );
    return entry ? entry.taskId : null;
}
