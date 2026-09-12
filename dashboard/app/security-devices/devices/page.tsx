'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface SecurityDevice {
  id: string;
  name: string;
  deviceType: string;
  branchId: string;
  ipAddress?: string;
  health?: { status?: string; lastSeen?: string };
}

export default function SecurityDeviceInventoryPage() {
  const params = useSearchParams();
  const type = params?.get('type')?.trim() ?? '';
  const [devices, setDevices] = useState<SecurityDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ includeHealth: 'true' });
      if (type) query.set('deviceType', type);
      const response = await fetch(`/api/security-devices?${query.toString()}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to load devices');
      setDevices(Array.isArray(body.data) ? body.data : []);
      setError(null);
    } catch (reason) {
      setDevices([]);
      setError(reason instanceof Error ? reason.message : 'Unable to load devices');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  return <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/security-devices" className="mb-3 inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"><ArrowLeft size={16} />Security Device Hub</Link><h1 className="text-3xl font-bold">{type || 'All'} devices</h1><p className="mt-1 text-sm text-gray-600">Live inventory filtered from the authenticated security-device API.</p></div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
      </div>
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="py-12 text-center text-gray-500">Loading devices…</p> : devices.length === 0 ? <p className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">No matching devices found.</p> : <div className="overflow-hidden rounded-lg border border-gray-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="p-3">Device</th><th className="p-3">Type</th><th className="p-3">Branch</th><th className="p-3">Status</th><th className="p-3">Address</th></tr></thead><tbody>{devices.map((device) => <tr key={device.id} className="border-t border-gray-100"><td className="p-3"><Link className="font-medium text-blue-700 hover:underline" href={`/security-devices/${encodeURIComponent(device.id)}`}>{device.name}</Link></td><td className="p-3">{device.deviceType}</td><td className="p-3">{device.branchId}</td><td className="p-3">{device.health?.status ?? 'unknown'}</td><td className="p-3">{device.ipAddress ?? '—'}</td></tr>)}</tbody></table></div>}
    </div>
  </main>;
}
