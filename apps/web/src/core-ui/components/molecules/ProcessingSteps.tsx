'use client';

import { Spinner } from '@heroui/react';
import { FiCheck } from 'react-icons/fi';

export interface ProcessingStep {
  key: string;
  label: string;
}

interface ProcessingStepsProps {
  steps: ProcessingStep[];
  /** The step running now. Every step before it reads as done, every one after as pending. */
  activeKey: string | null;
}

/**
 * The vertical stepper every money flow shows while it works: circles joined
 * by a line so it reads as a process. Done = green check, running = spinner,
 * pending = grey number.
 *
 * It exists so a flow that signs or waits on the network never looks frozen:
 * a user who sees nothing moving assumes the operation failed and retries.
 */
export function ProcessingSteps({ steps, activeKey }: ProcessingStepsProps) {
  const activeIdx = steps.findIndex((s) => s.key === activeKey);

  return (
    <div className="flex flex-col gap-4 py-3">
      <ol className="flex flex-col px-1" aria-live="polite">
        {steps.map((s, i) => {
          const isActive = i === activeIdx;
          const isDone = activeIdx > i;
          const isLast = i === steps.length - 1;
          return (
            <li key={s.key} className="flex gap-3" aria-current={isActive ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-black transition-colors ${
                    isDone ? 'bg-success' : isActive ? 'bg-white' : 'bg-black/5'
                  }`}
                >
                  {isDone ? (
                    <FiCheck className="w-4 h-4 text-black" strokeWidth={3} />
                  ) : isActive ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                  )}
                </span>
                {!isLast ? (
                  <span
                    className={`w-0.5 flex-1 min-h-5 my-1 rounded-full transition-colors ${
                      isDone ? 'bg-success' : 'bg-black/15'
                    }`}
                  />
                ) : null}
              </div>
              <span
                className={`pt-1.5 text-sm ${isActive ? 'font-bold text-black' : isDone ? 'text-gray-500' : 'text-gray-400'}`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
