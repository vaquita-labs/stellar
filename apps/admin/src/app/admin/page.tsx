import Link from 'next/link';

// Landing for the admin area: a grid of cards linking to each admin section.
// Keep this list in sync with the route folders under src/app/admin.
const sections: { href: string; title: string; description: string }[] = [
  {
    href: '/admin/tokens',
    title: 'Tokens',
    description: 'Add, edit and remove supported tokens (contracts, decimals, lock periods).',
  },
  {
    href: '/config',
    title: 'Project configuration',
    description: 'Singleton settings: network, smart-contract environment and allowed origins.',
  },
  {
    href: '/admin/deposits',
    title: 'Deposits',
    description: 'Browse and inspect user deposits.',
  },
  {
    href: '/admin/badges',
    title: 'Badges',
    description: 'Manage achievement badges and their rewards.',
  },
  {
    href: '/admin/listening',
    title: 'Listening',
    description: 'Live on-chain event listener and transactions.',
  },
];

export default function Page() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-sm text-default-500">Manage the project configuration and data.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col gap-1 rounded-medium border-2 border-default-200 bg-default-50 p-4 transition-colors hover:border-default-400 hover:bg-default-100"
          >
            <span className="text-base font-semibold">{s.title}</span>
            <span className="text-sm text-default-500">{s.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
