'use server';

import { redirect } from 'next/navigation';
import { reserve } from '@/lib/data';
import type { ReserveResult } from '@/lib/types';

export interface BookingFormState {
  error?: string;
  code?: string;
}

/**
 * The public booking write path.
 *
 * This runs on the server. The browser never holds a database credential and
 * cannot insert an appointment even if it tried — there is no INSERT policy on
 * `appointments` for any role, and reserve() is not granted to `anon`.
 *
 * "That slot just went" is returned as a normal outcome rather than thrown,
 * because losing a race is correct behaviour, not an error. Anything genuinely
 * unexpected still throws and surfaces.
 */
export async function bookAppointment(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const shopId = String(formData.get('shopId') ?? '');
  const barberId = String(formData.get('barberId') ?? '');
  const serviceId = String(formData.get('serviceId') ?? '');
  const startsAt = String(formData.get('startsAt') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const mobile = String(formData.get('mobile') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (!startsAt) return { error: 'Pick a time first.' };
  if (!name) return { error: 'We need a name for the appointment.' };
  if (!mobile) return { error: 'A mobile number is required to book online.' };

  let result: ReserveResult;
  try {
    result = await reserve({
      shopId,
      barberId,
      serviceId,
      startsAt,
      source: 'online',
      clientName: name,
      clientMobile: mobile,
      clientEmail: email || null,
    });
  } catch (err) {
    console.error('[reserve] unexpected failure', err);
    return { error: 'Something went wrong on our side. Nothing was booked — please try again.' };
  }

  if (!result.ok) {
    return { error: result.message, code: result.code };
  }

  redirect(`/book/confirmed/${result.appointment_id}`);
}
