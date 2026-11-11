-- gen_random_bytes() is used as a product slug default. Supabase already
-- ships pgcrypto in the extensions schema; this is a no-op when it exists.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path TO public, extensions;
