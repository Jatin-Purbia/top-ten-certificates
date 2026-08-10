'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { candidateInputSchema, type CandidateInput, type Candidate } from '@pathey/types';
import { Download } from 'lucide-react';
import { Badge, Button, Card } from '@pathey/ui';
import { adminFetch, downloadAdmin, previewAdmin } from '@/lib/api';
import { CandidateFields, candidateToFormValues } from '@/components/candidate-fields';

export default function Candidates() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [previewing, setPreviewing] = useState<Candidate | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const openPreview = async (p: Candidate) => {
    setPreviewing(p);
    setPreviewError('');
    try {
      setPreviewUrl(await previewAdmin(`/admin/candidates/${p.id}/certificate-preview`));
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  };
  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewing(null);
    setPreviewUrl(null);
  };
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

  const editForm = useForm<CandidateInput>({
    resolver: zodResolver(candidateInputSchema),
  });
  const update = useMutation<any, Error, CandidateInput>({
    mutationFn: (v: CandidateInput) =>
      adminFetch<any>(`/admin/candidates/${editing!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['all-candidates', cycleIds] });
    },
  });
  const openEdit = (p: Candidate) => {
    editForm.reset(candidateToFormValues(p));
    setEditing(p);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Candidate management</h1>
          <p>All candidates across every result cycle. Edit here, or open a cycle to add, import, preview, or manage claim credentials.</p>
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
                  <th>Status</th>
                  <th>Mobile</th>
                  <th>Download</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p: Candidate & { cycleId: string; cycleTitle: string; cycleStatus: string }) => (
                  <tr key={p.id}>
                    <td>
                      <strong>#{p.rank}</strong>
                    </td>
                    <td>
                      {p.nameHindi || p.nameEnglish}
                      {p.nameEnglish && p.nameEnglish !== p.nameHindi && (
                        <>
                          <br />
                          <span style={{ color: 'var(--muted)' }}>{p.nameEnglish}</span>
                        </>
                      )}
                    </td>
                    <td>{p.cycleTitle}</td>
                    <td>
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
                      <div className="actions">
                        <button className="btn btn-secondary" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button className="btn btn-secondary" onClick={() => openPreview(p)}>
                          Preview
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div className="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="edit-candidate-title">
            <h2 id="edit-candidate-title">Edit candidate</h2>
            <p>
              The approved certificate prints the Hindi name, guardian name,
              class, age, rank, score and date. Type Roman letters into any
              Hindi field to pick a suggested spelling.
            </p>
            <form
              className="form-grid"
              onSubmit={editForm.handleSubmit((v) => update.mutate(v))}
            >
              <CandidateFields form={editForm} mode="edit" />
              {update.error && (
                <p className="notice notice-danger span-full">{update.error.message}</p>
              )}
              <div className="actions span-full" style={{ justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {previewing && (
        <div className="modal-backdrop" onMouseDown={closePreview}>
          <div className="modal modal--wide" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Certificate preview</h2>
            <p>
              <strong>{previewing.nameHindi || previewing.nameEnglish}</strong>{' '}
              · {previewing.certificateNumber}
            </p>
            {previewError ? (
              <p className="notice notice-danger">{previewError}</p>
            ) : previewUrl ? (
              <iframe className="pdf-frame" title="Certificate preview" src={previewUrl} />
            ) : (
              <p>Loading preview…</p>
            )}
            <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <Button type="button" variant="secondary" onClick={closePreview}>
                Close
              </Button>
              <Button
                type="button"
                disabled={!previewUrl}
                onClick={() =>
                  downloadAdmin(
                    `/admin/candidates/${previewing.id}/certificate-preview`,
                    `${previewing.certificateNumber}.pdf`,
                  )
                }
              >
                <Download size={18} />
                Download certificate
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
