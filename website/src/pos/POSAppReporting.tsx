import { useState } from 'react';
import { type API } from '../operations/UI';
import { POSDailyReport } from './POSDailyReport';

export function POSAppReporting({
  api,
  registers,
  online,
  revision,
  identity,
}: {
  api: API;
  registers: any[];
  online: boolean;
  revision: number;
  identity: string;
}) {
  const [registerId, setRegisterId] = useState(registers[0]?.id || ''),
    register = registers.find((row: any) => row.id === registerId) || registers[0];
  return (
    <div className="pos-app-reporting">
      <header className="pos-app-page-head">
        <div>
          <span className="eyebrow">Reporting</span>
          <h2>Register analysis</h2>
          <p>
            Authoritative daily invoice, cash and shift observations for one register-local date.
          </p>
        </div>
        <label className="pos-app-report-register">
          <span>Register</span>
          <select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            {registers.map((row: any) => (
              <option key={row.id} value={row.id}>
                {row.data.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="pos-app-report-toolbar">
        <span className="badge">Posted invoice evidence</span>
        <span className="badge">Merchant cash observation</span>
        <span className="badge">Sandbox electronic</span>
      </div>
      {register ? (
        <POSDailyReport
          key={identity + '\0' + register.id}
          api={api}
          register={register}
          revision={revision}
          online={online}
        />
      ) : (
        <p role="status">No register is available for reporting.</p>
      )}
      <p className="pos-app-note">
        Reporting currently supports one register-local day per request. A multi-day range, cashier
        performance comparison and provider-settled totals are not supplied by the authoritative
        backend and are not fabricated here.
      </p>
    </div>
  );
}
