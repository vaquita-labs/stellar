'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  FEEDBACK_MODERATION_STATUSES,
  FEEDBACK_STATUSES,
  type FeedbackKind,
  type FeedbackModerationStatus,
  type FeedbackPostRow,
  type FeedbackStatus,
  deleteFeedbackPost,
  feedbackAttachmentUrl,
  updateFeedbackModeration,
  updateFeedbackStatus,
  useFeedbackPosts,
} from '@/core-ui/hooks';
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

const MODERATION_LABELS: Record<FeedbackModerationStatus, string> = {
  pending: 'Needs review',
  approved: 'Public',
  flagged: 'Flagged',
  rejected: 'Rejected',
};

// The two that need a decision are the two that are loud. 'Public' is the
// resting state and 'Rejected' is already dealt with.
const MODERATION_CHIP: Record<FeedbackModerationStatus, string> = {
  pending: 'bg-warning-100 text-warning-700',
  approved: 'bg-success-100 text-success-700',
  flagged: 'bg-danger-100 text-danger-700',
  rejected: 'bg-default-100 text-default-500',
};

const MODERATION_FILTERS: { key: string; label: string; value?: FeedbackModerationStatus | 'review' }[] = [
  { key: 'review', label: 'Needs review', value: 'review' },
  { key: 'all', label: 'All' },
  ...FEEDBACK_MODERATION_STATUSES.map((s) => ({ key: s, label: MODERATION_LABELS[s], value: s })),
];

const formatDate = (iso: string) => new Date(iso).toLocaleString();

/** Category names as the model writes them: 'sexual/minors' → 'sexual minors'. */
const prettyCategory = (name: string) => name.replace(/[/_-]/g, ' ');

/**
 * Why a report is held, in one line — the categories the model objected to, or
 * the reason there was no verdict at all. Without this the reviewer is looking
 * at a chip and guessing.
 */
function ModerationReason({ post }: { post: FeedbackPostRow }) {
  const result = post.moderationResult;
  const categories = Object.entries(result?.categories ?? {})
    .filter(([, on]) => on)
    .map(([name]) => name);

  if (categories.length > 0) {
    return (
      <p className="text-xs text-danger-600">
        Flagged for {categories.map(prettyCategory).join(', ')}.
      </p>
    );
  }

  if (post.moderationStatus === 'pending') {
    return (
      <p className="text-xs text-warning-700">
        Not checked{result?.error ? `: ${result.error}` : ''} — held until someone reviews it.
      </p>
    );
  }

  return null;
}

export default function Page() {
  const [kindTab, setKindTab] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | ''>('');
  // Opens on the queue, not on everything: the reports waiting on a human are
  // the only ones with a deadline attached.
  const [moderationTab, setModerationTab] = useState<string>('review');

  const kind = KIND_TABS.find((t) => t.key === kindTab)?.kind;
  const moderationStatus = MODERATION_FILTERS.find((f) => f.key === moderationTab)?.value;
  const {
    data: posts,
    refetch,
    isLoading,
  } = useFeedbackPosts({
    ...(kind ? { kind } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(moderationStatus ? { moderationStatus } : {}),
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

  const decide = async (post: FeedbackPostRow, decision: 'approved' | 'rejected') => {
    setSavingId(post.id);
    try {
      await updateFeedbackModeration(post.id, decision);
      addSuccessToast(
        decision === 'approved' ? 'Published' : 'Taken down',
        decision === 'approved' ? 'It is on the board now.' : 'It is off the board. The row is kept.'
      );
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (post: FeedbackPostRow) => {
    // A confirm because this one does not come back: the row, its screenshots
    // and its votes all go. Rejecting is the reversible option and is one
    // button to the left.
    if (!window.confirm(`Delete “${post.title}” for good? The report, its images and its votes are removed.`)) {
      return;
    }
    setSavingId(post.id);
    try {
      await deleteFeedbackPost(post.id);
      addSuccessToast('Deleted', 'The report and everything attached to it are gone.');
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Delete failed');
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

      {/* The moderation queue is its own row above the triage filters: deciding
          what is public and deciding what gets fixed are different jobs, and
          mixing their controls invites doing one while meaning the other. */}
      <div className="flex flex-wrap gap-1.5">
        {MODERATION_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setModerationTab(filter.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              moderationTab === filter.key ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500'
            }`}
          >
            {filter.label}
          </button>
        ))}
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
                      <span
                        className={`rounded px-1.5 text-xs font-semibold ${MODERATION_CHIP[post.moderationStatus]}`}
                      >
                        {MODERATION_LABELS[post.moderationStatus]}
                      </span>
                      {/* How many other users seconded this one on the public
                          board — the whole reason the board exists is that this
                          number is what says "fix this first". */}
                      {post.voteCount > 0 && (
                        <span className="rounded bg-default-100 px-1.5 text-xs font-semibold text-black">
                          ▲ {post.voteCount}
                        </span>
                      )}
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

                <ModerationReason post={post} />

                {post.attachmentIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {post.attachmentIds.map((id) => (
                      // Opens full size in a tab: a 96px thumbnail is enough to
                      // see there is a screenshot, never enough to read it.
                      <a key={id} href={feedbackAttachmentUrl(id)} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- raw bytes from our own route, not the Next optimizer */}
                        <img
                          src={feedbackAttachmentUrl(id)}
                          alt=""
                          loading="lazy"
                          className="h-24 w-24 rounded-medium border border-default-200 object-cover"
                        />
                      </a>
                    ))}
                  </div>
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

                {/* Approve and Reject are the two halves of the review, so they
                    sit together. Delete is pushed to the far end: it is not a
                    stronger Reject, it is the one action with nothing after it. */}
                <div className="flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
                  <button
                    type="button"
                    disabled={savingId === post.id || post.moderationStatus === 'approved'}
                    onClick={() => decide(post, 'approved')}
                    className="rounded-medium bg-success-100 px-3 py-1 text-sm font-semibold text-success-700 transition hover:bg-success-200 disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={savingId === post.id || post.moderationStatus === 'rejected'}
                    onClick={() => decide(post, 'rejected')}
                    className="rounded-medium bg-warning-100 px-3 py-1 text-sm font-semibold text-warning-700 transition hover:bg-warning-200 disabled:opacity-40"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={savingId === post.id}
                    onClick={() => remove(post)}
                    className="ml-auto rounded-medium px-3 py-1 text-sm font-semibold text-danger transition hover:bg-danger-50 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
