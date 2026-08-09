import { DateTime } from 'luxon';

export const TZ = 'Europe/London';

export function money(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

export function time(iso: string, zone = TZ): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat('HH:mm');
}

export function timeRange(startIso: string, endIso: string, zone = TZ): string {
  return `${time(startIso, zone)}–${time(endIso, zone)}`;
}

export function longDate(iso: string, zone = TZ): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat('cccc d LLLL');
}

export function dateWithTime(iso: string, zone = TZ): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat("cccc d LLLL 'at' HH:mm");
}

export function today(zone = TZ): string {
  return DateTime.now().setZone(zone).toISODate()!;
}

export function relativeDay(date: string, zone = TZ): string {
  const d = DateTime.fromISO(date, { zone }).startOf('day');
  const diff = Math.round(d.diff(DateTime.now().setZone(zone).startOf('day'), 'days').days);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toFormat('cccc d LLL');
}

export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "+447700900101" -> "07700 900101" — what a UK client expects to see. */
export function prettyMobile(mobile: string | null): string {
  if (!mobile) return '';
  if (mobile.startsWith('+44')) {
    const rest = mobile.slice(3);
    return `0${rest.slice(0, 4)} ${rest.slice(4)}`;
  }
  return mobile;
}

export const STATUS_LABEL: Record<string, string> = {
  booked: 'Booked',
  in_progress: 'In the chair',
  completed: 'Done',
  no_show: 'No-show',
  cancelled: 'Cancelled',
};
