/**
 * Smoke test — run this first, before the demo.
 *
 *   pnpm smoke
 *
 * Answers the only questions that matter on the morning of:
 *   - can we reach the database at all
 *   - is the service-role key wired up (staff surfaces work) or not
 *   - is the seed fresh, or is "today" going to look half empty
 *   - is the guarantee still holding
 *
 * Exits non-zero if something is actually broken, so it is safe in CI too.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// minimal .env.local reader — avoids a dependency for one file
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // no .env.local — the public defaults still let us check the booking flow
}

const URL_ =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ksogyqkbecvnoiduljxq.supabase.co';
const PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_dqe0xsSnug0-c244S1FKCA_Z_JagZJ0';
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);
const warn = (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`);

let failed = false;

async function main() {
  console.log('\nSharp & Sons — pre-demo smoke test\n');

  // ---------------------------------------------------- public booking path --
  console.log('Public booking (needs no secret):');
  const pub = createClient(URL_, PUBLIC_KEY, { auth: { persistSession: false } });

  const { data: shops, error: shopErr } = await pub.from('shops').select('name, slug, is_pilot');
  if (shopErr || !shops?.length) {
    bad(`cannot read shops — ${shopErr?.message ?? 'none found'}`);
    failed = true;
  } else {
    ok(`${shops.length} shops (pilot: ${shops.find((s) => s.is_pilot)?.slug ?? 'none'})`);
  }

  const { data: services } = await pub.from('services').select('name').eq('is_active', true);
  if (services?.length) ok(`${services.length} services in the catalogue`);
  else { bad('no services'); failed = true; }

  const { data: barbers } = await pub.from('staff').select('id, name').eq('role', 'barber');
  if (barbers?.length) ok(`${barbers.length} bookable barbers`);
  else { bad('no barbers'); failed = true; }

  // an anonymous visitor must NOT be able to read client records
  const { data: leaked } = await pub.from('clients').select('id').limit(1);
  if (leaked?.length) {
    bad('client records are readable with the PUBLIC key — that is a leak');
    failed = true;
  } else {
    ok('client records are not readable with the public key');
  }

  // ------------------------------------------------------- staff surfaces --
  console.log('\nStaff surfaces (need the service-role key):');
  if (!SECRET) {
    warn('SUPABASE_SERVICE_ROLE_KEY is not set — staff/manager/admin will show the locked notice');
    warn('see DEPLOY.md step 1');
  } else {
    const svc = createClient(URL_, SECRET, { auth: { persistSession: false } });
    const { data: stats, error } = await svc.rpc('company_stats');
    if (error) {
      bad(`service key rejected — ${error.message}`);
      failed = true;
    } else {
      ok('service-role key works — every surface will render');
      const t = (stats as { totals: Record<string, number> }).totals;
      ok(`${t.appointments_last_28.toLocaleString('en-GB')} appointments in the last 28 days`);
      ok(`${t.clients} clients, ${Math.round((t.contactable / t.clients) * 100)}% contactable`);
    }

    // ----------------------------------------------------- is today alive --
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const { count } = await svc
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', startOfToday.toISOString())
      .lt('starts_at', endOfToday.toISOString());

    console.log('\nDemo data freshness:');
    if (!count) {
      bad('nothing in the book for TODAY — reseed before the meeting');
      warn('Supabase SQL editor:  select seed_demo_data();');
      failed = true;
    } else {
      ok(`${count} appointments today — the calendar will look alive`);
    }

    // ------------------------------------------------------ the guarantee --
    console.log('\nThe guarantee:');
    const { data: proof, error: proofErr } = await svc.rpc('proof_no_double_booking');
    if (proofErr) {
      bad(`proof could not run — ${proofErr.message}`);
      failed = true;
    } else {
      const p = proof as { ok: boolean; all_passed: boolean; steps: { pass: boolean }[] };
      if (p.ok && p.all_passed) {
        ok(`all ${p.steps.length} constraint cases pass`);
      } else {
        bad('THE GUARANTEE IS NOT HOLDING — do not demo this');
        failed = true;
      }
    }
  }

  console.log(
    failed
      ? '\n\x1b[31mSomething needs fixing before you demo.\x1b[0m\n'
      : '\n\x1b[32mReady. Run pnpm dev, then follow docs/DEMO.md.\x1b[0m\n'
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  bad(`could not reach the database — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
