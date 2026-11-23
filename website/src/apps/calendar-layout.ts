/** Format an instant for a datetime-local editor in the event's own timezone. */
export function calendarTimeInput(instant: string, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** An untouched wall time may represent either instant in a repeated DST hour. */
export function retainedCalendarInstant(value: string, timezone: string, original?: { instant: string; timezone: string }) {
  return original?.timezone === timezone && calendarTimeInput(original.instant, timezone) === value
    ? original.instant
    : undefined;
}

export function eventsOnDay(events: any[], day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return events.filter((event) => Date.parse(event.data.end) > start && Date.parse(event.data.start) < end);
}

/** Position all-day events across the visible days using exclusive end dates. */
export function layoutCalendarAllDay<T extends { data: { all_day?: boolean; start: string; end: string } }>(events: T[], days: Date[]) {
  const boundaries = days.map((day) => ({
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime(),
  }));
  const spans = events.flatMap((event) => {
    if (!event.data.all_day) return [];
    const start = Date.parse(event.data.start);
    const end = Date.parse(event.data.end);
    const first = boundaries.findIndex((day) => start < day.end && end > day.start);
    if (first < 0) return [];
    let last = first;
    while (last + 1 < boundaries.length && end > boundaries[last + 1].start) last++;
    return [{ event, first, last }];
  }).sort((a, b) => a.first - b.first || b.last - a.last);
  const lanes: number[] = [];
  return spans.map((entry) => {
    const freeLane = lanes.findIndex((last) => last < entry.first);
    const lane = freeLane < 0 ? lanes.length : freeLane;
    lanes[lane] = entry.last;
    return { ...entry, lane };
  });
}

export function layoutOverlappingEvents(events: any[], day: Date) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 86400000;
  const items = events
    .filter((event) => !event.data?.all_day)
    .filter((event) => Date.parse(event.data.end) > dayStart && Date.parse(event.data.start) < dayEnd)
    .map((event) => ({
      event,
      start: Math.max(dayStart, Date.parse(event.data.start)),
      end: Math.min(dayEnd, Date.parse(event.data.end)),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const result: { event: any; start: number; end: number; lane: number; lanes: number }[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;
  const placeCluster = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placed = cluster.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      return { ...item, lane };
    });
    result.push(...placed.map((item) => ({ ...item, lanes: laneEnds.length })));
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const item of items) {
    if (cluster.length && item.start >= clusterEnd) placeCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  placeCluster();
  return result;
}
