'use server';

import { revalidatePath } from 'next/cache';
import { reserve, setAppointmentStatus, attachContact } from '@/lib/data';
import type { AppointmentStatus } from '@/lib/types';

export interface StaffActionState {
  error?: string;
  ok?: string;
  code?: string;
}

/**
 * Walk-ins go through the SAME reserve() call as an online booking
 * (REQUIREMENTS.md §9). A walk-in booked for 11:40 and a client booking 11:40
 * on their phone compete for the same barber-time atomically — there is no
 * second code path to leave a hole between them.
 *
 * Two differences only, both deliberate:
 *   - source = 'staff', for reporting, never for behaviour
 *   - no mobile required: contact capture is one-tap skippable and must never
 *     block the chair (REQUIREMENTS.md §3, open A)
 */
export async function bookWalkIn(
  _prev: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const startImmediately = formData.get('when') === 'now';
  const startsAt = startImmediately
    ? new Date().toISOString()
    : String(formData.get('startsAt') ?? '');

  if (!startsAt) return { error: 'Pick a time for the walk-in.' };

  try {
    const result = await reserve({
      shopId: String(formData.get('shopId') ?? ''),
      barberId: String(formData.get('barberId') ?? ''),
      serviceId: String(formData.get('serviceId') ?? ''),
      startsAt,
      source: 'staff',
      clientName: String(formData.get('name') ?? '').trim() || null,
      clientMobile: String(formData.get('mobile') ?? '').trim() || null,
      createdBy: String(formData.get('barberId') ?? ''),
      startImmediately,
    });

    if (!result.ok) return { error: result.message, code: result.code };

    revalidatePath('/staff', 'layout');
    revalidatePath('/manager', 'layout');
    return { ok: startImmediately ? 'In the chair.' : 'Booked in.' };
  } catch (err) {
    console.error('[bookWalkIn] unexpected failure', err);
    return { error: 'Could not book that. Nothing was saved — try again.' };
  }
}

export async function updateStatus(
  _prev: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const id = String(formData.get('appointmentId') ?? '');
  const status = String(formData.get('status') ?? '') as AppointmentStatus;

  try {
    await setAppointmentStatus(id, status);
    revalidatePath('/staff', 'layout');
    revalidatePath('/manager', 'layout');
    return { ok: 'Updated.' };
  } catch (err) {
    console.error('[updateStatus] unexpected failure', err);
    return { error: 'Could not update that appointment.' };
  }
}

/**
 * The win-back lever (REQUIREMENTS.md §6). A walk-in-only client is invisible
 * to reminders and rebooking prompts until someone attaches a number, and most
 * shops in this estate are walk-in shops. This is a UX problem, not a data
 * model problem — so the control is one tap, after the fact, never a gate.
 */
export async function captureContact(
  _prev: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const clientId = String(formData.get('clientId') ?? '');
  const mobile = String(formData.get('mobile') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();

  if (!clientId) return { error: 'No client record on that appointment.' };
  if (!mobile) return { error: 'Enter a mobile number.' };

  try {
    await attachContact(clientId, mobile, name || undefined);
    revalidatePath('/staff', 'layout');
    return { ok: 'Number saved.' };
  } catch (err) {
    console.error('[captureContact] unexpected failure', err);
    return { error: 'That number could not be saved — it may already be on another client.' };
  }
}
