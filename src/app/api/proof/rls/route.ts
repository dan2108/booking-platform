import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * The tenancy deny-path proof (PLAN.md Layer 1 definition of done).
 *
 * Assumes each persona's identity in turn and reports what the DATABASE lets
 * them read — not what the UI chooses to render. A bug in these screens cannot
 * widen any of these numbers.
 */
export async function POST() {
  const [{ data: rls, error: e1 }, { data: constraint, error: e2 }] = await Promise.all([
    db.rpc('proof_rls_isolation'),
    db.rpc('proof_no_double_booking'),
  ]);

  if (e1 || e2) {
    return NextResponse.json(
      { error: (e1 ?? e2)?.message ?? 'proof failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({ rls, constraint });
}
