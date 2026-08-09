import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';

/**
 * Server-side Supabase client.
 *
 * This module is `server-only`: importing it from a client component is a build
 * error, not a runtime surprise. That is the mechanical enforcement of
 * PLAN.md §2 — "the reservation is server-owned; no client-issued inserts into
 * `appointments`, ever."
 *
 * The browser bundle contains no Supabase credentials at all, because no
 * component in this app talks to the database directly. Every read is a server
 * component; every write is a server action or route handler.
 *
 * Two modes:
 *
 *   with SUPABASE_SERVICE_ROLE_KEY  — full staff-level access. Every surface
 *                                      works. This is the intended deployment.
 *
 *   without it                      — the server holds only the publishable
 *                                      key, so RLS treats it as an anonymous
 *                                      visitor. Public booking works (that is
 *                                      what migration 0008 is for); the staff
 *                                      surfaces render an honest notice rather
 *                                      than pretending, or crashing.
 *
 * Deliberately no third mode where policies are loosened to make a screen
 * render. The tenancy boundary is the product.
 */

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const usingServiceRole = Boolean(serviceKey);

export const db = createClient(SUPABASE_URL, serviceKey || SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-application-name': 'booking-platform' } },
});
