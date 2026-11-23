export type AppointmentType = {
  id: string;
  data?: {
    active?: boolean;
    [key: string]: unknown;
  };
};

export function activeAppointmentTypes<T extends AppointmentType>(types: T[]): T[] {
  return types.filter((type) => type.data?.active === true);
}

export function approvedLeaveCalendarEvents(entries: any[]): any[] {
  return entries.flatMap((entry) => {
    if (
      entry?.status !== 'approved' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.from || '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.to || '') ||
      entry.to < entry.from
    ) return [];
    const from = Date.parse(`${entry.from}T00:00:00Z`);
    const to = Date.parse(`${entry.to}T00:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(to) || new Date(from).toISOString().slice(0, 10) !== entry.from || new Date(to).toISOString().slice(0, 10) !== entry.to || to - from > 366 * 86400000) return [];
    const employee = String(entry.employee_name || 'Workspace member');
    const label = String(entry.label || 'Planned absence');
    const days = [];
    for (let day = from; day <= to; day += 86400000) {
      const key = new Date(day).toISOString().slice(0, 10);
      days.push({
        id: `people-leave:${entry.id}:${key}`,
        read_only: true,
        source: 'people_leave',
        data: {
          start: `${key}T00:00:00`,
          end: `${key}T23:59:59`,
          all_day: true,
          title: `${employee} · ${label}`,
        },
      });
    }
    return days;
  });
}
