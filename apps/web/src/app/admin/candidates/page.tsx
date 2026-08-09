'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card } from '@pathey/ui';
import { adminFetch, formatIndia } from '@/lib/api';

export default function Candidates() {
  const cycles = useQuery({
    queryKey: ['cycles-for-candidates'],
    queryFn: () => adminFetch<any>('/admin/cycles?pageSize=100'),
  });
  const cycleList = cycles.data?.data ?? [];
  const cycleIds = cycleList.map((c: any) => c.id).join(',');
  const candidates = useQuery({
    // There's no "list every candidate" endpoint — cycles are few enough
    // that fetching each cycle's candidates and flattening client-side is
    // simpler than adding one, and re-runs whenever the cycle list changes.
    queryKey: ['all-candidates', cycleIds],
    queryFn: async () => {
      const perCycle = await Promise.all(
        cycleList.map((c: any) =>
          adminFetch<any>(`/admin/cycles/${c.id}/candidates`).then((r) =>
            r.data.map((candidate: any) => ({
              ...candidate,
              cycleTitle: c.title,
              cycleResultNumber: c.resultNumber,
              cycleStatus: c.status,
            })),
          ),
        ),
      );
      return perCycle.flat().sort((a, b) => a.rank - b.rank);
    },
    enabled: cycleList.length > 0,
  });
  const isPending = cycles.isPending || (cycleList.length > 0 && candidates.isPending);
  const error = cycles.error ?? candidates.error;
  const rows = candidates.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Candidate management</h1>
          <p>All candidates across every result cycle. Open a cycle to add, edit, preview, or manage claim credentials.</p>
        </div>
      </div>
      <Card>
        {isPending ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="notice notice-danger">{error.message}</p>
        ) : rows.length === 0 ? (
          <p className="empty">No candidates have been added yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Candidate</th>
                  <th>Cycle</th>
                  <th>Mobile</th>
                  <th>Download</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <strong>#{p.rank}</strong>
                    </td>
                    <td>
                      {p.nameHindi || p.nameEnglish}
                      <br />
                      <span style={{ color: 'var(--muted)' }}>{p.nameEnglish}</span>
                    </td>
                    <td>
                      {p.cycleTitle} · {p.cycleResultNumber}
                      <br />
                      <Badge tone={p.cycleStatus === 'published' ? 'success' : 'warning'}>
                        {p.cycleStatus}
                      </Badge>
                    </td>
                    <td>{p.phone}</td>
                    <td>
                      {p.downloadCount ? (
                        <Badge tone="success">
                          {p.downloadCount} download{p.downloadCount > 1 ? 's' : ''}
                        </Badge>
                      ) : (
                        <Badge>Not downloaded</Badge>
                      )}
                    </td>
                    <td>
                      <Link className="btn btn-secondary" href={`/admin/cycles/${p.cycleId}`}>
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
