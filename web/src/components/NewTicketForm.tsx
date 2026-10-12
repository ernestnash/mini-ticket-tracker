'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, PRIORITIES, createTicket, errorMessage } from '@/lib/api';
import type { Priority } from '@/lib/api';

const TITLE_MAX = 200;
const DESC_MAX = 5000;

const PRIORITY_HINT: Record<Priority, { label: string; hint: string }> = {
  low: { label: 'Low', hint: 'Can wait for the next pass' },
  medium: { label: 'Medium', hint: 'Handle in the normal queue' },
  high: { label: 'High', hint: 'Blocking someone right now' },
};

export default function NewTicketForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await createTicket({ title: title.trim(), description: description.trim() || undefined, priority });
      router.push('/?created=1');
    } catch (err) {
      // Validation errors from the API land next to their field; anything else goes in the form-level alert.
      if (err instanceof ApiError && err.details.length > 0) {
        const next: Record<string, string> = {};
        for (const d of err.details) next[d.path] ??= d.message;
        setFieldErrors(next);
        if (!['title', 'description', 'priority'].some((k) => next[k])) setFormError(errorMessage(err));
      } else {
        setFormError(errorMessage(err));
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>New ticket</h1>
        <p className="lede">Say what is wrong and how soon it matters. You can change the status later.</p>
      </div>

      <form onSubmit={onSubmit} className="panel form" noValidate>
        <div className="field">
          <div className="field-head">
            <label htmlFor="title">Title</label>
            <span className="counter" aria-hidden="true">
              {title.length}/{TITLE_MAX}
            </span>
          </div>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Checkout fails for saved cards"
            autoFocus
            required
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? 'title-error' : undefined}
          />
          {fieldErrors.title && (
            <p id="title-error" className="field-error">
              {fieldErrors.title}
            </p>
          )}
        </div>

        <div className="field">
          <div className="field-head">
            <label htmlFor="description">
              Description <span className="optional">optional</span>
            </label>
            <span className="counter" aria-hidden="true">
              {description.length}/{DESC_MAX}
            </span>
          </div>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESC_MAX}
            rows={6}
            placeholder="What happened, what you expected, and how to reproduce it."
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? 'description-error' : undefined}
          />
          {fieldErrors.description && (
            <p id="description-error" className="field-error">
              {fieldErrors.description}
            </p>
          )}
        </div>

        <fieldset className="field">
          <legend>Priority</legend>
          <div className="choices">
            {PRIORITIES.map((p) => (
              <label key={p} className={`choice priority-${p}`}>
                <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} />
                <span className="choice-label">{PRIORITY_HINT[p].label}</span>
                <span className="choice-hint">{PRIORITY_HINT[p].hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {formError && (
          <p role="alert" className="error">
            {formError}
          </p>
        )}

        <div className="actions">
          <Link href="/" className="button ghost">
            Cancel
          </Link>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}
