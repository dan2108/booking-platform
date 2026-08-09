'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { bookAppointment, type BookingFormState } from '@/app/book/actions';
import type { Slot } from '@/lib/availability';

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-paper w-full" disabled={disabled || pending}>
      {pending ? 'Reserving…' : 'Confirm booking'}
    </button>
  );
}

export function BookingForm({
  shopId,
  barberId,
  serviceId,
  serviceName,
  slots,
  dayLabel,
}: {
  shopId: string;
  barberId: string;
  serviceId: string;
  serviceName: string;
  slots: Slot[];
  dayLabel: string;
}) {
  const [selected, setSelected] = useState<string>('');
  const [state, formAction] = useActionState<BookingFormState, FormData>(bookAppointment, {});

  // If the slot was lost to someone else, clear the selection so the client
  // cannot resubmit the same dead time.
  const lost = state.code === 'slot_taken';

  return (
    <form action={formAction} className="paper">
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="barberId" value={barberId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="startsAt" value={lost ? '' : selected} />

      <div className="border-b border-bone-3 px-6 py-6 sm:px-8">
        <p className="eyebrow">Step 3 · Pick a time</p>
        <h2 className="mt-1 text-2xl">{dayLabel}</h2>
        <p className="mt-1 text-sm text-muted-2">
          {serviceName} · {slots.length} {slots.length === 1 ? 'slot' : 'slots'} free
        </p>

        {slots.length === 0 ? (
          <p className="mt-6 border border-bone-3 px-4 py-6 text-center text-sm text-muted-2">
            Nothing left on this day. Try another date above.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.map((slot, i) => (
              <button
                key={slot.startsAt}
                type="button"
                className="slot reveal"
                style={{ animationDelay: `${Math.min(i * 12, 300)}ms` }}
                data-selected={selected === slot.startsAt && !lost}
                onClick={() => setSelected(slot.startsAt)}
              >
                {slot.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-6 sm:px-8">
        <p className="eyebrow">Step 4 · Your details</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-2">
          No account, no password. Your mobile number <em>is</em> your account — next time we
          recognise you and bring your history and usual barber with you.
        </p>

        <div className="mt-5 space-y-3">
          <input className="field" name="name" placeholder="Name" autoComplete="name" required />
          <input
            className="field"
            name="mobile"
            type="tel"
            inputMode="tel"
            placeholder="Mobile number"
            autoComplete="tel"
            required
          />
          <input
            className="field"
            name="email"
            type="email"
            placeholder="Email (optional — for your confirmation)"
            autoComplete="email"
          />
        </div>

        {state.error && (
          <p
            className={`mt-4 border-l-2 px-4 py-3 text-sm ${
              lost ? 'border-brass-lo bg-bone-2 text-ink' : 'border-oxblood bg-bone-2 text-oxblood-lo'
            }`}
            role="alert"
          >
            {state.error}
            {lost && (
              <span className="mt-1 block text-xs text-muted-2">
                Someone reserved it a moment before you. Pick another time above — nothing was
                charged and nothing was half-booked.
              </span>
            )}
          </p>
        )}

        <div className="mt-5">
          <SubmitButton disabled={!selected || lost} />
        </div>

        <p className="mt-4 text-center text-xs text-muted-2">
          Payment is taken in the shop. We never hold your card details.
        </p>
      </div>
    </form>
  );
}
