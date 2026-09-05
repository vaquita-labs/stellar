'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import { type FeedbackPostRow, updateFeedbackStatus, useFeedbackPosts } from '@/core-ui/hooks';
import { FEEDBACK_STATUSES, type FeedbackKind, type FeedbackStatus } from '@vaquita/shared';
import { Spinner } from '@heroui/react';
import { Card, Select } from '@vaquita/ui';
import { useState } from 'react';

// Tabs across the top. `undefined` is the "everything" tab, which is also the
// default: the inbox is small enough that the useful first view is all of it.
const KIND_TABS: { key: string; label: string; kind?: FeedbackKind }[] = [
  { key: 'all', label: 'All' },
  { key: 'bug', label: 'Bugs', kind: 'bug' },
  { key: 'feedback', label: 'Feedback', kind: 'feedback' },
];

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  closed: 'Closed',
};

// Only `open` is loud. The rest are already-handled states and should not
// compete for attention while scanning the list.
const STATUS_CHIP: Record<FeedbackStatus, string> = {
  open: 'bg-warning-100 text-warning-700',
  planned: 'bg-primary/10 text-primary',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-success-100 text-success-700',
  closed: 'bg-default-100 text-default-500',
};

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export default function Page() {
  const [kindTab, setKindTab] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | ''>('');

  const kind = KIND_TABS.find((t) => t.key === kindTab)?.kind;
  const {
    data: posts,
    refetch,
    isLoading,
  } = useFeedbackPosts({
    ...(kind ? { kind } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  });

  // Which row is mid-write. Per-row rather than a single flag so changing one
  // report's status doesn't freeze the selects on every other row.
  const [savingId, setSavingId] = useState<string | null>(null);

  const changeStatus = async (post: FeedbackPostRow, status: FeedbackStatus) => {
    if (status === post.status) return;
    setSavingId(post.id);
    try {
      await updateFeedbackStatus(post.id, status);
      addSuccessToast('Saved', `Moved to “${STATUS_LABELS[status]}”.`);
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Feedback</h1>
        <p className="text-sm text-default-500">
          Bug reports and feedback sent from the app’s Concierge screen, newest first.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-2">
          {KIND_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setKindTab(tab.key)}
              className={`rounded-full border border-black px-3 py-1 text-sm font-semibold transition ${
                kindTab === tab.key ? 'bg-black text-white' : 'bg-white text-black hover:bg-primary/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Select
          aria-label="Filter by status"
          className="w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FeedbackStatus | '')}
        >
          <option value="">Any status</option>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (posts?.length ?? 0) === 0 ? (
        <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
          No reports match this filter.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts?.map((post) => (
            <li key={post.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-default-100 px-1.5 font-mono text-xs uppercase">{post.kind}</span>
                      <span className={`rounded px-1.5 text-xs font-semibold ${STATUS_CHIP[post.status]}`}>
                        {STATUS_LABELS[post.status]}
                      </span>
                    </div>
                    <span className="font-semibold text-black">{post.title}</span>
                  </div>

                  <Select
                    aria-label={`Status of ${post.title}`}
                    className="w-40"
                    value={post.status}
                    disabled={savingId === post.id}
                    onChange={(e) => changeStatus(post, e.target.value as FeedbackStatus)}
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* `whitespace-pre-wrap` keeps the reporter's line breaks: in a
                    bug report the steps are usually one per line. */}
                {post.details ? (
                  <p className="whitespace-pre-wrap text-sm text-black/80">{post.details}</p>
                ) : (
                  <p className="text-sm italic text-default-400">No details given.</p>
                )}

                {/* Auto-captured context — the cheap substitute for a screenshot. */}
                <div className="flex flex-col gap-0.5 text-xs text-default-400">
                  <span>
                    {formatDate(post.createdAt)}
                    {post.appPath ? ` · ${post.appPath}` : ''}
                    {post.locale ? ` · ${post.locale}` : ''}
                  </span>
                  <span className="font-mono break-all">{post.walletAddress}</span>
                  {post.userAgent && <span className="break-all">{post.userAgent}</span>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
