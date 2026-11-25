import { useEffect, useState, type FormEvent } from 'react';
import { type API } from '../operations/UI';

type Row = Record<string, any>;
export type InventorySection = 'reorder' | 'putaway' | 'packages' | 'barcode';

const HEADERS: Record<InventorySection, { title: string; subtitle: string }> = {
  reorder: {
    title: 'Min/Max Reordering Rules',
    subtitle: 'Define stock thresholds and lead times for automated replenishment.',
  },
  putaway: {
    title: 'Putaway Rules',
    subtitle: 'Route incoming receipts from receiving docks to designated storage bins.',
  },
  packages: {
    title: 'Packages & Weight Tracking',
    subtitle: 'Manage barcoded boxes and pallets with tare and gross weight.',
  },
  barcode: {
    title: 'Barcode Operations',
    subtitle: 'Scan package, lot, or product barcodes for receiving, picking, packing, and cycle counts.',
  },
};

export function InventoryParityPanel({
  api,
  writable,
  activeSection = 'reorder',
}: {
  api: API;
  writable: boolean;
  activeSection?: InventorySection;
}) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [rules, setRules] = useState<Row[]>([]);
  const [sku, setSku] = useState('SKU-100');
  const [minQty, setMinQty] = useState('10');
  const [maxQty, setMaxQty] = useState('50');

  const [putaways, setPutaways] = useState<Row[]>([]);
  const [locIn, setLocIn] = useState('WH/Input');
  const [locOut, setLocOut] = useState('WH/Aisle-A1');

  const [packages, setPackages] = useState<Row[]>([]);
  const [pkgCode, setPkgCode] = useState('PKG-001');
  const [pkgNet, setPkgNet] = useState('2500');

  const [scanCode, setScanCode] = useState('PKG-001');
  const [scanResult, setScanResult] = useState<Row | null>(null);

  async function refresh() {
    const [r1, r2, r3] = await Promise.allSettled([
      api('/inventory/reordering-rules'),
      api('/inventory/putaway-rules'),
      api('/inventory/packages'),
    ]);
    if (r1.status === 'fulfilled') setRules(r1.value?.rules || []);
    if (r2.status === 'fulfilled') setPutaways(r2.value?.rules || []);
    if (r3.status === 'fulfilled') setPackages(r3.value?.packages || []);
  }

  useEffect(() => {
    refresh();
  }, [api]);

  async function addReorder(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/inventory/reordering-rules', 'POST', {
        product_id: sku,
        warehouse: 'WH-MAIN',
        min_qty: Number(minQty) || 0,
        max_qty: Number(maxQty) || 10,
        qty_multiple: 5,
        lead_days: 3,
      });
      setNotice('Reordering rule saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save reordering rule');
    }
  }

  async function addPutaway(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/inventory/putaway-rules', 'POST', {
        location_in: locIn,
        location_out: locOut,
        storage_category: 'standard',
        priority: 10,
      });
      setNotice('Putaway rule saved.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save putaway rule');
    }
  }

  async function addPackage(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/inventory/packages', 'POST', {
        barcode: pkgCode,
        package_type: 'box',
        location: 'WH/Packing',
        tare_weight_grams: 200,
        net_weight_grams: Number(pkgNet) || 0,
        items: [],
      });
      setNotice('Package created.');
      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to create package');
    }
  }

  async function runScan(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await api('/inventory/barcode/scan', 'POST', {
        barcode: scanCode,
        action: 'pick',
        location: 'WH/Stock',
        qty: 1,
      });
      setScanResult(res);
      setNotice(`Scanned ${res.barcode} (${res.matched_kind}).`);
    } catch (err: any) {
      setError(err?.message || 'Barcode scan failed');
    }
  }

  const header = HEADERS[activeSection];

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{header.title}</h3>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{header.subtitle}</p>
      </div>
      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}

      {activeSection === 'reorder' && (
        <div>
          {writable && (
            <form onSubmit={addReorder} className="ac-inline-form">
              <label>Product SKU<input value={sku} onChange={(e) => setSku(e.target.value)} /></label>
              <label>Min quantity<input value={minQty} onChange={(e) => setMinQty(e.target.value)} /></label>
              <label>Max quantity<input value={maxQty} onChange={(e) => setMaxQty(e.target.value)} /></label>
              <button type="submit" className="button">Add reordering rule</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Product</th><th>Warehouse</th><th>Min</th><th>Max</th><th>Lead days</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}><td>{r.product_id}</td><td>{r.warehouse}</td><td>{r.min_qty}</td><td>{r.max_qty}</td><td>{r.lead_days}d</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === 'putaway' && (
        <div>
          {writable && (
            <form onSubmit={addPutaway} className="ac-inline-form">
              <label>Receiving location<input value={locIn} onChange={(e) => setLocIn(e.target.value)} /></label>
              <label>Target storage bin<input value={locOut} onChange={(e) => setLocOut(e.target.value)} /></label>
              <button type="submit" className="button">Add putaway rule</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Receiving location</th><th>Target storage</th><th>Category</th></tr></thead>
            <tbody>
              {putaways.map((p) => (
                <tr key={p.id}><td>{p.location_in}</td><td>{p.location_out}</td><td>{p.storage_category}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === 'packages' && (
        <div>
          {writable && (
            <form onSubmit={addPackage} className="ac-inline-form">
              <label>Package barcode<input value={pkgCode} onChange={(e) => setPkgCode(e.target.value)} /></label>
              <label>Net weight (g)<input value={pkgNet} onChange={(e) => setPkgNet(e.target.value)} /></label>
              <button type="submit" className="button">Create package</button>
            </form>
          )}
          <table className="data-table">
            <thead><tr><th>Barcode</th><th>Type</th><th>Location</th><th className="num">Gross (g)</th></tr></thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id}><td>{p.barcode}</td><td>{p.package_type}</td><td>{p.location}</td><td className="num">{p.gross_weight_grams}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === 'barcode' && (
        <div>
          {writable && (
            <form onSubmit={runScan} className="ac-inline-form">
              <label>Barcode<input value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder="Scan barcode..." /></label>
              <button type="submit" className="button">Process scan</button>
            </form>
          )}
          {scanResult && (
            <p style={{ fontSize: 13 }}>
              Last scan: <strong>{scanResult.barcode}</strong> — matched <strong>{scanResult.matched_kind}</strong> at {scanResult.location}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
