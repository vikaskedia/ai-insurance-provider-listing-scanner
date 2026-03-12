/**
 * Supabase client & helpers — scan results + screenshot storage.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { basename } from "path";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client = null;

function getClient() {
    if (!_client) {
        if (!supabaseUrl || !supabaseKey) {
            console.warn("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase disabled");
            return null;
        }
        _client = createClient(supabaseUrl, supabaseKey);
    }
    return _client;
}

/**
 * Upload a local screenshot file to Supabase Storage.
 *
 * @param {string} localPath  – absolute file path on disk
 * @param {string} storagePath – path inside the bucket, e.g. "blueshield/los-angeles/dr_foo.png"
 * @returns {Promise<string|null>} public URL or null on failure
 */
export async function uploadScreenshot(localPath, storagePath) {
    const client = getClient();
    if (!client) return null;

    try {
        const fileBuffer = readFileSync(localPath);
        const { error } = await client.storage
            .from("scan-screenshots")
            .upload(storagePath, fileBuffer, {
                contentType: "image/png",
                upsert: true,
            });

        if (error) {
            console.log(`   ⚠️ Screenshot upload failed: ${error.message}`);
            return null;
        }

        const { data: urlData } = client.storage
            .from("scan-screenshots")
            .getPublicUrl(storagePath);

        console.log(`   ☁️  Screenshot uploaded: ${storagePath}`);
        return urlData?.publicUrl || null;
    } catch (err) {
        console.log(`   ⚠️ Screenshot upload error: ${(err.message || "").substring(0, 80)}`);
        return null;
    }
}

/**
 * Insert one scan result row into the `scan_results` table.
 *
 * @param {object} result
 * @returns {Promise<object|null>} inserted row or null
 */
export async function insertScanResult(result) {
    const client = getClient();
    if (!client) return null;

    try {
        const { data, error } = await client
            .from("scan_results")
            .insert([{
                insurance_id: result.insuranceId,
                insurance_name: result.insuranceName,
                provider_id: result.providerId,
                provider_name: result.providerName,
                provider_type: result.providerType,
                location_id: result.locationId,
                location_name: result.locationName,
                status: result.status,
                specialty: result.specialty || null,
                address: result.address || null,
                phone: result.phone || null,
                accepting_new_patients: result.acceptingNewPatients || false,
                screenshot_url: result.screenshotUrl || null,
                task_id: result.taskId || null,
                scanned_at: new Date().toISOString(),
            }])
            .select()
            .single();

        if (error) {
            console.log(`   ⚠️ Supabase insert failed: ${error.message}`);
            return null;
        }

        console.log(`   💾 Saved to Supabase (id: ${data.id})`);
        return data;
    } catch (err) {
        console.log(`   ⚠️ Supabase insert error: ${(err.message || "").substring(0, 80)}`);
        return null;
    }
}

/**
 * Fetch scan results with optional filters.
 *
 * @param {object} [filters]
 * @param {string} [filters.insuranceId]
 * @param {string} [filters.locationId]
 * @param {string} [filters.status]
 * @returns {Promise<Array>}
 */
export async function fetchScanResults(filters = {}) {
    const client = getClient();
    if (!client) return [];

    let query = client
        .from("scan_results")
        .select("*")
        .order("scanned_at", { ascending: false });

    if (filters.insuranceId) query = query.eq("insurance_id", filters.insuranceId);
    if (filters.locationId) query = query.eq("location_id", filters.locationId);
    if (filters.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) {
        console.log(`   ⚠️ Supabase fetch error: ${error.message}`);
        return [];
    }
    return data || [];
}
