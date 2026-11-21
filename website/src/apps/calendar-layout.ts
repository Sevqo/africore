export function eventsOnDay(events: any[], day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  return events.filter((event) => Date.parse(event.data.end) > start && Date.parse(event.data.start) < end);
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
