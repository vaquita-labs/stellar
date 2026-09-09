import Link from 'next/link';

// Landing for the admin area (served at `/`): a grid of cards linking to each
// section. Keep this list in sync with the route folders under src/app.
const sections: { href: string; title: string; description: string }[] = [
  {
    href: '/tokens',
    title: 'Tokens',
    description: 'Add, edit and remove supported tokens (contracts, decimals, lock periods).',
  },
  {
    href: '/config',
    title: 'Project configuration',
    description: 'Singleton settings: network, smart-contract environment and allowed origins.',
  },
  {
    href: '/deposits',
    title: 'Deposits',
    description: 'Browse and inspect user deposits.',
  },
  {
    href: '/wallets',
    title: 'Wallet balances',
    description: 'Per-user Blend, DeFindex vault and locked-pool balances, read on-chain.',
  },
  {
    href: '/badges',
    title: 'Badges',
    description: 'Manage achievement badges and their rewards.',
  },
  {
    href: '/rewards',
    title: 'Rewards',
    description: 'Add, edit and remove reward types (key and display name).',
  },
  {
    href: '/map-objects',
    title: 'Map objects',
    description: 'Catalog of placeable map elements: variants, prices and free units.',
  },
  {
    href: '/campaigns',
    title: 'Campaigns',
    description: 'Marketing campaign codes and the shareable attribution links they generate.',
  },
  {
    href: '/release-notes',
    title: 'Release notes',
    description: 'Write and publish the “what’s new” popup users see once per note.',
  },
  {
    href: '/feedback',
    title: 'Feedback',
    description: 'Triage bug reports and feedback sent from inside the app.',
  },
  {
    href: '/onboarding',
    title: 'Onboarding',
    description: 'See which first-run experiences each user finished, and re-open one for them.',
  },
  {
    href: '/notifications',
    title: 'Notifications',
    description: 'Send in-app + push notifications to everyone or specific users.',
  },
  {
    href: '/listening',
    title: 'Listening',
    description: 'Live on-chain event listener and transactions.',
  },
  {
    href: '/contract-events',
    title: 'Review contract',
    description: 'Scan the pool contract for deposit/withdraw events in a date range.',
  },
];

export default function Page() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-black">Admin</h1>
        <p className="text-sm text-black/60">Manage the project configuration and data.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col gap-1 rounded-xl border border-black border-b-2 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/5"
          >
            <span className="text-base font-semibold text-black">{s.title}</span>
            <span className="text-sm text-black/60">{s.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
