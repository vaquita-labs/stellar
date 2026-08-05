'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  type PushCampaign,
  sendCampaign,
  usePushCampaigns,
} from '@/core-ui/hooks';
import { Spinner } from '@heroui/react';
import { Button, Card, Input, Select, Textarea } from '@vaquita/ui';
import { useState } from 'react';

type Audience = 'all' | 'usernames';

// "ana, juan  pepe\nmaria" → ['ana','juan','pepe','maria'] (lowercase, únicos).
const parseUsernames = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((u) => u.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const audienceLabel = (c: PushCampaign): string =>
  c.audience === 'all' ? 'Everyone' : `${(c.usernames ?? []).length} usernames`;

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function Page() {
  const { data: campaigns, refetch, isLoading } = usePushCampaigns();

  const [audience, setAudience] = useState<Audience>('all');
  const [usernamesRaw, setUsernamesRaw] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);

  const usernames = parseUsernames(usernamesRaw);
  const canSend =
    !sending && title.trim().length > 0 && body.trim().length > 0 && (audience === 'all' || usernames.length > 0);

  // Vista previa con la personalización aplicada a un usuario de ejemplo.
  const previewUser = audience === 'usernames' && usernames.length > 0 ? usernames[0]! : 'ana';
  const preview = (s: string) => s.replaceAll('{username}', previewUser);

  const submit = async () => {
    const audienceText = audience === 'all' ? 'EVERY user' : `${usernames.length} username(s): ${usernames.join(', ')}`;
    if (!window.confirm(`Send this notification (in-app + push) to ${audienceText}?`)) return;

    setSending(true);
    try {
      const result = await sendCampaign({
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || null,
        audience,
        ...(audience === 'usernames' ? { usernames } : {}),
      });
      const { push, campaign } = result;
      addSuccessToast(
        'Sent',
        `${campaign.recipients} recipient(s) — push: ${push.sent} sent, ${push.failed} failed${
          push.disabled ? ' (push disabled: missing VAPID keys)' : ''
        }.`
      );
      if (result.notFound?.length) {
        addDangerToast('Some usernames were not found', result.notFound.join(', '));
      }
      setTitle('');
      setBody('');
      setLink('');
      setUsernamesRaw('');
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifications</h1>
      </div>

      <p className="text-sm text-default-500">
        Send a notification to users: it lands in the in-app bell for everyone in the audience, and as a push
        notification on subscribed devices. <code className="rounded bg-default-100 px-1">{'{username}'}</code> in the
        title or body is replaced with each user&apos;s nickname.
      </p>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-semibold text-black">New notification</h2>

        <div className="flex flex-wrap gap-3">
          <Select
            label="Audience"
            containerClassName="w-48"
            value={audience}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAudience(e.target.value as Audience)}
          >
            <option value="all">Everyone</option>
            <option value="usernames">Specific usernames</option>
          </Select>

          {audience === 'usernames' && (
            <Textarea
              label={`Usernames (comma or newline separated)${usernames.length ? ` — ${usernames.length} parsed` : ''}`}
              containerClassName="flex-1 min-w-60"
              rows={2}
              placeholder="ana, juan, maria"
              value={usernamesRaw}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setUsernamesRaw(e.target.value)}
            />
          )}
        </div>

        <Input
          label="Title"
          maxLength={120}
          placeholder="e.g. Hola {username} 🐮"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        />
        <Textarea
          label="Body"
          rows={3}
          maxLength={500}
          placeholder="e.g. Your savings earned rewards this week."
          value={body}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
        />
        <Input
          label="Link (optional, internal route opened on tap)"
          maxLength={300}
          placeholder="/home"
          value={link}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLink(e.target.value)}
        />

        {(title.trim() || body.trim()) && (
          <div className="rounded-xl border border-black/20 bg-default-50 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-default-400">
              Preview (as “{previewUser}”)
            </p>
            <p className="text-sm font-semibold text-black">{preview(title.trim()) || '(no title)'}</p>
            <p className="text-sm text-black/70">{preview(body.trim()) || '(no body)'}</p>
            {link.trim() && <p className="mt-1 font-mono text-xs text-default-400">{link.trim()}</p>}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onPress={submit} isDisabled={!canSend} isLoading={sending}>
            Send
          </Button>
        </div>
      </Card>

      <h2 className="mt-2 text-base font-semibold text-black">History</h2>
      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (campaigns?.length ?? 0) === 0 ? (
        <div className="rounded-medium bg-default-100 p-3 text-sm text-default-500">No notifications sent yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {campaigns?.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-xl border border-black border-b-2 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{c.title}</span>
                <span className="shrink-0 text-xs text-default-400">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-sm text-black/70">{c.body}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-default-100 px-1.5 py-0.5">{audienceLabel(c)}</span>
                <span className="text-default-500">
                  {c.recipients} in-app · push {c.pushSent} sent / {c.pushFailed} failed
                  {c.pushPruned > 0 ? ` / ${c.pushPruned} pruned` : ''}
                </span>
                {c.link && <span className="font-mono text-default-400">{c.link}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
