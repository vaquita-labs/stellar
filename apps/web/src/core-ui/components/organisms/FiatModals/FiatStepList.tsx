'use client';

import { FiCheck, FiLoader, FiLock, FiX } from 'react-icons/fi';

export type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'pending';

export interface FiatStep {
  key: string;
  label: string;
  status: StepStatus;
  /** false → paso aún no cableado (se muestra gris con "soon"). */
  implemented: boolean;
}

export function FiatStepList({ steps }: { steps: FiatStep[] }) {
  return (
    <ol className="flex flex-col gap-2 rounded-lg border border-black border-b-2 bg-white p-3">
      {steps.map((s) => (
        <StepRow key={s.key} label={s.label} status={s.status} implemented={s.implemented} />
      ))}
    </ol>
  );
}

function StepRow({ label, status, implemented }: { label: string; status: StepStatus; implemented: boolean }) {
  const icon =
    status === 'done' ? (
      <FiCheck className="h-4 w-4 text-success" />
    ) : status === 'running' ? (
      <FiLoader className="h-4 w-4 animate-spin text-black" />
    ) : status === 'error' ? (
      <FiX className="h-4 w-4 text-danger" />
    ) : (
      <FiLock className="h-4 w-4 text-gray-300" />
    );
  return (
    <li className={`flex items-center gap-2 text-sm ${implemented ? 'text-black' : 'text-gray-400'}`}>
      {icon}
      <span>{label}</span>
      {!implemented && <span className="ml-auto text-[10px] uppercase text-gray-400">soon</span>}
    </li>
  );
}
