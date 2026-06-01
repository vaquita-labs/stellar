'use client';

import { FiCopy, FiCheck, FiInfo } from 'react-icons/fi';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export function TestnetUSDCNotice({ networkName, tokenContract }: { networkName: string; tokenContract: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(tokenContract);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // opcional: puedes usar un toast aquí
    }
  };

  if (networkName !== 'Stellar Testnet') return null;

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-yellow-800">Vaquita uses Blend Capital for yield</span>
        </div>
        <span className="text-xs text-yellow-600">Testnet USDC</span>
      </div>

      <div className="flex items-center gap-2 mb-2 justify-center">
        <Image src="/blend.png" alt="Blend Capital" width={32} height={32} className="rounded-sm" />
        <span className="text-xs font-mono text-gray-700 bg-gray-200 px-2 py-1 rounded">
          {truncateAddress(tokenContract)}
        </span>
        <button
          onClick={onCopy}
          className="p-1 hover:bg-yellow-100 rounded transition-colors"
          title={copied ? 'Copied!' : 'Copy address'}
        >
          {copied ? <FiCheck className="h-3 w-3 text-green-600" /> : <FiCopy className="h-3 w-3 text-gray-500" />}
        </button>
      </div>

      <p className="text-xs text-yellow-700 flex items-center gap-1">
        <FiInfo className="h-3 w-3" />
        Need Testnet USDC? Go to {' '}
        <Link
          href="https://testnet.blend.capital/dashboard/?poolId=CDDG7DLOWSHRYQ2HWGZEZ4UTR7LPTKFFHN3QUCSZEXOWOPARMONX6T65"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-yellow-800"
        >
          Blend Capital Testnet
        </Link>
      </p>
    </div>
  );
}
