-- Safe Combined Migrations for Test Database
-- This version continues execution even if individual statements fail
-- Useful for idempotent migrations where some objects may already exist

-- Enable error continuation
SET client_min_messages TO WARNING;

-- Run all migrations from combined file
-- Note: Some "already exists" errors are expected and can be ignored
