-- Add AI review columns to scan_results
-- Run this in your Supabase SQL Editor

ALTER TABLE scan_results
  ADD COLUMN IF NOT EXISTS ai_reviewed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_suggestion TEXT;
