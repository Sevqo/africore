import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/navigation';
import './phase3-apps.css';

type Appointment = { name: string; duration_minutes: number; timezone: string; capacity: number };
type Booking = { id: string; status: string; start: string; end: string; timezone: string; duration_minutes: number; proposed_start?: string | null; proposed_end?: string | null };
const json = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body;
};
const today = (timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (name: string) => parts.find((value) => value.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const labelTime = (value: string, timezone: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
function zonedIso(value: string, timezone: string) {
  const [date, time] = value.split('T');
  if (!date || !time) throw new Error('Choose a valid date and time');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const format = (stamp: number) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(stamp).map((part) => [part.type, part.value]));
  for (const delta of [-18, -6, 6, 18]) {
    const sample = wall + delta * 3600000;
    const p = format(sample);
    const offset = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - sample;
    const result = wall - offset;
    const check = format(result);
    if (Number(check.year) === year && Number(check.month) === month && Number(check.day) === day && Number(check.hour) === hour && Number(check.minute) === minute) return new Date(result).toISOString();
  }
  throw new Error('That local time does not exist in the appointment timezone');
}

export function PublicAppointment({ mode, token }: { mode: 'book' | 'manage'; token: string }) {
  const [type, setType] = useState<Appointment | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const bookingIntent = useRef<{ payload: string; key: string } | null>(null);
  const apiBase = mode === 'book' ? `/api/public/calendar/${encodeURIComponent(token)}` : `/api/public/calendar/manage/${encodeURIComponent(token)}`;
  const statusText = useMemo(() => booking?.status?.replaceAll('_', ' ') || '', [booking?.status]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const result = await json(apiBase);
        if (!live) return;
        if (mode === 'book') {
          setDate(today(result.timezone));
          setType(result);
        } else setBooking(result);
      } catch (err) { if (live) setError(err instanceof Error ? err.message : 'Unable to load this booking'); }
    };
    void load();
    return () => { live = false; };
  }, [apiBase, mode]);

  useEffect(() => {
    if (mode !== 'book' || !type || !date) return;
    let live = true;
    setSelected('');
    setSlots([]);
    setError('');
    json(`${apiBase}/availability?date=${encodeURIComponent(date)}`)
      .then((result) => { if (live) setSlots(result.slots || []); })
      .catch((err) => { if (live) { setSlots([]); setError(err instanceof Error ? err.message : 'Availability is unavailable'); } });
    return () => { live = false; };
  }, [apiBase, date, mode, type]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !slots.includes(selected)) return;
    pending.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const details = { start: selected, name, email, phone, note, consent: true };
      const payload = JSON.stringify(details);
      if (bookingIntent.current?.payload !== payload)
        bookingIntent.current = { payload, key: crypto.randomUUID() };
      const result = await json(`${apiBase}/bookings`, { method: 'POST', body: JSON.stringify({ ...details, request_key: bookingIntent.current.key }) });
      if (typeof result.manage_url !== 'string' || !/^\/calendar\/manage\/[A-Za-z0-9_-]{40,60}$/.test(result.manage_url))
        throw new Error('Booking status is unavailable. Retry to recover your request.');
      navigate(result.manage_url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit your request'); }
    finally { pending.current = false; setBusy(false); }
  };

  const manage = async (action: 'cancel' | 'reschedule') => {
    if (!booking || pending.current) return;
    pending.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const body = action === 'cancel' ? { action } : { action, start: zonedIso(selected, booking?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone) };
      const result = await json(apiBase, { method: 'POST', body: JSON.stringify(body) });
      setMessage(result.status === 'reschedule_requested' || result.status === 'cancellation_requested' ? 'Your change request is waiting for confirmation.' : result.start ? 'Your request has moved to the selected time.' : `Booking ${result.status.replaceAll('_', ' ')}.`);
      setBooking({ ...booking, ...result });
      setSelected('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this booking'); }
    finally { pending.current = false; setBusy(false); }
  };

  return <main className="public-appointment-page">
    <header><a className="public-appointment-brand" href="/">AfriCore</a><span>Appointment booking</span></header>
    <section className="public-appointment-card">
      {mode === 'book' ? <>
        {!type && !error && <p role="status">Loading booking details…</p>}
        {type && <>
          <p className="public-appointment-eyebrow">BOOK AN APPOINTMENT</p><h1>{type.name}</h1>
          <p>{type.duration_minutes} minutes · {type.timezone}</p>
          <form onSubmit={(event) => void submit(event)}>
            <label>Choose a date<input type="date" min={today(type.timezone)} value={date} onChange={(event) => { setSelected(''); setSlots([]); setDate(event.target.value); }} required /></label>
            <fieldset><legend>Available times</legend>{slots.length ? <div className="public-appointment-slots">{slots.map((slot) => <button type="button" key={slot} aria-pressed={selected === slot} className={selected === slot ? 'selected' : ''} onClick={() => setSelected(slot)}>{labelTime(slot, type.timezone).split(', ').at(-1)}</button>)}</div> : <p>No available times on this date. Choose another date.</p>}</fieldset>
            <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
            <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
            <label>Phone (optional)<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} /></label>
            <label>Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} /></label>
            <label className="public-appointment-consent"><input type="checkbox" required /> I agree to share these details with the appointment organizer to handle this request.</label>
            <button className="public-appointment-primary" type="submit" disabled={busy || !selected}>{busy ? 'Submitting…' : 'Request appointment'}</button>
          </form>
        </>}
      </> : <>
        {!booking && !error && <p role="status">Loading booking status…</p>}
        {booking && <><p className="public-appointment-eyebrow">BOOKING STATUS</p><h1>Your appointment</h1><p className="public-appointment-status">{statusText}</p><p>{labelTime(booking.start, booking.timezone)}</p>{booking.proposed_start && <p>Requested new time: {labelTime(booking.proposed_start, booking.timezone)}</p>}
          {['pending', 'confirmed'].includes(booking.status) && <><label>Request another time ({booking.timezone})<input type="datetime-local" value={selected} onChange={(event) => setSelected(event.target.value)} /></label><button className="public-appointment-primary" disabled={busy || !selected} onClick={() => void manage('reschedule')}>Request reschedule</button><button className="public-appointment-secondary" disabled={busy} onClick={() => void manage('cancel')}>Cancel appointment</button></>}
        </>}
      </>}
      {error && <p className="public-appointment-error" role="alert">{error}</p>}
      {message && mode === 'manage' && <p className="public-appointment-success" role="status">{message}</p>}
      <footer>AfriCore · Your details are stored securely for this appointment request.</footer>
    </section>
  </main>;
}
