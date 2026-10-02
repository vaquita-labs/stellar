'use client';

import { addDangerToast } from '@/core-ui/components';
import {
  SUPPORT_MESSAGE_MAX,
  type SupportConversationStatus,
  type SupportConversationSummary,
  useSupportConversations,
  useSupportReply,
  useSupportResolve,
  useSupportThread,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { useSearchParams } from 'next/navigation';
import { KeyboardEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';

const FILTERS: { key: string; label: string; status?: SupportConversationStatus }[] = [
  { key: 'waiting', label: 'Waiting on us', status: 'waiting' },
  { key: 'answered', label: 'Answered', status: 'answered' },
  { key: 'resolved', label: 'Resolved', status: 'resolved' },
  { key: 'all', label: 'All' },
];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDay = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/** Time for today's activity, the day otherwise: the list only needs to say how stale a thread is. */
const formatListStamp = (iso: string) => (isSameDay(new Date(iso), new Date()) ? formatTime(iso) : formatDay(iso));

const shortWallet = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** A thread can start before the user picked a nickname. */
const displayName = (c: SupportConversationSummary) => (c.nickname ? `@${c.nickname}` : shortWallet(c.walletAddress));

// useSearchParams needs a Suspense boundary to prerender, same as /login.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupportInbox />
    </Suspense>
  );
}

function SupportInbox() {
  const { data: conversations = [], isLoading } = useSupportConversations();
  // Opens on the queue: the threads where the user spoke last are the only ones
  // someone is waiting on.
  const [filter, setFilter] = useState('waiting');
  const [search, setSearch] = useState('');
  // `?c=<id>` is what the Telegram alert links to. Only the initial value: after
  // that the selection is the admin's, and Back must not reopen the linked thread.
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('c'));

  const waitingCount = conversations.filter((c) => c.status === 'waiting').length;

  const visible = useMemo(() => {
    const status = FILTERS.find((f) => f.key === filter)?.status;
    const query = search.trim().toLowerCase();
    return conversations.filter(
      (c) =>
        (!status || c.status === status) &&
        (!query || c.nickname?.toLowerCase().includes(query) || c.walletAddress.toLowerCase().includes(query))
    );
  }, [conversations, filter, search]);

  // Looked up in the full list, not the filtered one: replying moves a thread
  // out of "Waiting on us", and the open thread must not vanish mid-answer.
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold text-black">Support chat</h1>
        <p className="text-sm text-default-500">
          Private conversations started from the app’s Help Center, newest activity first.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === f.key ? 'bg-primary/15 text-primary' : 'bg-default-100 text-default-500'
            }`}
          >
            {f.label}
            {f.status === 'waiting' && waitingCount > 0 ? ` · ${waitingCount}` : ''}
          </button>
        ))}
      </div>

      <div className="flex min-h-[28rem] flex-1 overflow-hidden rounded-xl border border-black border-b-2 bg-white">
        {/* Below md only one pane fits: the list, or the thread once one is picked. */}
        <aside
          className={`${selected ? 'hidden md:flex' : 'flex'} w-full flex-col border-default-200 md:w-80 md:shrink-0 md:border-r`}
        >
          <div className="border-b border-default-200 p-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nickname / wallet"
              className="w-full rounded-medium border border-default-200 px-3 py-1.5 text-sm outline-none focus:border-black"
            />
          </div>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-default-400">No conversations match this filter.</p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visible.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === selectedId}
                  onSelect={() => setSelectedId(c.id)}
                />
              ))}
            </ul>
          )}
        </aside>

        <section className={`${selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {selected ? (
            <Thread key={selected.id} summary={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <p className="m-auto text-sm text-default-400">Pick a conversation to read it.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: SupportConversationSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const { lastMessage: last, status, pendingCount: pending } = conversation;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col gap-0.5 border-b border-default-100 px-3 py-2.5 text-left transition ${
          active ? 'bg-primary/10' : 'hover:bg-primary/5'
        }`}
      >
        <div className="flex items-center gap-2">
          {status === 'waiting' ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
          <span className="truncate text-sm font-semibold text-black">{displayName(conversation)}</span>
          <span className="ml-auto shrink-0 text-xs text-default-400">
            {last ? formatListStamp(last.createdAt) : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-default-500">
            {last?.author === 'team' ? 'You: ' : ''}
            {last?.body}
          </span>
          {status === 'resolved' ? (
            <span className="ml-auto shrink-0 rounded bg-success-100 px-1.5 text-[10px] font-semibold text-success-700">
              Resolved
            </span>
          ) : pending > 0 ? (
            <span
              title="Messages waiting for a reply"
              className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-black"
            >
              {pending > 9 ? '9+' : pending}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function Thread({ summary, onBack }: { summary: SupportConversationSummary; onBack: () => void }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { data: thread, isLoading } = useSupportThread(summary.id);
  const reply = useSupportReply(summary.id);
  const resolve = useSupportResolve(summary.id);
  const messages = thread?.messages ?? [];
  const status = thread?.status ?? summary.status;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // The draft is cleared only once the reply is stored: a failed send must not
  // eat what the admin just typed.
  const submit = () => {
    if (!draft.trim() || reply.isPending) return;
    reply.mutate(draft.trim(), {
      onSuccess: () => setDraft(''),
      onError: (err) => addDangerToast('Error', err.message),
    });
  };

  const setResolved = (resolved: boolean) =>
    resolve.mutate(resolved, { onError: (err) => addDangerToast('Error', err.message) });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-default-200 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-medium px-2 py-1 text-sm font-semibold text-black hover:bg-default-100 md:hidden"
        >
          ←
        </button>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-black">{displayName(summary)}</span>
          <span className="font-mono text-xs text-default-400" title={summary.walletAddress}>
            {shortWallet(summary.walletAddress)}
          </span>
        </div>
        {status === 'resolved' ? (
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => setResolved(false)}
            className="ml-auto rounded-medium bg-default-100 px-3 py-1 text-sm font-semibold text-black transition hover:bg-default-200 disabled:opacity-40"
          >
            Reopen
          </button>
        ) : (
          <button
            type="button"
            disabled={resolve.isPending}
            onClick={() => setResolved(true)}
            className="ml-auto rounded-medium bg-success-100 px-3 py-1 text-sm font-semibold text-success-700 transition hover:bg-success-200 disabled:opacity-40"
          >
            Resolve ✓
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-default-50 p-4">
        {isLoading ? (
          <div className="m-auto">
            <Spinner />
          </div>
        ) : null}
        {messages.map((message, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(message.createdAt));
          // Mirrored from the app: here the team is "me", so its replies sit on the right.
          const ours = message.author === 'team';
          return (
            <div key={message.id} className="flex flex-col gap-2">
              {showDay ? (
                <span className="self-center rounded-full bg-white px-3 py-0.5 text-xs text-default-500">
                  {formatDay(message.createdAt)}
                </span>
              ) : null}
              <div
                className={`flex max-w-[75%] flex-col gap-1 rounded-2xl border border-black border-b-2 px-3 py-2 ${
                  ours ? 'self-end rounded-br-sm bg-primary' : 'self-start rounded-bl-sm bg-white'
                }`}
              >
                {ours ? <span className="text-xs font-bold text-black">Vaquita team</span> : null}
                <p className="whitespace-pre-wrap break-words text-sm text-black">{message.body}</p>
                <span className="self-end text-[10px] tabular-nums text-black/60">{formatTime(message.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-default-200 p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a reply… (Enter sends, Shift+Enter breaks the line)"
          aria-label="Reply"
          maxLength={SUPPORT_MESSAGE_MAX}
          rows={1}
          className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-black border-b-2 bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-default-400"
        />
        <button
          type="submit"
          disabled={!draft.trim() || reply.isPending}
          className="h-10 shrink-0 rounded-xl border border-black border-b-2 bg-primary px-4 text-sm font-semibold text-black transition active:translate-y-[2px] active:border-b disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );
}
