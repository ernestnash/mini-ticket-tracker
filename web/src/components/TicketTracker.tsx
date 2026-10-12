'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { STATUSES, errorMessage, getStats, listTickets, totalPages, updateTicket } from '@/lib/api';
import type { Priority, Stats, Status, TicketPage } from '@/lib/api';

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<Status, string> = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export default function TicketTracker({ justCreated = false }: { justCreated?: boolean }) {
  const [status, setStatus] = useState<Status | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0); // bump to refetch after a change
  const [list, setList] = useState<TicketPage | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [notice, setNotice] = useState(justCreated);

  useEffect(() => {
    let cancelled = false; // ignore responses that arrive after the filter or page changed
    setLoading(true);
    Promise.all([listTickets({ status, page, limit: PAGE_SIZE }), getStats()])
      .then(([nextList, nextStats]) => {
        if (cancelled) return;
        if (nextList.data.length === 0 && page > 1) {
          setPage(totalPages(nextList.total, PAGE_SIZE)); // the last page emptied out, step back
          return;
        }
        setList(nextList);
        setStats(nextStats);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, page, version]);

  function filterBy(next: Status | undefined) {
    setStatus(next);
    setPage(1);
  }

  async function onStatusChange(id: string, next: Status) {
    setUpdatingId(id);
    setError(null);
    try {
      await updateTicket(id, { status: next });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  }

  const pages = list ? totalPages(list.total, PAGE_SIZE) : 1;
  const allCount = stats ? stats.open + stats.in_progress + stats.closed : 0;

  return (
    <div className="page">
      <div className="page-head row">
        <h1>Tickets</h1>
        <Link href="/new" className="button primary">
          New ticket
        </Link>
      </div>

      {notice && (
        <p role="status" className="notice">
          Ticket created.
          <button type="button" onClick={() => setNotice(false)}>
            Dismiss
          </button>
        </p>
      )}

      <section aria-label="Tickets" aria-busy={loading} className={loading ? 'loading' : undefined}>
        <div className="filters" role="group" aria-label="Filter by status">
          <button type="button" aria-pressed={status === undefined} onClick={() => filterBy(undefined)}>
            All {stats && <span className="count">{allCount}</span>}
          </button>
          {STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => filterBy(s)}>
              {STATUS_LABEL[s]} {stats && <span className="count">{stats[s]}</span>}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="error">
            {error}{' '}
            <button type="button" onClick={() => setVersion((v) => v + 1)}>
              Retry
            </button>
          </p>
        )}

        {list === null ? (
          loading && <p>Loading…</p>
        ) : list.data.length === 0 ? (
          <div className="empty">
            <p>No tickets{status ? ` with status “${STATUS_LABEL[status]}”` : ''} yet.</p>
            {!status && (
              <Link href="/new" className="button">
                Create the first one
              </Link>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong className="title">{t.title}</strong>
                      {t.description && <p className="desc">{t.description}</p>}
                      <time dateTime={t.createdAt}>
                        {new Date(t.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </time>
                    </td>
                    <td>
                      <span className={`badge priority-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                    </td>
                    <td>
                      <span className={`dot status-${t.status}`} aria-hidden="true" />
                      <select
                        aria-label={`Status of ${t.title}`}
                        value={t.status}
                        data-status={t.status}
                        disabled={updatingId === t.id}
                        onChange={(e) => onStatusChange(t.id, e.target.value as Status)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {list && list.total > 0 && (
          <nav className="pager" aria-label="Pagination">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="pager-info">
              Page {page} of {pages} · {list.total} ticket{list.total === 1 ? '' : 's'}
            </span>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
