-- Insurance Provider Scan Results — Supabase Schema
-- Run this SQL in your Supabase dashboard at sb.aiworkspace.pro

-- 1. Create the scan_results table
CREATE TABLE IF NOT EXISTS scan_results (
    id BIGSERIAL PRIMARY KEY,
    insurance_id TEXT NOT NULL,
    insurance_name TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    provider_type TEXT,
    location_id TEXT NOT NULL,
    location_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('found', 'not_found', 'error', 'blocked')),
    specialty TEXT,
    address TEXT,
    phone TEXT,
    accepting_new_patients BOOLEAN DEFAULT FALSE,
    screenshot_url TEXT,
    task_id INTEGER,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes for report queries
CREATE INDEX IF NOT EXISTS idx_scan_results_insurance ON scan_results(insurance_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_provider ON scan_results(provider_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_location ON scan_results(location_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_status ON scan_results(status);
CREATE INDEX IF NOT EXISTS idx_scan_results_scanned_at ON scan_results(scanned_at DESC);

-- 3. Enable Row Level Security (RLS) and allow public read
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (for the report UI using anon key)
CREATE POLICY "Allow public read on scan_results"
    ON scan_results
    FOR SELECT
    USING (true);

-- Allow service role to insert/update/delete
CREATE POLICY "Allow service role full access on scan_results"
    ON scan_results
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 4. Create the storage bucket (run this via Supabase dashboard or API)
-- Bucket name: scan-screenshots
-- Public access: enabled
-- Note: You need to create the bucket manually in your Supabase Storage dashboard.
-- Set it to public so screenshot URLs are accessible without auth.
