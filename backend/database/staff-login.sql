-- Adds password support to the existing staff table.
-- Existing staff rows stay unchanged until a hash is assigned.

ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS password_hash TEXT;