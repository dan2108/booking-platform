'use client';

import { useActionState, useState } from 'react';
import { bookWalkIn, type StaffActionState } from '@/app/staff/actions';
import { money, duration } from '@/lib/format';
import type { Service } from '@/lib/types';
import type { Slot } from '@/lib/availability';

export function WalkInSheet({
  shopId,
  barberId,
  services,
  slotsByService,
}: {
  shopId: string;
  barberId: string;
  services: Service[];
  /** Slots are per-service: a 45-minute cut has fewer openings than a 15-minute one. */
  slotsByService: Record<string, Slot[]>;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [slot, setSlot] = useState('');
  const [state, action, pending] = useActionState<StaffActionState, FormData>(bookWalkIn, {});

  const laterSlots = slotsByService[serviceId] ?? [];

  if (state.ok && open) {
    setTimeout(() => setOpen(false), 10);
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4">
        <button
          onClick={() => setOpen(true)}
          className="btn btn-primary pointer-events-auto mx-auto w-full max-w-md shadow-2xl"
        >
          + Walk-in
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/80 backdrop-blur-sm sm:items-center">
          <div className="reveal w-full max-w-md max-h-[92vh] overflow-y-auto border-t border-ink-3 bg-ink-2 sm:border">
            <div className="pole-rule" />

            <form action={action}>
              <input type="hidden" name="shopId" value={shopId} />
              <input type="hidden" name="barberId" value={barberId} />
              <input type="hidden" name="serviceId" value={serviceId} />
              <input type="hidden" name="when" value={when} />
              <input type="hidden" name="startsAt" value={when === 'later' ? slot : ''} />

              <div className="flex items-center justify-between border-b border-ink-3 px-5 py-4">
                <h2 className="text-2xl">Walk-in</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="font-mono text-xs uppercase tracking-widest text-muted hover:text-bone"
                >
                  Close
                </button>
              </div>

              {/* ------------------------------------------------- when -- */}
              <div className="grid grid-cols-2 gap-px border-b border-ink-3 bg-ink-3">
                {(['now', 'later'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWhen(w)}
                    className={`px-4 py-4 font-mono text-xs uppercase tracking-[0.14em] transition-colors ${
                      when === w ? 'bg-oxblood text-bone' : 'bg-ink-2 text-muted hover:text-bone'
                    }`}
                  >
                    {w === 'now' ? 'In the chair now' : 'Come back later'}
                  </button>
                ))}
              </div>

              {/* ---------------------------------------------- service -- */}
              <div className="border-b border-ink-3 px-5 py-4">
                <p className="eyebrow">Service</p>
                <div className="mt-3 grid gap-px bg-ink-3">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setServiceId(s.id); setSlot(''); }}
                      className={`flex items-baseline justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                        serviceId === s.id ? 'bg-oxblood text-bone' : 'bg-ink-2 hover:bg-ink-3'
                      }`}
                    >
                      <span className="truncate text-sm">{s.name}</span>
                      <span className="num shrink-0 text-xs">
                        {duration(s.duration_minutes)} · {money(s.price_pence)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ------------------------------------------------- slot -- */}
              {when === 'later' && (
                <div className="border-b border-ink-3 px-5 py-4">
                  <p className="eyebrow">Come back at</p>
                  {laterSlots.length === 0 ? (
                    <p className="mt-3 text-sm text-muted">Nothing left today.</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {laterSlots.slice(0, 16).map((s) => (
                        <button
                          key={s.startsAt}
                          type="button"
                          onClick={() => setSlot(s.startsAt)}
                          className={`num border py-2 text-sm transition-colors ${
                            slot === s.startsAt
                              ? 'border-oxblood bg-oxblood text-bone'
                              : 'border-ink-4 text-bone hover:border-bone-3'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ---------------------------------------------- contact -- */}
              <div className="px-5 py-4">
                <p className="eyebrow">Contact — optional</p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Skip it. A number is what makes this client reachable for a reminder or a
                  win-back later, but it is never a blocker at the chair.
                </p>
                <div className="mt-3 space-y-2">
                  <input
                    name="name"
                    placeholder="Name (optional)"
                    className="w-full border border-ink-4 bg-ink px-3 py-2.5 text-sm text-bone outline-none placeholder:text-muted-2 focus:border-bone-3"
                  />
                  <input
                    name="mobile"
                    type="tel"
                    inputMode="tel"
                    placeholder="Mobile (optional)"
                    className="num w-full border border-ink-4 bg-ink px-3 py-2.5 text-sm text-bone outline-none placeholder:text-muted-2 focus:border-bone-3"
                  />
                </div>

                {state.error && (
                  <p className="mt-3 border-l-2 border-oxblood px-3 py-2 text-sm text-oxblood-hi" role="alert">
                    {state.error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pending || (when === 'later' && !slot)}
                  className="btn btn-primary mt-4 w-full"
                >
                  {pending
                    ? 'Reserving…'
                    : when === 'now'
                      ? 'Start now'
                      : 'Book them in'}
                </button>

                <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-muted">
                  Same reservation path as an online booking — if a client is mid-checkout for
                  this slot on their phone, exactly one of you gets it.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
