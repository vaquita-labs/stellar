'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-black border-b-2 bg-primary px-3 py-1 text-xs font-semibold text-black transition hover:-translate-y-0.5"
    >
      {copied ? 'Copied ✓' : 'Copy markdown'}
    </button>
  );
}
