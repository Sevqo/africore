import { useEffect, useMemo, useRef, useState } from 'react';
import { Overlay } from '../components/Overlay';
import { Field, type API } from '../operations/UI';
import { activeAppointmentTypes, approvedLeaveCalendarEvents } from './calendar-appointments';
import { calendarTimeInput, eventsOnDay, layoutCalendarAllDay, layoutOverlappingEvents, retainedCalendarInstant } from './calendar-layout';
import { appNavigationEvent } from './AppNavigation';
import './phase3-apps.css';

const dayKey = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
const startOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};
const localInput = (date: Date) => {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};
function zonedIso(value: string, zone: string) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const represented = Date.UTC(
      +values.year,
      +values.month - 1,
      +values.day,
      +values.hour,
      +values.minute,
    );
    instant += target - represented;
  }
  const check = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(check.map((p) => [p.type, p.value]));
  if (
    +values.year !== year ||
    +values.month !== month ||
    +values.day !== day ||
    +values.hour !== hour ||
    +values.minute !== minute
  )
    throw new Error('That local time does not exist in the selected timezone.');
  return new Date(instant).toISOString();
}
const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function CalendarMiniMonth({ date, onChange }: { date: Date; onChange: (date: Date) => void }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const monthStart = new Date(year, month, 1, 12);
  const firstWeekday = monthStart.getDay();
  const today = dayKey(new Date());
  const selected = dayKey(date);
  return (
    <section className="calendar-mini-month" aria-label="Mini calendar">
      <div className="calendar-mini-heading">
        <button type="button" aria-label="Previous month" onClick={() => onChange(new Date(year, month - 1, 1, 12))}>‹</button>
        <strong aria-live="polite">{monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" aria-label="Next month" onClick={() => onChange(new Date(year, month + 1, 1, 12))}>›</button>
      </div>
      <div className="calendar-mini-grid">
        {weekDays.map((day) => <span key={day} aria-hidden="true">{day.slice(0, 1)}</span>)}
        {Array.from({ length: 42 }, (_, index) => {
          const day = new Date(year, month, 1 - firstWeekday + index, 12);
          const key = dayKey(day);
          return <button
            key={key}
            type="button"
            className={day.getMonth() === month ? '' : 'calendar-other-month'}
            aria-label={day.toLocaleDateString(undefined, { dateStyle: 'full' })}
            aria-current={key === today ? 'date' : undefined}
            aria-pressed={key === selected}
            onClick={() => onChange(day)}
          >{day.getDate()}</button>;
        })}
      </div>
    </section>
  );
}
function wallParts(instant: number, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    weekday: weekDays.indexOf(values.weekday),
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}
function suggestedAvailability(data: any[], from: string, length = 60) {
  if (!data.length || data.some((member) => !member.work_days)) return [];
  const start = Math.ceil(Date.parse(from) / 1800000) * 1800000;
  const end = start + 7 * 86400000;
  const slots: string[] = [];
  for (
    let instant = start;
    instant + length * 60000 <= end && slots.length < 8;
    instant += 1800000
  ) {
    const fits = data.every((member) => {
      const a = wallParts(instant, member.timezone),
        b = wallParts(instant + length * 60000 - 60000, member.timezone);
      const hours = member.work_days.find((day: any) => day.weekday === a.weekday);
      const [sh, sm] = String(hours?.start || '')
        .split(':')
        .map(Number);
      const [eh, em] = String(hours?.end || '')
        .split(':')
        .map(Number);
      const withinHours =
        !!hours && a.date === b.date && a.minute >= sh * 60 + sm && b.minute < eh * 60 + em;
      const free = !member.busy.some(
        (busy: any) =>
          Date.parse(busy.start) < instant + length * 60000 && Date.parse(busy.end) > instant,
      );
      return withinHours && free;
    });
    if (fits) slots.push(new Date(instant).toISOString());
  }
  return slots;
}
const initial = () => ({
  title: '',
  description: '',
  start: localInput(new Date(Date.now() + 3600000)),
  end: localInput(new Date(Date.now() + 7200000)),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi',
  all_day: false,
  location: '',
  meeting_url: '',
  visibility: 'default',
  recurrence: 'none',
  recurrence_rule: null as any,
  attendees: [] as string[],
  linked_record: null as any,
});
export function CalendarWorkspace({
  api,
  scope,
  section = 'calendar',
}: {
  api: API;
  scope: string;
  section?: string;
}) {
  const [events, setEvents] = useState<any[]>([]),
    [members, setMembers] = useState<any[]>([]),
    [selectedMembers, setSelectedMembers] = useState<string[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [search, setSearch] = useState(''),
    [date, setDate] = useState(() => new Date()),
    [view, setView] = useState<'day' | 'week' | 'month'>('week'),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [calendarSettings, setCalendarSettings] = useState<any>(null),
    [availability, setAvailability] = useState<any>(null),
    [actorId, setActorId] = useState(''),
    [eventHistory, setEventHistory] = useState<any[] | null>(null);
  const [appointmentTypes, setAppointmentTypes] = useState<any[]>([]),
    [appointmentRequests, setAppointmentRequests] = useState<any[]>([]),
    [appointmentHistory, setAppointmentHistory] = useState<{ id: string; title: string; entries: { action: string; actor_type: string; created_at: string }[] } | null>(null),
    [publicCapacity, setPublicCapacity] = useState(1),
    [publicWorkdays, setPublicWorkdays] = useState([1, 2, 3, 4, 5]),
    [appointmentName, setAppointmentName] = useState(''),
    [appointmentDuration, setAppointmentDuration] = useState(30),
    [appointmentStaff, setAppointmentStaff] = useState<string[]>([]),
    [appointmentType, setAppointmentType] = useState(''),
    [appointmentStart, setAppointmentStart] = useState(localInput(new Date(Date.now() + 86400000)));
  const [workTasks, setWorkTasks] = useState<any[]>([]),
    [workState, setWorkState] = useState<'loading' | 'installed' | 'missing' | 'error'>('loading');
  const [crmEntries, setCrmEntries] = useState<any[]>([]),
    [crmState, setCrmState] = useState<'loading' | 'installed' | 'missing' | 'error'>('loading');
  const [salesQuotes, setSalesQuotes] = useState<any[]>([]),
    [salesState, setSalesState] = useState<'loading' | 'installed' | 'missing' | 'error'>('loading');
  const [documentsList, setDocumentsList] = useState<any[]>([]),
    [documentsState, setDocumentsState] = useState<'loading' | 'installed' | 'missing' | 'error'>('loading');
  const [peopleLeave, setPeopleLeave] = useState<any[]>([]),
    [peopleLeaveState, setPeopleLeaveState] = useState<'loading' | 'installed' | 'missing' | 'unavailable'>('loading');
  const calendarGrid = useRef<HTMLElement | null>(null);
  async function load() {
    try {
      setError('');
      const from = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - 180,
      ).toISOString();
      const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 181).toISOString();
      const [e, m] = await Promise.all([
        api(`/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api('/team'),
      ]);
      setEvents(e.data || []);
      setMembers(
        (m.data || m.members || [])
          .filter((x: any) => x.status !== 'invited')
          .map((member: any) => ({ ...member, user_id: member.user_id || member.id })),
      );
    } catch (x) {
      setError((x as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [scope, date, view]);
  useEffect(() => {
    let current = true;
    setWorkTasks([]);
    setWorkState('loading');
    api('/apps')
      .then(async (result) => {
        const installed = (result.apps || []).some(
          (app: any) => app.id === 'work' && app.installation?.status === 'installed',
        );
        if (!current) return;
        setWorkState(installed ? 'installed' : 'missing');
        if (!installed) return;
        const tasks = await api('/work/my-work?status=all');
        if (current) setWorkTasks(tasks.data || []);
      })
      .catch(() => {
        if (current) setWorkState('error');
      });
    return () => {
      current = false;
    };
  }, [api, scope]);
  useEffect(() => {
    let current = true;
    setSalesQuotes([]);
    setSalesState('loading');
    api('/apps')
      .then(async (result) => {
        const installed = (result.apps || []).some(
          (app: any) => app.id === 'sales' && app.installation?.status === 'installed',
        );
        if (!current) return;
        setSalesState(installed ? 'installed' : 'missing');
        if (!installed) return;
        const quotes = await api('/sales/quotations');
        if (current) setSalesQuotes(quotes.data || []);
      })
      .catch(() => {
        if (current) setSalesState('error');
      });
    return () => { current = false; };
  }, [api, scope]);
  useEffect(() => {
    let current = true;
    setDocumentsList([]);
    setDocumentsState('loading');
    api('/apps')
      .then(async (result) => {
        const installed = (result.apps || []).some(
          (app: any) => app.id === 'documents' && app.installation?.status === 'installed',
        );
        if (!current) return;
        setDocumentsState(installed ? 'installed' : 'missing');
        if (!installed) return;
        const files = await api('/documents?view=recent&kind=file&hide_personnel=true&offset=0');
        if (current) setDocumentsList(files.data || []);
      })
      .catch(() => {
        if (current) setDocumentsState('error');
      });
    return () => { current = false; };
  }, [api, scope]);
  useEffect(() => {
    let current = true;
    setPeopleLeave([]);
    setPeopleLeaveState('loading');
    api('/apps')
      .then(async (result) => {
        const installed = (result.apps || []).some(
          (app: any) => app.id === 'people' && app.installation?.status === 'installed',
        );
        if (!current) return;
        if (!installed) {
          setPeopleLeaveState('missing');
          return;
        }
        setPeopleLeaveState('installed');
        const first = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (view === 'month' ? 35 : 0));
        const last = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (view === 'month' ? 41 : view === 'week' ? 6 : 0));
        const from = dayKey(first);
        const to = dayKey(last);
        try {
          const result = await api(`/people/leave-calendar?${new URLSearchParams({ from, to, status: 'approved' })}`);
          if (current) setPeopleLeave(approvedLeaveCalendarEvents(result.data || []));
        } catch {
          if (current) setPeopleLeaveState('unavailable');
        }
      })
      .catch(() => {
        if (current) setPeopleLeaveState('unavailable');
      });
    return () => { current = false; };
  }, [api, scope, date, view]);
  useEffect(() => {
    let current = true;
    setCrmEntries([]);
    setCrmState('loading');
    api('/apps')
      .then(async (result) => {
        const installed = (result.apps || []).some(
          (app: any) => app.id === 'crm' && app.installation?.status === 'installed',
        );
        if (!current) return;
        setCrmState(installed ? 'installed' : 'missing');
        if (!installed) return;
        const entries = await api('/crm/entries?limit=100&offset=0');
        if (current)
          setCrmEntries(
            (entries.data || []).filter((entry: any) =>
              ['lead', 'opportunity'].includes(entry.kind),
            ),
          );
      })
      .catch(() => {
        if (current) setCrmState('error');
      });
    return () => {
      current = false;
    };
  }, [api, scope]);
  useEffect(() => {
    if (
      view === 'month' ||
      section === 'settings' ||
      section === 'availability' ||
      section === 'appointments'
    )
      return;
    const frame = requestAnimationFrame(() => {
      const root = calendarGrid.current;
      const hours = root?.querySelector('.calendar-hour-grid');
      if (!root || !hours) return;
      const rootTop = root.getBoundingClientRect().top;
      const hoursTop = hours.getBoundingClientRect().top - rootTop + root.scrollTop;
      const headerHeight = root.querySelector('.calendar-grid-header')?.getBoundingClientRect().height || 0;
      root.scrollTop = Math.max(0, hoursTop + 6 * 54 - headerHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [date, section, view]);
  useEffect(() => {
    if (members.length) setSelectedMembers(members.map((m) => m.user_id));
  }, [members]);
  useEffect(() => {
    api('/calendar/settings')
      .then((result) => {
        setCalendarSettings(result);
        setActorId(result.actor_id || '');
      })
      .catch((e) => setError((e as Error).message));
  }, [scope, section]);
  useEffect(() => {
    if (section !== 'availability') return;
    const start = startOfWeek(date),
      end = new Date(start);
    end.setDate(end.getDate() + 7);
    const query = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
      members: selectedMembers.join(','),
    });
    api('/calendar/availability?' + query.toString())
      .then(setAvailability)
      .catch((e) => setError((e as Error).message));
  }, [scope, section, date, selectedMembers]);
  useEffect(() => {
    if (section !== 'appointments') return;
    api('/calendar/appointment-types')
      .then((result) => {
        const rows = result.data || [];
        setAppointmentTypes(rows);
        const active = activeAppointmentTypes(rows);
        setAppointmentType((current) =>
          active.some((row: any) => row.id === current) ? current : active[0]?.id || '',
        );
      })
      .catch((e) => setError((e as Error).message));
  }, [scope, section]);
  useEffect(() => {
    if (section !== 'appointments' || !appointmentTypes.length) return;
    Promise.all(appointmentTypes.map(async (type) => {
      try {
        const result = await api(`/calendar/appointment-types/${type.id}/requests`);
        return (result.data || []).map((request: any) => ({ ...request, type_id: type.id, type_name: type.data.name }));
      } catch { return []; }
    })).then((groups) => setAppointmentRequests(groups.flat()));
  }, [scope, section, appointmentTypes, actorId]);
  async function saveSettings() {
    if (!calendarSettings) return;
    setBusy(true);
    try {
      const result = await api('/calendar/settings', 'PUT', calendarSettings.data, {
        'Idempotency-Key': crypto.randomUUID(),
      });
      setCalendarSettings(result);
      setActorId(result.actor_id || actorId);
      setNotice('Your work hours and sharing preference were saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createAppointmentType() {
    if (!appointmentName.trim() || !appointmentStaff.length) return;
    setBusy(true);
    try {
      const result = await api('/calendar/appointment-types', 'POST', {
        name: appointmentName.trim(),
        duration_minutes: appointmentDuration,
        timezone: calendarSettings?.data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi',
        staff: appointmentStaff,
        active: true,
      }, { 'Idempotency-Key': crypto.randomUUID() });
      const record = result.data;
      setAppointmentTypes((current) => [record, ...current]);
      setAppointmentType(record.id);
      setAppointmentName('');
      setNotice('Appointment type created. Members can request a time from this workspace.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function bookAppointment(type: any) {
    setBusy(true);
    try {
      const result = await api(`/calendar/appointment-types/${type.id}/bookings`, 'POST', {
        start: zonedIso(appointmentStart, type.data.timezone),
      }, { 'Idempotency-Key': crypto.randomUUID() });
      setNotice(`Appointment confirmed for ${new Date(result.event.data.start).toLocaleString()}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelAppointment(event: any) {
    setBusy(true);
    try {
      await api(
        `/calendar/events/${event.id}/cancel`,
        'POST',
        { expected_version: event.version },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setNotice('Appointment cancelled. Invitees can review the update in Calendar.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleAppointmentType(type: any) {
    setBusy(true);
    try {
      const result = await api(`/calendar/appointment-types/${type.id}`, 'PUT', {
        ...type.data,
        active: !type.data.active,
        expected_version: type.version,
      }, { 'Idempotency-Key': crypto.randomUUID() });
      const updated = result.data || result;
      setAppointmentTypes((current) => current.map((item) => item.id === type.id ? updated : item));
      setNotice(updated.data.active ? 'Appointment type activated.' : 'Appointment type deactivated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publishAppointmentType(type: any) {
    setBusy(true);
    try {
      const result = await api(`/calendar/appointment-types/${type.id}/public-link`, 'POST', {
        capacity: publicCapacity,
        work_days: publicWorkdays.map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
      }, { 'Idempotency-Key': crypto.randomUUID() });
      const link = new URL(result.url, window.location.origin).toString();
      await navigator.clipboard?.writeText(link);
      setNotice(`Public booking link copied: ${link}`);
      setAppointmentTypes((current) => current.map((item) => item.id === type.id ? { ...item, public_link_active: true } : item));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function revokeAppointmentTypeLink(type: any) {
    setBusy(true);
    try {
      await api(`/calendar/appointment-types/${type.id}/public-link`, 'DELETE');
      setAppointmentTypes((current) => current.map((item) => item.id === type.id ? { ...item, public_link_active: false } : item));
      setNotice('Public booking link disabled. Existing request management links remain usable.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function reviewAppointmentRequest(request: any, action: string) {
    setBusy(true);
    try {
      await api(`/calendar/appointment-types/${request.type_id}/requests/${request.id}/review`, 'POST', { action }, { 'Idempotency-Key': crypto.randomUUID() });
      const result = await api(`/calendar/appointment-types/${request.type_id}/requests`);
      setAppointmentRequests((current) => [...current.filter((item) => item.type_id !== request.type_id), ...(result.data || []).map((item: any) => ({ ...item, type_id: request.type_id, type_name: request.type_name }))]);
      if (appointmentHistory?.id === request.id)
        await loadAppointmentHistory(request).catch(() => setAppointmentHistory(null));
      setNotice('Appointment request updated.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function loadAppointmentHistory(request: { id: string; type_id: string; type_name: string }) {
    const result = await api(`/calendar/appointment-types/${request.type_id}/requests/${request.id}/history`);
    setAppointmentHistory({ id: request.id, title: request.type_name, entries: result.data || [] });
  }
  async function showAppointmentHistory(request: { id: string; type_id: string; type_name: string }) {
    setBusy(true);
    setError('');
    try {
      await loadAppointmentHistory(request);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function updateWorkDay(weekday: number, checked: boolean) {
    if (!calendarSettings) return;
    const current = calendarSettings.data.work_days || [];
    const work_days = checked
      ? [...current, { weekday, start: '09:00', end: '17:00' }]
      : current.filter((day: any) => day.weekday !== weekday);
    setCalendarSettings({ ...calendarSettings, data: { ...calendarSettings.data, work_days } });
  }
  const displayMembers = section === 'mine' && actorId ? [actorId] : selectedMembers;
  const appointmentBookings = events
    .filter((event) => event.data?.linked_record?.kind === 'calendar_appointment_type')
    .sort((a, b) => Date.parse(a.data.start) - Date.parse(b.data.start));
  const bookableAppointmentTypes = activeAppointmentTypes(appointmentTypes);
  const visible = useMemo(
    () =>
      [...events, ...peopleLeave].filter(
        (e) =>
          e.data?.cancelled_at == null &&
          (e.source === 'people_leave' || e.data?.title === 'Busy' ||
            displayMembers.includes(e.data?.organizer_id) ||
            e.data?.attendees?.some((a: any) => displayMembers.includes(a.user_id))) &&
          (!search.trim() ||
            [e.data?.title, e.data?.location, e.data?.description]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(search.trim().toLowerCase()))),
      ),
    [events, peopleLeave, displayMembers, search],
  );
  const days =
    view === 'day'
      ? [new Date(date.getFullYear(), date.getMonth(), date.getDate())]
      : view === 'week'
        ? Array.from({ length: 7 }, (_, i) => {
            const d = startOfWeek(date);
            d.setDate(d.getDate() + i);
            return d;
          })
        : Array.from({ length: 42 }, (_, i) => {
            const d = new Date(date.getFullYear(), date.getMonth(), 1);
            d.setDate(d.getDate() - d.getDay() + i);
            return d;
          });
  const heading =
    view === 'day'
      ? date.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : view === 'month'
        ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : `${days[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const {
        id,
        version,
        scope,
        series_id,
        occurrence_key,
        series_data,
        occurrence_data,
        original_times,
        organizer_id: _organizerId,
        ...fields
      } = form;
      const body: any = {
        ...fields,
        recurrence_rule: form.recurrence === 'none' ? null : form.recurrence_rule,
        start: retainedCalendarInstant(form.start, form.timezone, original_times?.start) ?? zonedIso(form.start, form.timezone),
        end: retainedCalendarInstant(form.end, form.timezone, original_times?.end) ?? zonedIso(form.end, form.timezone),
        attendees: form.attendees.map((user_id: string) => ({ user_id, response: 'pending' })),
      };
      if (id && scope === 'occurrence' && series_id && occurrence_key) {
        await api(
          `/calendar/events/${series_id}/occurrences/${encodeURIComponent(occurrence_key)}`,
          'PUT',
          {
            expected_version: version,
            title: form.title,
            description: form.description,
            start: body.start,
            end: body.end,
            timezone: form.timezone,
            location: form.location,
            meeting_url: form.meeting_url,
            all_day: form.all_day,
          },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      } else if (id) {
        body.expected_version = version;
        await api(`/calendar/events/${series_id || id}`, 'PUT', body, {
          'Idempotency-Key': crypto.randomUUID(),
        });
      } else
        await api('/calendar/events', 'POST', body, { 'Idempotency-Key': crypto.randomUUID() });
      setForm(null);
      setNotice(
        id
          ? 'Meeting updated.'
          : 'Meeting saved. Invitees can respond in their AfriCore workspace.',
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelEvent() {
    if (!form?.id) return;
    setBusy(true);
    try {
      if (form.scope === 'occurrence' && form.series_id && form.occurrence_key)
        await api(
          `/calendar/events/${form.series_id}/occurrences/${encodeURIComponent(form.occurrence_key)}/cancel`,
          'POST',
          { expected_version: form.version },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      else
        await api(
          `/calendar/events/${form.series_id || form.id}/cancel`,
          'POST',
          { expected_version: form.version },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      setForm(null);
      setNotice('Meeting cancelled.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editEvent(event: any) {
    setEventHistory(null);
    const d = event.data;
    setForm({
      title: d.title,
      description: d.description,
      timezone: d.timezone,
      all_day: d.all_day,
      location: d.location,
      meeting_url: d.meeting_url,
      visibility: d.visibility,
      recurrence: d.recurrence,
      recurrence_rule: d.recurrence_rule,
      linked_record: d.linked_record,
      id: event.series_id || event.id,
      series_id: event.series_id || null,
      occurrence_key: event.occurrence_key || null,
      scope: event.series_id ? 'occurrence' : 'series',
      series_data: event.series_data || null,
      occurrence_data: event.series_id ? { ...d } : null,
      version: event.version,
      organizer_id: d.organizer_id,
      start: calendarTimeInput(d.start, d.timezone),
      end: calendarTimeInput(d.end, d.timezone),
      original_times: {
        start: { instant: d.start, timezone: d.timezone },
        end: { instant: d.end, timezone: d.timezone },
      },
      attendees: (d.attendees || []).map((a: any) => a.user_id),
    });
  }
  function openWorkTask(id: string) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'work');
    url.searchParams.set('section', 'my-work');
    url.searchParams.set('work_target', id);
    url.searchParams.set('work_view', 'my-work');
    url.hash = 'Apps';
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  function openCrmRecord(id: string) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'crm');
    url.searchParams.set('section', 'pipeline');
    url.searchParams.set('crm-record', id);
    url.hash = 'Apps';
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  function openSalesQuote(id: string) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'sales');
    url.searchParams.set('section', 'quotations');
    url.searchParams.set('sales-quotation', id);
    url.hash = 'Apps';
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  function openDocument(id: string) {
    const url = new URL(location.href);
    url.searchParams.set('app', 'documents');
    url.searchParams.set('section', 'files');
    url.searchParams.set('document', id);
    url.hash = 'Apps';
    history.pushState(null, '', url.pathname + url.search + url.hash);
    dispatchEvent(new Event(appNavigationEvent));
  }
  async function respond(e: any, response: string) {
    try {
      await api(
        `/calendar/events/${e.series_id || e.id}/respond`,
        'POST',
        { response },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      await load();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  async function loadEventHistory() {
    if (!form?.id) return;
    try {
      const result = await api(`/calendar/events/${form.series_id || form.id}/history`);
      setEventHistory(result.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function move(amount: number) {
    const next = new Date(date);
    if (view === 'day') next.setDate(next.getDate() + amount);
    else if (view === 'week') next.setDate(next.getDate() + 7 * amount);
    else next.setMonth(next.getMonth() + amount);
    setDate(next);
  }
  const invitations = section === 'invitations';
  const invitationEvents = [
    ...new Map(
      visible.filter((e) => e.data?.my_response === 'pending').map((e) => [e.series_id || e.id, e]),
    ).values(),
  ];
  return (
    <main
      className={`phase3-workspace calendar-workspace ${section === 'settings' ? 'calendar-full-width' : ''}`}
    >
      <header className="phase3-toolbar">
        <div>
          <h2>
            {invitations
              ? 'Invitations'
              : section === 'settings'
                ? 'Settings'
                : section === 'availability'
                  ? 'Availability'
                  : section === 'appointments'
                    ? 'Appointments'
                  : section === 'mine'
                    ? 'My Calendar'
                    : section === 'team'
                      ? 'Team Calendar'
                      : 'Meetings'}
          </h2>
          <p>
            {section === 'settings'
              ? 'Personal working hours and team sharing'
              : section === 'availability'
                ? 'Free/busy windows from shared work hours and scheduled events'
                : section === 'appointments'
                  ? 'Manage member appointment types and confirm a time against staff availability'
                : 'Workspace meetings · timezone-aware event times · in-app invitations'}
          </p>
          {peopleLeaveState === 'unavailable' && section !== 'settings' && section !== 'availability' && section !== 'appointments' && (
            <small className="calendar-leave-note">People leave is hidden because the current account cannot read the People leave calendar.</small>
          )}
        </div>
        <div className="phase3-actions">
          {section !== 'settings' && section !== 'availability' && section !== 'appointments' && (
            <label className="field calendar-search">
              <span>Search meetings</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Meeting title or location"
              />
            </label>
          )}
          {section !== 'settings' && section !== 'appointments' && (
            <button className="secondary-button" onClick={() => setDate(new Date())}>
              Today
            </button>
          )}
          {section !== 'settings' && section !== 'appointments' && (
            <button
              className="secondary-button"
              aria-label="Previous date range"
              onClick={() => move(-1)}
            >
              ‹
            </button>
          )}
          {section !== 'settings' && section !== 'appointments' && (
            <button
              className="secondary-button"
              aria-label="Next date range"
              onClick={() => move(1)}
            >
              ›
            </button>
          )}
          {section !== 'settings' && section !== 'appointments' && <strong>{heading}</strong>}
          {section !== 'settings' && section !== 'availability' && section !== 'appointments' && (
            <select
              aria-label="Calendar view"
              value={view}
              onChange={(e) => setView(e.target.value as any)}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          )}
          {section !== 'settings' && section !== 'availability' && section !== 'appointments' && (
            <button className="button" onClick={() => { setEventHistory(null); setForm(initial()); }}>
              New Meeting
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert" role="status">
          {notice}
        </p>
      )}
      {section === 'settings' ? (
        <section className="panel calendar-settings-panel">
          {!calendarSettings ? (
            <p role="status">Loading your calendar settings…</p>
          ) : (
            <>
              <p className="muted">
                Work hours are private until you turn on team sharing. Availability shows only
                busy/free windows; meeting titles and details stay private.
              </p>
              <Field label="Timezone">
                <input
                  value={calendarSettings.data.timezone}
                  onChange={(e) =>
                    setCalendarSettings({
                      ...calendarSettings,
                      data: { ...calendarSettings.data, timezone: e.target.value },
                    })
                  }
                />
              </Field>
              <fieldset className="calendar-workdays">
                <legend>Working days and hours</legend>
                {weekDays.map((label, weekday) => {
                  const hours = calendarSettings.data.work_days.find(
                    (day: any) => day.weekday === weekday,
                  );
                  return (
                    <div className="calendar-workday-row" key={weekday}>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={!!hours}
                          onChange={(e) => updateWorkDay(weekday, e.target.checked)}
                        />
                        {label}
                      </label>
                      {hours && (
                        <>
                          <input
                            aria-label={`${label} work starts`}
                            type="time"
                            value={hours.start}
                            onChange={(e) =>
                              setCalendarSettings({
                                ...calendarSettings,
                                data: {
                                  ...calendarSettings.data,
                                  work_days: calendarSettings.data.work_days.map((day: any) =>
                                    day.weekday === weekday
                                      ? { ...day, start: e.target.value }
                                      : day,
                                  ),
                                },
                              })
                            }
                          />
                          <span>to</span>
                          <input
                            aria-label={`${label} work ends`}
                            type="time"
                            value={hours.end}
                            onChange={(e) =>
                              setCalendarSettings({
                                ...calendarSettings,
                                data: {
                                  ...calendarSettings.data,
                                  work_days: calendarSettings.data.work_days.map((day: any) =>
                                    day.weekday === weekday ? { ...day, end: e.target.value } : day,
                                  ),
                                },
                              })
                            }
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              <Field label="Personal meeting reminder">
                <select
                  value={calendarSettings.data.reminder_minutes_before ?? ''}
                  onChange={(e) =>
                    setCalendarSettings({
                      ...calendarSettings,
                      data: {
                        ...calendarSettings.data,
                        reminder_minutes_before: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                >
                  <option value="">No automatic reminder</option>
                  <option value="5">5 minutes before</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="1440">1 day before</option>
                </select>
              </Field>
              <p className="muted">
                Reminders appear in AfriCore Notifications while the worker is running. Sleeping
                infrastructure may delay them.
              </p>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={calendarSettings.data.share_with_team}
                  onChange={(e) =>
                    setCalendarSettings({
                      ...calendarSettings,
                      data: { ...calendarSettings.data, share_with_team: e.target.checked },
                    })
                  }
                />
                Share my working hours with this workspace
              </label>
              <button className="button" disabled={busy} onClick={() => void saveSettings()}>
                {busy ? 'Saving…' : 'Save calendar settings'}
              </button>
            </>
          )}
        </section>
      ) : section === 'appointments' ? (
        <section className="calendar-availability-page">
          <div className="panel">
            <h3>Create an appointment type</h3>
            <p className="muted">Members can book directly. Public requests are confirmed by a Calendar owner after staff availability is checked.</p>
            <Field label="Appointment name"><input value={appointmentName} maxLength={120} onChange={(e) => setAppointmentName(e.target.value)} placeholder="Consultation" /></Field>
            <Field label="Duration"><select value={appointmentDuration} onChange={(e) => setAppointmentDuration(Number(e.target.value))}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>90 minutes</option><option value={120}>2 hours</option></select></Field>
            <fieldset className="calendar-workdays"><legend>Available staff</legend>{members.map((member) => <label className="checkbox-field" key={member.user_id}><input type="checkbox" checked={appointmentStaff.includes(member.user_id)} onChange={(e) => setAppointmentStaff((list) => e.target.checked ? [...list, member.user_id] : list.filter((id) => id !== member.user_id))} />{member.display_name || member.name || 'Workspace member'}</label>)}</fieldset>
            <button className="button" disabled={busy || !appointmentName.trim() || !appointmentStaff.length} onClick={() => void createAppointmentType()}>Create appointment type</button>
          </div>
          <div className="panel">
            <h3>Public booking availability</h3>
            <p className="muted">Visitors see open times only. Details are stored encrypted; new requests need confirmation in Calendar. No external email is sent.</p>
            <Field label="Bookings per time slot"><select value={publicCapacity} onChange={(event) => setPublicCapacity(Number(event.target.value))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></Field>
            <fieldset className="calendar-workdays"><legend>Public hours · 09:00–17:00 in each appointment type timezone</legend>{[['Sunday',0],['Monday',1],['Tuesday',2],['Wednesday',3],['Thursday',4],['Friday',5],['Saturday',6]].map(([name, weekday]) => <label className="checkbox-field" key={String(weekday)}><input type="checkbox" checked={publicWorkdays.includes(Number(weekday))} onChange={(event) => setPublicWorkdays((days) => event.target.checked ? [...days, Number(weekday)].sort() : days.filter((day) => day !== Number(weekday)))} />{name}</label>)}</fieldset>
            {!appointmentTypes.length ? <p>Create an appointment type first.</p> : appointmentTypes.map((type) => <article className="calendar-appointment-type" key={`public-${type.id}`}><div><strong>{type.data.name}</strong><p>{type.public_link_active ? 'Public link active' : 'No public link'}</p></div><div className="phase3-actions"><button className="secondary-button" disabled={busy || !type.data.active || publicCapacity > type.data.staff.length || !publicWorkdays.length} onClick={() => void publishAppointmentType(type)}>{type.public_link_active ? 'Rotate and copy link' : 'Create public link'}</button>{type.public_link_active && <button className="secondary-button" disabled={busy} onClick={() => void revokeAppointmentTypeLink(type)}>Disable link</button>}</div></article>)}
          </div>
          <div className="panel">
            <h3>Book an appointment</h3>
            {!bookableAppointmentTypes.length ? <p>No active appointment types are available. Create or activate one above to enable member booking.</p> : <>
              <Field label="Appointment type"><select value={appointmentType} onChange={(e) => setAppointmentType(e.target.value)}>{bookableAppointmentTypes.map((type) => <option key={type.id} value={type.id}>{type.data.name} · {type.data.duration_minutes} min</option>)}</select></Field>
              <Field label="Start time"><input type="datetime-local" value={appointmentStart} onChange={(e) => setAppointmentStart(e.target.value)} /></Field>
              <button className="button" disabled={busy || !appointmentType} onClick={() => { const type = bookableAppointmentTypes.find((item) => item.id === appointmentType); if (type) void bookAppointment(type); }}>Check availability and confirm</button>
            </>}
          </div>
          <div className="panel">
            <h3>Appointment types</h3>
            {!appointmentTypes.length ? <p>No types are configured.</p> : appointmentTypes.map((type) => <article className="calendar-appointment-type" key={type.id}>
              <div><strong>{type.data.name}</strong><p>{type.data.duration_minutes} minutes · {type.data.timezone} · {type.data.active ? 'Active' : 'Inactive'}</p></div>
              <button className="secondary-button" disabled={busy} onClick={() => void toggleAppointmentType(type)}>{type.data.active ? 'Deactivate' : 'Activate'}</button>
            </article>)}
          </div>
          <div className="panel">
            <h3>Public booking requests</h3>
            {!appointmentRequests.length ? <p>No public booking requests.</p> : appointmentRequests.map((request) => (
              <article className="calendar-appointment-type" key={request.id}>
                <div>
                  <strong>{request.visitor.name}</strong>
                  <p>{request.type_name} · {new Date(request.start).toLocaleString()} · {request.status.replaceAll('_', ' ')}</p>
                  <p>{request.visitor.email}{request.visitor.phone ? ` · ${request.visitor.phone}` : ''}</p>
                  {request.visitor.note && <p>{request.visitor.note}</p>}
                  {request.proposed_start && <p>Requested change: {new Date(request.proposed_start).toLocaleString()}</p>}
                </div>
                <div className="phase3-actions">
                  {request.status === 'pending' && <>
                    <button className="secondary-button" disabled={busy} onClick={() => void reviewAppointmentRequest(request, 'approve')}>Confirm</button>
                    <button className="secondary-button" disabled={busy} onClick={() => void reviewAppointmentRequest(request, 'decline')}>Decline</button>
                  </>}
                  {request.status === 'reschedule_requested' && <>
                    <button className="secondary-button" disabled={busy} onClick={() => void reviewAppointmentRequest(request, 'approve_reschedule')}>Confirm new time</button>
                    <button className="secondary-button" disabled={busy} onClick={() => void reviewAppointmentRequest(request, 'reject_change')}>Keep current time</button>
                  </>}
                  {request.status === 'cancellation_requested' && <>
                    <button className="secondary-button" disabled={busy} onClick={() => void reviewAppointmentRequest(request, 'approve_cancellation')}>Confirm cancellation</button>
                    <button className="secondary-button" disabled={busy} onClick={() => void reviewAppointmentRequest(request, 'reject_change')}>Keep appointment</button>
                  </>}
                  <button className="secondary-button" disabled={busy} onClick={() => void showAppointmentHistory(request)}>View history</button>
                </div>
              </article>
            ))}
            {appointmentHistory && (
              <section className="calendar-history" aria-label="Appointment request history">
                <h4>{appointmentHistory.title} activity</h4>
                {appointmentHistory.entries.length ? (
                  <ol>
                    {appointmentHistory.entries.map((entry, index) => (
                      <li key={`${entry.created_at}-${index}`}>
                        {entry.action.replaceAll('_', ' ')} · {entry.actor_type === 'visitor' ? 'Visitor' : 'Workspace member'} · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                      </li>
                    ))}
                  </ol>
                ) : <p>No activity recorded.</p>}
                <button className="secondary-button" onClick={() => setAppointmentHistory(null)}>Close history</button>
              </section>
            )}
          </div>
          <div className="panel">
            <h3>Booked appointments</h3>
            {!appointmentBookings.length ? <p>No appointments in the current six-month window.</p> : appointmentBookings.map((event) => (
              <article className="calendar-appointment-type" key={event.id}>
                <div>
                  <strong>{event.data.title}</strong>
                  <p>{new Date(event.data.start).toLocaleString()} – {new Date(event.data.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="muted">{event.data.attendees?.length || 0} staff invitees · {event.data.timezone}</p>
                </div>
                <div className="phase3-actions">
                  <button className="secondary-button" disabled={busy || event.read_only} onClick={() => editEvent(event)}>Reschedule</button>
                  <button className="secondary-button" disabled={busy || event.read_only} onClick={() => void cancelAppointment(event)}>Cancel</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : section === 'availability' ? (
        <section className="calendar-availability-page">
          <div className="panel">
            <h3>Suggested 60-minute times</h3>
            {!availability ? (
              <p role="status">Checking selected calendars…</p>
            ) : availability.data.some((item: any) => !item.work_days) ? (
              <p>
                Some selected members have not shared work hours. Ask them to update Calendar
                Settings before suggesting a team time.
              </p>
            ) : suggestedAvailability(availability.data, startOfWeek(date).toISOString()).length ? (
              <ul>
                {suggestedAvailability(availability.data, startOfWeek(date).toISOString()).map(
                  (start) => (
                    <li key={start}>
                      {new Date(start).toLocaleString()} –{' '}
                      {new Date(Date.parse(start) + 3600000).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p>No common one-hour time was found in this week for the selected members.</p>
            )}
          </div>
          <div className="calendar-availability-grid">
            {(availability?.data || []).map((item: any) => (
              <article className="panel" key={item.member_id}>
                <h3>
                  {members.find((member) => member.user_id === item.member_id)?.display_name ||
                    'Workspace member'}
                </h3>
                <small>{item.timezone}</small>
                {item.work_days ? (
                  <p>
                    {item.work_days
                      .map((day: any) => `${weekDays[day.weekday]} ${day.start}–${day.end}`)
                      .join(' · ')}
                  </p>
                ) : (
                  <p className="muted">Work hours have not been shared with the team.</p>
                )}
                <strong>
                  {item.busy.length ? 'Busy periods' : 'No scheduled meetings in this range'}
                </strong>
                {item.busy.map((period: any) => (
                  <p key={period.start}>
                    {new Date(period.start).toLocaleString()} –{' '}
                    {new Date(period.end).toLocaleTimeString()}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </section>
      ) : invitations ? (
        <section className="phase3-list">
          {invitationEvents.map((e) => (
            <article key={e.id}>
              <div>
                <h3>{e.data.title}</h3>
                <p>
                  {new Date(e.data.start).toLocaleString()} –{' '}
                  {new Date(e.data.end).toLocaleString()} · {e.data.timezone}
                </p>
                <small>
                  Organizer:{' '}
                  {members.find((m) => m.user_id === e.data.organizer_id)?.display_name ||
                    'Workspace member'}
                </small>
              </div>
              <div className="phase3-actions">
                <button className="secondary-button" onClick={() => void respond(e, 'accepted')}>
                  Accept
                </button>
                <button className="secondary-button" onClick={() => void respond(e, 'tentative')}>
                  Tentative
                </button>
                <button className="quiet-button" onClick={() => void respond(e, 'declined')}>
                  Decline
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : view === 'month' ? (
        <section className="calendar-month">
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <strong key={d}>{d}</strong>
            ))}
          </div>
          <div className="calendar-month-grid">
            {days.map((d) => {
              const dayEvents = eventsOnDay(visible, d);
              const shownEvents = dayEvents.slice(0, 3);
              return <div key={dayKey(d)} className={d.getMonth() === date.getMonth() ? '' : 'outside'}>
                <button
                  className="calendar-day-number"
                  onClick={() => {
                    setDate(d);
                    setView('day');
                  }}
                >
                  {d.getDate()}
                </button>
                {shownEvents.map((e) => (
                  <button
                    key={e.id}
                    className={`event-chip${e.source === 'people_leave' ? ' calendar-leave-chip' : ''}`}
                      disabled={e.read_only}
                      title={e.data.title}
                      onClick={() => !e.read_only && editEvent(e)}
                    >
                      {e.data.title}
                    </button>
                  ))}
                {dayEvents.length > 3 && <button className="event-chip calendar-more" onClick={() => { setDate(d); setView('day'); }}>+{dayEvents.length - 3} more</button>}
              </div>
            })}
          </div>
        </section>
      ) : (
        <section
          ref={calendarGrid}
          className="calendar-time-grid"
          style={{ '--calendar-days': days.length } as any}
        >
          <div className="calendar-grid-header">
            <div className="calendar-day-head">
              <span>Time</span>
              {days.map((d) => (
                <strong key={dayKey(d)}>
                  {d.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </strong>
              ))}
            </div>
            {visible.some((e) => e.source === 'people_leave' && e.data.all_day) && (
              <p className="calendar-leave-note">Approved leave shown here follows the People app's access rules. Private reasons are not displayed.</p>
            )}
            <div className="calendar-allday-grid" aria-label="All-day events">
              <span className="calendar-allday-label">All day</span>
              {layoutCalendarAllDay(visible, days).map(({ event, first, last, lane }) => (
                <button
                  type="button"
                  className={`calendar-allday-event${event.source === 'people_leave' ? ' calendar-leave-chip' : ''}`}
                  key={event.id}
                  style={{ gridColumn: `${first + 2} / ${last + 3}`, gridRow: lane + 1 }}
                  disabled={event.read_only}
                  onClick={() => !event.read_only && editEvent(event)}
                >
                  {event.data.title}
                </button>
              ))}
            </div>
          </div>
          <div className="calendar-hour-grid">
            <div className="calendar-hours">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i}>{String(i).padStart(2, '0')}:00</span>
              ))}
            </div>
            {days.map((d) => (
              <div className="calendar-day-column" key={dayKey(d)}>
                {Array.from({ length: 24 }, (_, i) => (
                  <button
                    className="calendar-hour"
                    key={i}
                    type="button"
                    aria-label={`Create meeting ${d.toLocaleDateString()} ${String(i).padStart(2, '0')}:00`}
                    onClick={() => {
                      const start = new Date(d);
                      start.setHours(i, 0, 0, 0);
                      const end = new Date(start);
                      end.setHours(end.getHours() + 1);
                      setForm({ ...initial(), start: localInput(start), end: localInput(end) });
                    }}
                  />
                ))}
                {layoutOverlappingEvents(visible, d).map(({ event: e, start, end, lane, lanes }) => {
                    const s = new Date(start),
                      en = new Date(end),
                      top = (s.getHours() + s.getMinutes() / 60) * 54,
                      height = Math.max(32, ((end - start) / 3600000) * 54);
                    return (
                      <button
                        key={e.id}
                        className="calendar-event"
                        disabled={e.read_only}
                        style={{ top, height, left: `calc(${(lane * 100) / lanes}% + 4px)`, width: `calc(${100 / lanes}% - 8px)`, right: 'auto' }}
                        title={`${e.data.title} · ${e.data.visibility === 'private' ? 'Private' : ''}`}
                        onClick={() => !e.read_only && editEvent(e)}
                      >
                        <strong>{e.data.title}</strong>
                        <small>
                          {s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                          {en.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </button>
                    );
                  })}
                {dayKey(d) === dayKey(new Date()) && (() => {
                  const now = new Date();
                  return <span className="calendar-now-marker" style={{ top: (now.getHours() + now.getMinutes() / 60) * 54 }} aria-label="Current time" />;
                })()}
              </div>
            ))}
          </div>
        </section>
      )}
      {section !== 'settings' && (
        <aside className="phase3-sidebar">
          <CalendarMiniMonth date={date} onChange={setDate} />
          <h3>Attendee calendars</h3>
          {members.map((m) => (
            <label className="checkbox-field" key={m.user_id}>
              <input
                type="checkbox"
                checked={selectedMembers.includes(m.user_id)}
                onChange={(e) =>
                  setSelectedMembers((ids) =>
                    e.target.checked ? [...ids, m.user_id] : ids.filter((id) => id !== m.user_id),
                  )
                }
              />
              <span>{m.display_name || m.email || 'Workspace member'}</span>
            </label>
          ))}
          <p className="muted">
            Private meeting details are visible only to organizers and invited attendees.
          </p>
        </aside>
      )}
      {form && (
        <Overlay portal onClose={() => !busy && setForm(null)}>
          <section
            className="panel phase3-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-new-title"
          >
            <header>
              <div>
                <small>Calendar</small>
                <h2 id="calendar-new-title">{form.id ? 'Meeting details' : 'New Event'}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => !busy && setForm(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <Field label="Title">
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={180}
                placeholder="Add title"
              />
            </Field>
            <div className="phase3-form-grid">
              <Field label="Start">
                <input
                  type="datetime-local"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </Field>
              <Field label="End">
                <input
                  type="datetime-local"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </Field>
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(e) => {
                  if (!e.target.checked) {
                    const start = form.start.slice(0, 10) + 'T09:00';
                    setForm({
                      ...form,
                      all_day: false,
                      start,
                      end: form.start.slice(0, 10) + 'T10:00',
                    });
                    return;
                  }
                  const startDate = form.start.slice(0, 10);
                  const next = new Date(startDate + 'T12:00:00Z');
                  next.setUTCDate(next.getUTCDate() + 1);
                  const endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
                  setForm({
                    ...form,
                    all_day: true,
                    start: startDate + 'T00:00',
                    end: endDate + 'T00:00',
                  });
                }}
              />{' '}
              All day
            </label>
            <Field label="Timezone">
              <input
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              />
            </Field>
            <Field label="Attendees">
              <select
                multiple
                value={form.attendees}
                onChange={(e) =>
                  setForm({
                    ...form,
                    attendees: Array.from(e.target.selectedOptions, (x) => x.value),
                  })
                }
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email}
                  </option>
                ))}
              </select>
            </Field>
            {form.linked_record?.kind === 'work_task' && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => openWorkTask(form.linked_record.id)}
              >
                Open linked Work task
              </button>
            )}
            {form.linked_record?.kind === 'crm_entry' && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => openCrmRecord(form.linked_record.id)}
              >
                Open linked CRM record
              </button>
            )}
            {form.linked_record?.kind === 'sales_quote' && (
              <button type="button" className="secondary-button" onClick={() => openSalesQuote(form.linked_record.id)}>
                Open linked Sales quotation
              </button>
            )}
            {form.linked_record?.kind === 'document' && (
              <button type="button" className="secondary-button" onClick={() => openDocument(form.linked_record.id)}>
                Open linked Document
              </button>
            )}
            {(!form.id || form.scope === 'series') &&
              form.linked_record?.kind !== 'calendar_appointment_type' && (
              <Field label="Related Work, CRM, Sales or Documents record">
                {workState === 'installed' || crmState === 'installed' || salesState === 'installed' || documentsState === 'installed' ? (
                  <select
                    value={
                      ['work_task', 'crm_entry', 'sales_quote', 'document'].includes(form.linked_record?.kind)
                        ? `${form.linked_record.kind}:${form.linked_record.id}`
                        : ''
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        linked_record: e.target.value
                          ? {
                              kind: e.target.value.startsWith('work_task:')
                                ? 'work_task'
                                : e.target.value.startsWith('crm_entry:') ? 'crm_entry' : e.target.value.startsWith('sales_quote:') ? 'sales_quote' : 'document',
                              id: e.target.value.split(':', 2)[1],
                            }
                          : null,
                      })
                    }
                  >
                    <option value="">No linked record</option>
                    {workState === 'installed' && form.linked_record?.kind === 'work_task' &&
                      !workTasks.some((task) => task.id === form.linked_record.id) && (
                        <option value={`work_task:${form.linked_record.id}`}>
                          Existing linked Work task
                        </option>
                      )}
                    {workState === 'installed' && workTasks.map((task) => (
                      <option key={`work:${task.id}`} value={`work_task:${task.id}`}>
                        Work · {task.data.title} · {task.project_name}
                      </option>
                    ))}
                    {crmState === 'installed' && form.linked_record?.kind === 'crm_entry' &&
                      !crmEntries.some((entry) => entry.id === form.linked_record.id) && (
                        <option value={`crm_entry:${form.linked_record.id}`}>
                          Existing linked CRM record
                        </option>
                      )}
                    {crmState === 'installed' && crmEntries.map((entry) => (
                      <option key={`crm:${entry.id}`} value={`crm_entry:${entry.id}`}>
                        CRM · {entry.title}
                      </option>
                    ))}
                    {salesState === 'installed' && form.linked_record?.kind === 'sales_quote' &&
                      !salesQuotes.some((quote) => quote.id === form.linked_record.id) && (
                        <option value={`sales_quote:${form.linked_record.id}`}>Existing linked Sales quotation</option>
                      )}
                    {salesState === 'installed' && salesQuotes.map((quote) => (
                      <option key={`sales:${quote.id}`} value={`sales_quote:${quote.id}`}>
                        Sales · {quote.reference} · {quote.status}
                      </option>
                    ))}
                    {documentsState === 'installed' && form.linked_record?.kind === 'document' &&
                      !documentsList.some((document) => document.id === form.linked_record.id) && (
                        <option value={`document:${form.linked_record.id}`}>Existing linked Document (access rechecked)</option>
                      )}
                    {documentsList.map((document) => (
                      <option key={`document:${document.id}`} value={`document:${document.id}`}>
                        Document · {document.data?.name || document.id}
                      </option>
                    ))}
                  </select>
                ) : workState === 'error' || crmState === 'error' || salesState === 'error' ? (
                  <p className="muted">
                    Linked app access could not be checked. Reload Calendar to try again.
                  </p>
                ) : workState === 'loading' || crmState === 'loading' || salesState === 'loading' ? (
                  <p className="muted">Checking Work, CRM and Sales app access…</p>
                ) : (
                  <p className="muted">Install AfriCore Work, CRM or Sales to link its records.</p>
                )}
              </Field>
            )}
            <Field label="Location">
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="Online meeting link">
              <input
                type="url"
                value={form.meeting_url}
                onChange={(e) => setForm({ ...form, meeting_url: e.target.value })}
              />
            </Field>
            {form.series_id && form.series_data?.recurrence_rule && (
              <Field label="Apply edits to">
                <select
                  value={form.scope}
                  onChange={(e) => {
                    const scope = e.target.value;
                    const source = scope === 'series' ? form.series_data : form.occurrence_data;
                    setForm({
                      ...form,
                      title: source.title,
                      description: source.description,
                      timezone: source.timezone,
                      all_day: source.all_day,
                      location: source.location,
                      meeting_url: source.meeting_url,
                      visibility: source.visibility || form.visibility,
                      recurrence: source.recurrence,
                      recurrence_rule: source.recurrence_rule,
                      linked_record: source.linked_record || null,
                      attendees: (
                        source.attendees || form.attendees.map((user_id: string) => ({ user_id }))
                      ).map((person: any) =>
                        typeof person === 'string' ? person : person.user_id,
                      ),
                      start: calendarTimeInput(source.start, source.timezone),
                      end: calendarTimeInput(source.end, source.timezone),
                      original_times: {
                        start: { instant: source.start, timezone: source.timezone },
                        end: { instant: source.end, timezone: source.timezone },
                      },
                      scope,
                    });
                  }}
                >
                  <option value="occurrence">This occurrence</option>
                  <option value="series">Entire series</option>
                </select>
              </Field>
            )}
            {(!form.id || form.scope === 'series') && (
              <section className="calendar-recurrence-settings">
                <Field label="Repeat">
                  <select
                    value={form.recurrence}
                    onChange={(e) => {
                      const recurrence = e.target.value;
                      setForm({
                        ...form,
                        recurrence,
                        recurrence_rule:
                          recurrence === 'none'
                            ? null
                            : {
                                frequency: recurrence,
                                interval: 1,
                                weekdays: [],
                                end: 'never',
                                count: null,
                                until: null,
                              },
                      });
                    }}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </Field>
                {form.recurrence !== 'none' && form.recurrence_rule && (
                  <>
                    <Field label="Repeat every">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={form.recurrence_rule.interval}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            recurrence_rule: {
                              ...form.recurrence_rule,
                              interval: Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                            },
                          })
                        }
                      />
                    </Field>
                    {form.recurrence === 'weekly' && (
                      <fieldset className="calendar-weekday-picker">
                        <legend>Repeat on</legend>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, weekday) => (
                          <label className="checkbox-field" key={label}>
                            <input
                              type="checkbox"
                              checked={
                                (form.recurrence_rule.weekdays || []).includes(weekday) ||
                                (!(form.recurrence_rule.weekdays || []).length &&
                                  weekday ===
                                    new Date(form.start.slice(0, 10) + 'T12:00:00Z').getUTCDay())
                              }
                              disabled={
                                weekday ===
                                new Date(form.start.slice(0, 10) + 'T12:00:00Z').getUTCDay()
                              }
                              onChange={(e) => {
                                const anchorDay = new Date(
                                  form.start.slice(0, 10) + 'T12:00:00Z',
                                ).getUTCDay();
                                const weekdays = new Set(
                                  (form.recurrence_rule.weekdays || []).length
                                    ? form.recurrence_rule.weekdays
                                    : [anchorDay],
                                );
                                if (e.target.checked) weekdays.add(weekday);
                                else weekdays.delete(weekday);
                                setForm({
                                  ...form,
                                  recurrence_rule: {
                                    ...form.recurrence_rule,
                                    weekdays: [...weekdays].sort(),
                                  },
                                });
                              }}
                            />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <Field label="Ends">
                      <select
                        value={form.recurrence_rule.end}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            recurrence_rule: { ...form.recurrence_rule, end: e.target.value },
                          })
                        }
                      >
                        <option value="never">Never</option>
                        <option value="count">After a number of events</option>
                        <option value="until">On a date</option>
                      </select>
                    </Field>
                    {form.recurrence_rule.end === 'count' && (
                      <Field label="Number of events">
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={form.recurrence_rule.count || 1}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              recurrence_rule: {
                                ...form.recurrence_rule,
                                count: Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
                              },
                            })
                          }
                        />
                      </Field>
                    )}
                    {form.recurrence_rule.end === 'until' && (
                      <Field label="Last date">
                        <input
                          type="date"
                          value={form.recurrence_rule.until || dayKey(new Date(form.start))}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              recurrence_rule: {
                                ...form.recurrence_rule,
                                until: e.target.value || null,
                              },
                            })
                          }
                        />
                      </Field>
                    )}
                  </>
                )}
              </section>
            )}
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            {form.id && form.organizer_id === actorId && form.scope !== 'occurrence' && (
              <section className="calendar-history">
                <button className="secondary-button" onClick={() => void loadEventHistory()}>
                  {eventHistory ? 'Refresh event history' : 'View event history'}
                </button>
                {eventHistory && (
                  <ol aria-label="Event history">
                    {eventHistory.map((entry: any) => (
                      <li key={entry.version}>
                        <strong>{entry.action}</strong> · v{entry.version} ·{' '}
                        {new Date(entry.created_at).toLocaleString()}
                        <span>{entry.title} · {new Date(entry.start).toLocaleString()}–{new Date(entry.end).toLocaleTimeString()} ({entry.timezone})</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
            <footer>
              {form.id && (
                <button className="quiet-button" disabled={busy} onClick={() => void cancelEvent()}>
                  {form.scope === 'occurrence' ? 'Cancel this occurrence' : 'Cancel meeting'}
                </button>
              )}
              <button className="button" disabled={busy || !form.title} onClick={() => void save()}>
                {form.id ? 'Save changes' : 'Save'}
              </button>
              <button className="secondary-button" disabled={busy} onClick={() => setForm(null)}>
                Discard
              </button>
            </footer>
          </section>
        </Overlay>
      )}
    </main>
  );
}
