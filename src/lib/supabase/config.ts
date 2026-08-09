/**
 * Public Supabase connection details.
 *
 * These two values are public by design. The URL is a hostname and the
 * publishable key identifies the project, not a person — it grants exactly
 * what the `anon` Row-Level Security policies grant and nothing more (see
 * supabase/migrations/0008_public_booking_access.sql: shops, bookable barbers,
 * the price list, and working hours). Every Supabase app ships this key to the
 * browser; that is what it is for.
 *
 * The SECRET is `SUPABASE_SERVICE_ROLE_KEY`, which lives only in the
 * environment, is never prefixed `NEXT_PUBLIC_`, and never appears in this
 * file or any other committed one.
 *
 * Environment variables win where set, so a different project can be pointed
 * at without touching code.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ksogyqkbecvnoiduljxq.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_dqe0xsSnug0-c244S1FKCA_Z_JagZJ0';
