-- Remove the temporary HTTP extension immediately after the one-time staging demo asset seed.
-- This mirrors the already-applied Supabase migration history and leaves no HTTP helper enabled.

drop extension if exists http;
