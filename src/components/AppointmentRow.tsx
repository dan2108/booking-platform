'use client';

import { useActionState, useState } from 'react';
import { updateStatus, captureContact, type StaffActionState } from '@/app/staff/actions';
import { time, timeRange, money, duration, prettyMobile, STATUS_LABEL } from '@/lib/format';
import type { AppointmentWithDetail } from '@/lib/types';

function StatusButton({
  appointmentId,
  status,
  label,
  variant = 'ghost',
}: {
  appointmentId: string;
  status: string;
  label: string;
  variant?: 'ghost' | 'primary';
}) {
  const [, action, pending] = useActionState<StaffActionState, FormData>(updateStatus, {});
  return (
    <form action={action} className="contents">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending}
        className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-ghost'} !px-3 !py-2 !text-[0.625rem]`}
      >
        {pending ? '…' : label}
      </button>
    </form>
  );
}

function ContactCapture({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<StaffActionState, FormData>(captureContact, {});

  if (state.ok) {
    return <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-widest text-jade-hi">✓ number saved</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 font-mono text-[0.625rem] uppercase tracking-widest text-brass underline underline-offset-4 hover:text-bone"
      >
        + Add number
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input
        name="mobile"
        type="tel"
        inputMode="tel"
        placeholder="07…"
        autoFocus
        className="num w-32 border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none focus:border-brass"
      />
      <button type="submit" disabled={pending} className="btn btn-ghost !px-3 !py-1.5 !text-[0.625rem]">
        {pending ? '…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-mono text-[0.625rem] uppercase tracking-widest text-muted hover:text-bone"
      >
        Skip
      </button>
      {state.error && <p className="w-full text-[0.6875rem] text-oxblood-hi">{state.error}</p>}
    </form>
  );
}

export function AppointmentRow({
  appt,
  isPast,
  startable,
}: {
  appt: AppointmentWithDetail;
  isPast: boolean;
  /**
   * Whether "Start" makes sense yet. A barber at 12:15 has no business
   * starting the 16:05 cut, and an accidental tap there would put a client in
   * the chair who is not in the building. Only the work that is actually in
   * front of them gets the button.
   */
  startable: boolean;
}) {
  const live = appt.status === 'in_progress';
  const done = appt.status === 'completed' || appt.status === 'no_show';
  const anonymous = !appt.client?.mobile;

  // A finished cut collapses to one line. A barber glancing at their phone
  // mid-shift needs to see NOW and NEXT without scrolling past the morning —
  // and the morning is not actionable any more. Everything still on the
  // timeline, nothing still shouting.
  if (done) {
    return (
      <article
        className={`appt appt-${appt.status} flex items-baseline gap-3 bg-ink-2/60 px-4 py-2 sm:px-5`}
      >
        <span className="num w-12 shrink-0 text-sm text-muted-2">{time(appt.starts_at)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {appt.client?.name ?? 'Walk-in'}
        </span>
        <span className="num shrink-0 text-xs text-muted-2">
          {money(appt.service.price_pence)}
        </span>
        <span
          className={`shrink-0 font-mono text-[0.5625rem] uppercase tracking-widest ${
            appt.status === 'no_show' ? 'text-oxblood-hi' : 'text-muted-2'
          }`}
        >
          {STATUS_LABEL[appt.status]}
        </span>
      </article>
    );
  }

  return (
    <article
      className={`appt appt-${appt.status} ${appt.at_risk ? 'appt-at-risk' : ''} bg-ink-2 px-4 py-4 sm:px-5`}
    >
      <div className="flex items-start gap-4">
        <div className="w-16 shrink-0">
          <p className={`num text-lg leading-none ${done ? 'text-muted' : 'text-bone'}`}>
            {time(appt.starts_at)}
          </p>
          <p className="num mt-1 text-[0.625rem] text-muted">
            {duration(appt.service.duration_minutes)}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={`truncate text-base ${done ? 'text-muted' : 'text-bone'}`}>
              {appt.client?.name ?? 'Walk-in'}
            </h3>
            {appt.source === 'staff' && <span className="tag text-muted">walk-in</span>}
            {live && <span className="tag pulse-jade text-jade-hi">in the chair</span>}
            {appt.at_risk && <span className="tag text-brass">running late</span>}
            {appt.status === 'no_show' && <span className="tag text-oxblood-hi">no-show</span>}
            {(appt.client?.no_show_count ?? 0) >= 2 && appt.status === 'booked' && (
              <span className="tag text-oxblood-hi">{appt.client!.no_show_count} no-shows</span>
            )}
          </div>

          <p className="mt-1 text-sm text-bone/50">
            {appt.service.name} · <span className="num">{money(appt.service.price_pence)}</span> ·{' '}
            <span className="num">{timeRange(appt.starts_at, appt.ends_at)}</span>
          </p>

          {appt.client?.mobile && (
            <p className="num mt-1 text-xs text-muted">{prettyMobile(appt.client.mobile)}</p>
          )}

          {anonymous && appt.client_id && <ContactCapture clientId={appt.client_id} />}
          {anonymous && !appt.client_id && (
            <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-widest text-muted">
              anonymous · uncontactable
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
              {appt.status === 'booked' && startable && (
                <StatusButton
                  appointmentId={appt.id}
                  status="in_progress"
                  label="Start"
                  variant="primary"
                />
              )}
              {live && (
                <StatusButton
                  appointmentId={appt.id}
                  status="completed"
                  label="Done"
                  variant="primary"
                />
              )}
              {appt.status === 'booked' && isPast && (
                <StatusButton appointmentId={appt.id} status="no_show" label="No-show" />
              )}
            {appt.status === 'booked' && (
              <StatusButton appointmentId={appt.id} status="cancelled" label="Cancel" />
            )}
          </div>

        </div>
      </div>

      {appt.at_risk && (
        <p className="mt-3 border-t border-ink-3 pt-3 text-xs leading-relaxed text-brass">
          The chair is still busy. This one is flagged, not moved — the system records what is
          actually happening and leaves the call to you.
        </p>
      )}
    </article>
  );
}
