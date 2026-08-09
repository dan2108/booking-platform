'use client';

import { useActionState, useState } from 'react';
import {
  saveRotaDay,
  saveRotaException,
  deleteRotaException,
  type RotaActionState,
} from '@/app/manager/actions';
import type { RotaPattern, RotaException } from '@/lib/availability';

const DAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
];

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

function DayRow({
  staffId,
  weekday,
  label,
  pattern,
}: {
  staffId: string;
  weekday: number;
  label: string;
  pattern?: RotaPattern;
}) {
  const [state, action, pending] = useActionState<RotaActionState, FormData>(saveRotaDay, {});
  const [start, setStart] = useState(hhmm(pattern?.start_time));
  const [end, setEnd] = useState(hhmm(pattern?.end_time));
  const off = !start || !end;

  return (
    <form action={action} className="flex items-center gap-2 border-b border-ink-3 px-3 py-2.5">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="weekday" value={weekday} />

      <span className="w-10 shrink-0 font-mono text-[0.6875rem] uppercase tracking-widest text-muted">
        {label}
      </span>

      <input
        name="start"
        type="time"
        step={900}
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="num w-24 border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none focus:border-oxblood-hi"
      />
      <span className="text-muted">–</span>
      <input
        name="end"
        type="time"
        step={900}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="num w-24 border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none focus:border-oxblood-hi"
      />

      {off && (
        <span className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">off</span>
      )}

      <button type="submit" disabled={pending} className="btn btn-ghost ml-auto !px-3 !py-1.5 !text-[0.625rem]">
        {pending ? '…' : 'Save'}
      </button>

      {state.ok && <span className="font-mono text-[0.625rem] text-jade-hi">✓</span>}
      {state.error && <span className="font-mono text-[0.625rem] text-oxblood-hi">{state.error}</span>}
    </form>
  );
}

function ExceptionForm({ staffId }: { staffId: string }) {
  const [state, action, pending] = useActionState<RotaActionState, FormData>(saveRotaException, {});
  const [mode, setMode] = useState<'off' | 'hours'>('off');

  return (
    <form action={action} className="space-y-2 px-3 py-3">
      <input type="hidden" name="staffId" value={staffId} />

      <div className="flex gap-px bg-ink-3">
        {(['off', 'hours'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-2 font-mono text-[0.625rem] uppercase tracking-widest transition-colors ${
              mode === m ? 'bg-oxblood text-bone' : 'bg-ink-2 text-muted hover:text-bone'
            }`}
          >
            {m === 'off' ? 'Day off' : 'Different hours'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          name="date"
          type="date"
          required
          className="num border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none focus:border-oxblood-hi"
        />
        {mode === 'hours' && (
          <>
            <input
              name="start"
              type="time"
              step={900}
              required
              className="num w-24 border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none focus:border-oxblood-hi"
            />
            <span className="text-muted">–</span>
            <input
              name="end"
              type="time"
              step={900}
              required
              className="num w-24 border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none focus:border-oxblood-hi"
            />
          </>
        )}
      </div>

      <input
        name="reason"
        placeholder="Reason (annual leave, dentist…)"
        className="w-full border border-ink-4 bg-ink px-2 py-1.5 text-sm text-bone outline-none placeholder:text-muted-2 focus:border-oxblood-hi"
      />

      <button type="submit" disabled={pending} className="btn btn-ghost w-full !py-2 !text-[0.625rem]">
        {pending ? '…' : 'Add exception'}
      </button>

      {state.ok && <p className="font-mono text-[0.625rem] text-jade-hi">✓ {state.ok}</p>}
      {state.error && <p className="font-mono text-[0.625rem] text-oxblood-hi">{state.error}</p>}
    </form>
  );
}

function ExceptionRow({
  staffId,
  exception,
}: {
  staffId: string;
  exception: RotaException & { reason?: string | null };
}) {
  const [, action, pending] = useActionState<RotaActionState, FormData>(deleteRotaException, {});
  return (
    <form action={action} className="flex items-center gap-3 border-b border-ink-3 px-3 py-2">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="date" value={exception.date} />
      <span className="num text-xs text-bone">{exception.date}</span>
      <span className="font-mono text-[0.625rem] uppercase tracking-widest text-brass">
        {exception.start_time
          ? `${hhmm(exception.start_time)}–${hhmm(exception.end_time)}`
          : 'day off'}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{exception.reason}</span>
      <button type="submit" disabled={pending} className="font-mono text-[0.625rem] text-muted hover:text-oxblood-hi">
        {pending ? '…' : '✕'}
      </button>
    </form>
  );
}

export function RotaEditor({
  barbers,
}: {
  barbers: {
    id: string;
    name: string;
    initials: string | null;
    rota_patterns: RotaPattern[];
    rota_exceptions: (RotaException & { reason: string | null })[];
  }[];
}) {
  const [openId, setOpenId] = useState<string | null>(barbers[0]?.id ?? null);

  return (
    <div className="grid gap-px bg-ink-3">
      {barbers.map((b) => {
        const open = openId === b.id;
        const hours = b.rota_patterns.reduce((sum, p) => {
          const [sh, sm] = p.start_time.split(':').map(Number);
          const [eh, em] = p.end_time.split(':').map(Number);
          return sum + (eh * 60 + em - sh * 60 - sm) / 60;
        }, 0);

        return (
          <div key={b.id} className="bg-ink-2">
            <button
              onClick={() => setOpenId(open ? null : b.id)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-ink-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-ink-4 font-mono text-[0.625rem] tracking-widest text-bone/70">
                {b.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base">{b.name}</span>
                <span className="num block text-[0.6875rem] text-muted">
                  {b.rota_patterns.length} days · {hours}h a week
                  {b.rota_exceptions.length > 0 && ` · ${b.rota_exceptions.length} exception${b.rota_exceptions.length > 1 ? 's' : ''}`}
                </span>
              </span>
              <span className="font-mono text-xs text-muted">{open ? '−' : '+'}</span>
            </button>

            {open && (
              <div className="border-t border-ink-3">
                <p className="eyebrow px-3 pt-3">Weekly pattern</p>
                <div className="mt-2">
                  {DAYS.map((d) => (
                    <DayRow
                      key={d.n}
                      staffId={b.id}
                      weekday={d.n}
                      label={d.label}
                      pattern={b.rota_patterns.find((p) => p.weekday === d.n)}
                    />
                  ))}
                </div>

                <p className="eyebrow px-3 pt-4">Exceptions — holidays and one-offs</p>
                {b.rota_exceptions.length > 0 && (
                  <div className="mt-2">
                    {b.rota_exceptions
                      .slice()
                      .sort((a, z) => a.date.localeCompare(z.date))
                      .map((e) => (
                        <ExceptionRow key={e.date} staffId={b.id} exception={e} />
                      ))}
                  </div>
                )}
                <ExceptionForm staffId={b.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
