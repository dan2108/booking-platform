'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase/server';

export interface RotaActionState {
  error?: string;
  ok?: string;
}

/**
 * Rota editing is manager-owned, not self-serve (REQUIREMENTS.md §5, v2
 * decision 4). Barbers are read-only on their own rota.
 *
 * This writes the pattern for ONE weekday. Blank times mean "not working that
 * day", which deletes the row rather than storing a zero-length shift.
 */
export async function saveRotaDay(
  _prev: RotaActionState,
  formData: FormData
): Promise<RotaActionState> {
  const staffId = String(formData.get('staffId') ?? '');
  const weekday = Number(formData.get('weekday'));
  const start = String(formData.get('start') ?? '').trim();
  const end = String(formData.get('end') ?? '').trim();

  if (!staffId || !weekday) return { error: 'Missing barber or day.' };

  try {
    if (!start || !end) {
      const { error } = await db
        .from('rota_patterns')
        .delete()
        .eq('staff_id', staffId)
        .eq('weekday', weekday);
      if (error) throw error;
      revalidatePath('/manager', 'layout');
      return { ok: 'Day off saved.' };
    }

    if (end <= start) return { error: 'The finish time has to be after the start time.' };

    const { error } = await db
      .from('rota_patterns')
      .upsert(
        { staff_id: staffId, weekday, start_time: start, end_time: end },
        { onConflict: 'staff_id,weekday' }
      );
    if (error) throw error;

    revalidatePath('/manager', 'layout');
    revalidatePath('/book', 'layout');
    return { ok: 'Saved.' };
  } catch (err) {
    console.error('[saveRotaDay] unexpected failure', err);
    return { error: 'Could not save that rota change.' };
  }
}

/** Holidays and one-off changes, which override the weekly pattern for a date. */
export async function saveRotaException(
  _prev: RotaActionState,
  formData: FormData
): Promise<RotaActionState> {
  const staffId = String(formData.get('staffId') ?? '');
  const date = String(formData.get('date') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || null;
  const start = String(formData.get('start') ?? '').trim() || null;
  const end = String(formData.get('end') ?? '').trim() || null;

  if (!staffId || !date) return { error: 'Pick a barber and a date.' };
  if ((start && !end) || (!start && end)) return { error: 'Give both a start and a finish, or neither.' };

  try {
    const { error } = await db
      .from('rota_exceptions')
      .upsert(
        { staff_id: staffId, date, start_time: start, end_time: end, reason },
        { onConflict: 'staff_id,date' }
      );
    if (error) throw error;

    revalidatePath('/manager', 'layout');
    revalidatePath('/book', 'layout');
    return { ok: start ? 'Hours changed for that date.' : 'Day off saved.' };
  } catch (err) {
    console.error('[saveRotaException] unexpected failure', err);
    return { error: 'Could not save that change.' };
  }
}

export async function deleteRotaException(
  _prev: RotaActionState,
  formData: FormData
): Promise<RotaActionState> {
  const id = String(formData.get('exceptionId') ?? '');
  const staffId = String(formData.get('staffId') ?? '');
  const date = String(formData.get('date') ?? '');

  try {
    const query = db.from('rota_exceptions').delete();
    const { error } = id
      ? await query.eq('id', id)
      : await query.eq('staff_id', staffId).eq('date', date);
    if (error) throw error;

    revalidatePath('/manager', 'layout');
    revalidatePath('/book', 'layout');
    return { ok: 'Removed.' };
  } catch (err) {
    console.error('[deleteRotaException] unexpected failure', err);
    return { error: 'Could not remove that.' };
  }
}
