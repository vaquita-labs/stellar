'use client';

import { GenericTable, addDangerToast } from '@/core-ui/components';
import { reviewContract, type ReviewContractResponse } from '@/core-ui/hooks';
import { Modal } from '@heroui/react';
import { Button, Input } from '@vaquita/ui';
import { useCallback, useRef, useState } from 'react';

// GenericTable's `children` receives the parsed row, where each field is
// { value, original, truncated } and `original` is JSON.stringify(rawValue).
// Recover the raw string (e.g. full tx hash) regardless of truncation.
type ParsedCell = { value?: string; original?: string; truncated?: boolean };
const cellRaw = (data: Record<string, unknown>, key: string): string => {
  const cell = data[key] as ParsedCell | undefined;
  if (cell?.original == null) return cell?.value ?? '';
  try {
    return String(JSON.parse(cell.original));
  } catch {
    return cell.original;
  }
};

const prettyJson = (raw: string): string => {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

// Default the range to the last 24h (most public RPCs only retain ~a few days
// of events, so a recent window is the realistic starting point).
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export default function Page() {
  const [from, setFrom] = useState(daysAgoISO(1));
  const [to, setTo] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewContractResponse | null>(null);
  const [details, setDetails] = useState<string | null>(null);

  // Read the latest dates through refs so `run` keeps a STABLE identity. The
  // GenericTable calls its `refetch` prop from an effect keyed on it, so an
  // unstable callback would re-fetch every render (infinite loop).
  const fromRef = useRef(from);
  fromRef.current = from;
  const toRef = useRef(to);
  toRef.current = to;

  const run = useCallback(async () => {
    const f = fromRef.current;
    const t = toRef.current;
    if (!f || !t) {
      addDangerToast('Missing field', 'Pick a start and end date.');
      return;
    }
    if (f > t) {
      addDangerToast('Invalid range', '"From" must be before "To".');
      return;
    }
    setLoading(true);
    try {
      const data = await reviewContract({ from: f, to: t });
      setResult(data);
      data.summary.warnings.forEach((w) => addDangerToast('Heads up', w));
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Review failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const rows = result?.rows ?? [];
  const summary = result?.summary;
  const network = summary?.rpcUrl.includes('testnet') ? 'testnet' : 'public';
  const expertUrl = (kind: 'tx' | 'contract', id: string) =>
    `https://stellar.expert/explorer/${network}/${kind}/${id}`;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-black">Review contract</h1>
        <p className="text-sm text-black/60">
          Scan the pool contract&apos;s on-chain deposit/withdraw events in a date range (read-only).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-4">
        <Input
          type="date"
          label="From"
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          containerClassName="w-40"
        />
        <Input
          type="date"
          label="To"
          value={to}
          min={from}
          max={todayISO()}
          onChange={(e) => setTo(e.target.value)}
          containerClassName="w-40"
        />
        <Button onPress={run} isLoading={loading} isDisabled={loading}>
          Review contract
        </Button>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-black/70">
          <span>
            <strong className="text-black">{summary.total}</strong> events
          </span>
          <span>{summary.deposits} deposits</span>
          <span>{summary.withdrawals} withdrawals</span>
          <span>
            <strong className="text-black">{summary.missingInDb}</strong> missing in DB
          </span>
          <span className="text-black/40">
            {Object.entries(summary.byType)
              .map(([t, n]) => `${t}: ${n}`)
              .join(' · ')}
          </span>
          <span>
            ledgers {summary.ledgerRange.startLedger}–{summary.ledgerRange.endLedger}
          </span>
          {summary.truncated && <span className="text-red-600">truncated (page cap hit)</span>}
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1">
        {rows.length > 0 ? (
          <GenericTable rows={rows} refetch={run} hiddenKeys={['amountRaw', 'details', 'contractId', 'txHash']}>
            {(data) => {
              const txHash = cellRaw(data, 'txHash');
              const contractId = cellRaw(data, 'contractId');
              const detailsJson = cellRaw(data, 'details');
              return (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Button size="sm" variant="ghost" onPress={() => setDetails(detailsJson)}>
                    Details
                  </Button>
                  {txHash && (
                    <a
                      className="text-xs text-blue-600 underline"
                      href={expertUrl('tx', txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Tx ↗
                    </a>
                  )}
                  {contractId && (
                    <a
                      className="text-xs text-blue-600 underline"
                      href={expertUrl('contract', contractId)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Contract ↗
                    </a>
                  )}
                </div>
              );
            }}
          </GenericTable>
        ) : (
          <p className="text-sm text-black/50">
            {summary ? 'No events found in this range.' : 'Pick a date range and review the contract.'}
          </p>
        )}
      </div>

      <Modal.Backdrop isOpen={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Event details</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                {details ? prettyJson(details) : ''}
              </pre>
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setDetails(null)}>Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
