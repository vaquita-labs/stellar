'use client';

import { toast } from '@heroui/react';
import React, { useState } from 'react';
import { FiSend, FiStar } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

const CATEGORIES = [
  { id: 'bug', label: 'A bug' },
  { id: 'idea', label: 'A feature idea' },
  { id: 'love', label: 'I love it' },
  { id: 'other', label: 'Something else' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const MAX_LENGTH = 500;

export function FeedbackPage() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [category, setCategory] = useState<CategoryId>('idea');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = rating > 0 && message.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    // Mocked latency so the loading state is visible.
    await new Promise((r) => setTimeout(r, 800));
    setSubmitting(false);
    setRating(0);
    setCategory('idea');
    setMessage('');
    toast.success('Thanks for the feedback (mock)!', {
      description: 'We read every message — and we mean it.',
      timeout: 3500,
    });
  };

  return (
    <MockedSubPageLayout
      title="Feedback"
      subtitle="Tell us what's working, what isn't, and what you wish Vaquita did."
    >
      {/* Rating */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
          How is your experience?
        </h2>
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-black border-b-2 bg-white p-5">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = (hover || rating) >= star;
            return (
              <button
                key={star}
                type="button"
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(star)}
                className={`h-12 w-12 flex items-center justify-center rounded-full transition hover:-translate-y-0.5 bg-transparent ${
                  active ? 'text-primary' : 'text-gray-300'
                }`}
              >
                <FiStar className="h-7 w-7" fill={active ? 'currentColor' : 'none'} />
              </button>
            );
          })}
        </div>
      </section>

      {/* Category */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
          What are you sharing?
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`h-12 rounded-md border border-black border-b-2 text-sm font-bold transition hover:-translate-y-0.5 ${
                  active
                    ? 'bg-primary text-black'
                    : 'bg-white text-black hover:bg-[#FFF7E6]'
                }`}
                aria-pressed={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Message */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
            Your message
          </h2>
          <span className="text-[11px] font-bold text-gray-500 tabular-nums">
            {message.length} / {MAX_LENGTH}
          </span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
          rows={5}
          placeholder="Type your feedback here…"
          className="w-full p-3 rounded-md bg-white border border-black border-b-2 text-sm font-medium text-black placeholder:text-gray-400 outline-none focus:border-primary resize-y min-h-[120px]"
        />
      </section>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        <FiSend className="h-4 w-4" />
        {submitting ? 'Sending…' : 'Send feedback'}
      </button>
    </MockedSubPageLayout>
  );
}
