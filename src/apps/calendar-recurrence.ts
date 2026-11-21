type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type CalendarRule = {
  frequency: Frequency;
  interval: number;
  weekdays: number[];
  end: 'never' | 'count' | 'until';
  count: number | null;
  until: string | null;
};
type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
const dateKey = (p: Parts) =>
  `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
const occurrenceKey = (p: Parts) =>
  `${dateKey(p)}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`;
const utcDate = (p: Pick<Parts, 'year' | 'month' | 'day'>) => Date.UTC(p.year, p.month - 1, p.day);
const plusDays = (p: Parts, amount: number): Parts => {
  const d = new Date(utcDate(p) + amount * 86400000);
  return { ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
function partsAt(instant: number, timezone: string): Parts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: +values.year,
    month: +values.month,
    day: +values.day,
    hour: +values.hour,
    minute: +values.minute,
    second: +values.second,
  };
}
function instantAt(p: Parts, timezone: string): number | null {
  const target = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const represented = partsAt(instant, timezone);
    const actual = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    instant += target - actual;
  }
  const result = partsAt(instant, timezone);
  if (occurrenceKey(result) !== occurrenceKey(p)) return null; // A local time in a DST gap has no instant.
  return instant;
}
function eligible(p: Parts, anchor: Parts, rule: CalendarRule) {
  const days = (utcDate(p) - utcDate(anchor)) / 86400000;
  if (days < 0) return false;
  if (rule.frequency === 'daily') return days % rule.interval === 0;
  if (rule.frequency === 'weekly') {
    const weekStart = (x: Parts) => utcDate(x) - new Date(utcDate(x)).getUTCDay() * 86400000;
    const weeks = (weekStart(p) - weekStart(anchor)) / (7 * 86400000);
    return (
      weeks >= 0 &&
      weeks % rule.interval === 0 &&
      (rule.weekdays.length ? rule.weekdays : [anchorDayOfWeek(anchor)]).includes(
        new Date(utcDate(p)).getUTCDay(),
      )
    );
  }
  if (rule.frequency === 'monthly') {
    const months = (p.year - anchor.year) * 12 + p.month - anchor.month;
    const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
    return months >= 0 && months % rule.interval === 0 && p.day === Math.min(anchor.day, last);
  }
  const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
  return (
    p.year >= anchor.year &&
    (p.year - anchor.year) % rule.interval === 0 &&
    p.month === anchor.month &&
    p.day === Math.min(anchor.day, last)
  );
}
function anchorDayOfWeek(p: Parts) {
  return new Date(utcDate(p)).getUTCDay();
}
function ordinal(p: Parts, anchor: Parts, rule: CalendarRule) {
  const days = (utcDate(p) - utcDate(anchor)) / 86400000;
  if (rule.frequency === 'daily') return Math.floor(days / rule.interval) + 1;
  if (rule.frequency === 'monthly') {
    const months = (p.year - anchor.year) * 12 + p.month - anchor.month;
    return Math.floor(months / rule.interval) + 1;
  }
  if (rule.frequency === 'yearly') return Math.floor((p.year - anchor.year) / rule.interval) + 1;
  const weekdays = (rule.weekdays.length ? rule.weekdays : [anchorDayOfWeek(anchor)])
    .slice()
    .sort();
  const anchorWeekStart = utcDate(anchor) - anchorDayOfWeek(anchor) * 86400000;
  const weekIndex = Math.floor((utcDate(p) - anchorWeekStart) / (7 * 86400000));
  if (weekIndex === 0)
    return weekdays.filter(
      (weekday) => weekday >= anchorDayOfWeek(anchor) && weekday <= anchorDayOfWeek(p),
    ).length;
  const firstWeek = weekdays.filter((weekday) => weekday >= anchorDayOfWeek(anchor)).length;
  const completeActiveWeeks = Math.floor((weekIndex - 1) / rule.interval);
  const currentWeek =
    weekIndex % rule.interval === 0
      ? weekdays.filter((weekday) => weekday <= anchorDayOfWeek(p)).length
      : 0;
  return firstWeek + completeActiveWeeks * weekdays.length + currentWeek;
}
export function expandCalendarSeries(event: any, from: string, to: string) {
  const startMs = Date.parse(event.data.start),
    endMs = Date.parse(event.data.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const rule = (event.data.recurrence_rule ||
    (event.data.recurrence && event.data.recurrence !== 'none'
      ? {
          frequency: event.data.recurrence,
          interval: 1,
          weekdays: [],
          end: 'never',
          count: null,
          until: null,
        }
      : null)) as CalendarRule | null;
  if (!rule || event.data.recurrence === 'none')
    return endMs > Date.parse(from) && startMs < Date.parse(to) ? [{ ...event }] : [];
  const timezone = event.data.timezone;
  const anchor = partsAt(startMs, timezone);
  const duration = endMs - startMs;
  const allDaySpan = Math.max(1, (utcDate(partsAt(endMs, timezone)) - utcDate(anchor)) / 86400000);
  const firstLocal = partsAt(Date.parse(from) - duration, timezone);
  const lastLocal = partsAt(Date.parse(to), timezone);
  let day = utcDate(firstLocal) < utcDate(anchor) ? anchor : plusDays(firstLocal, -366);
  if (utcDate(day) < utcDate(anchor)) day = anchor;
  const finalDay = utcDate(lastLocal);
  const output: any[] = [];
  const exceptions = new Map((event.data.occurrence_exceptions || []).map((x: any) => [x.key, x]));
  // Callers bound the visible range. This local-day ceiling also protects corrupted rules.
  for (
    let steps = 0;
    day && utcDate(day) <= finalDay && steps < 770;
    steps++, day = plusDays(day, 1)
  ) {
    if (!eligible(day, anchor, rule)) continue;
    const local = { ...day, hour: anchor.hour, minute: anchor.minute, second: anchor.second };
    const key = occurrenceKey(local);
    if (rule.end === 'until' && rule.until && dateKey(local) > rule.until) break;
    if (rule.end === 'count' && rule.count !== null && ordinal(day, anchor, rule) > rule.count)
      break;
    const occurrenceStart = instantAt(local, timezone);
    if (occurrenceStart === null || occurrenceStart < startMs) continue;
    const exception: any = exceptions.get(key);
    if (exception?.cancelled) continue;
    const actualStart = exception?.data?.start ? Date.parse(exception.data.start) : occurrenceStart;
    const actualEnd = exception?.data?.end
      ? Date.parse(exception.data.end)
      : event.data.all_day
        ? (instantAt(
            plusDays(
              { ...partsAt(actualStart, timezone), hour: 0, minute: 0, second: 0 },
              allDaySpan,
            ),
            timezone,
          ) ?? actualStart + duration)
        : actualStart + duration;
    if (actualEnd <= Date.parse(from) || actualStart >= Date.parse(to)) continue;
    output.push({
      ...event,
      id: event.id + '@' + encodeURIComponent(key),
      series_id: event.id,
      occurrence_key: key,
      series_data: { ...event.data, recurrence_rule: rule },
      data: {
        ...event.data,
        ...(exception?.data || {}),
        start: new Date(actualStart).toISOString(),
        end: new Date(actualEnd).toISOString(),
        recurrence_parent_id: event.id,
        occurrence_key: key,
      },
    });
    if (output.length >= 5000) break;
  }
  return output;
}
export function calendarOccurrenceInstant(event: any, key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(key);
  const rule = (event.data.recurrence_rule ||
    (event.data.recurrence && event.data.recurrence !== 'none'
      ? {
          frequency: event.data.recurrence,
          interval: 1,
          weekdays: [],
          end: 'never',
          count: null,
          until: null,
        }
      : null)) as CalendarRule | null;
  if (!match || !rule) return null;
  const p: Parts = {
    year: +match[1],
    month: +match[2],
    day: +match[3],
    hour: +match[4],
    minute: +match[5],
    second: +match[6],
  };
  const testDate = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
  if (
    testDate.getUTCFullYear() !== p.year ||
    testDate.getUTCMonth() + 1 !== p.month ||
    testDate.getUTCDate() !== p.day ||
    testDate.getUTCHours() !== p.hour ||
    testDate.getUTCMinutes() !== p.minute ||
    testDate.getUTCSeconds() !== p.second
  )
    return null;
  const anchor = partsAt(Date.parse(event.data.start), event.data.timezone);
  if (!eligible(p, anchor, rule)) return null;
  if (rule.end === 'until' && rule.until && dateKey(p) > rule.until) return null;
  if (rule.end === 'count' && rule.count !== null && ordinal(p, anchor, rule) > rule.count)
    return null;
  return instantAt(p, event.data.timezone);
}
