"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  candidateInputSchema,
  type CandidateInput,
  type Candidate,
} from "@pathey/types";
import { Badge, Button, Card, useConfirm } from "@pathey/ui";
import { adminFetch, downloadAdmin, previewAdmin, formatIndia } from "@/lib/api";
import { CandidateFields, candidateToFormValues } from "./candidate-fields";
import { CertificatePreviewModal } from "./certificate-preview-modal";

export function CycleWorkspace({ id }: { id: string }) {
  const qc = useQueryClient(),
    confirmDialog = useConfirm(),
    [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [previewing, setPreviewing] = useState<Candidate | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const openPreview = async (p: Candidate) => {
    setPreviewing(p);
    setPreviewError("");
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
  const cycle = useQuery({
      queryKey: ["cycle", id],
      queryFn: () => adminFetch<any>(`/admin/cycles/${id}`),
    }),
    candidates = useQuery({
      queryKey: ["candidates", id],
      queryFn: () => adminFetch<any>(`/admin/cycles/${id}/candidates`),
    });
  const editForm = useForm<CandidateInput>({
    resolver: zodResolver(candidateInputSchema),
  });
  const edit = useMutation<any, Error, CandidateInput>({
    mutationFn: (v: CandidateInput) =>
      adminFetch<any>(`/admin/candidates/${editing!.id}`, {
        method: "PATCH",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["candidates", id] });
    },
  });
  const addForm = useForm<CandidateInput>({
    resolver: zodResolver(candidateInputSchema),
  });
  const create = useMutation<any, Error, CandidateInput>({
    mutationFn: (v: CandidateInput) =>
      adminFetch<any>(`/admin/cycles/${id}/candidates`, {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      setAdding(false);
      addForm.reset();
      qc.invalidateQueries({ queryKey: ["candidates", id] });
      qc.invalidateQueries({ queryKey: ["cycle", id] });
    },
  });
  const remove = useMutation<any, Error, string>({
    mutationFn: (candidateId: string) =>
      adminFetch<any>(`/admin/candidates/${candidateId}`, { method: "DELETE" }),
    onSuccess: () => {
      setError("");
      qc.invalidateQueries({ queryKey: ["candidates", id] });
      qc.invalidateQueries({ queryKey: ["cycle", id] });
    },
    onError: (e) => setError(e.message),
  });
  const deleteCandidate = async (p: Candidate) => {
    const name = p.nameHindi || p.nameEnglish;
    const message =
      cycle.data?.data?.status === "draft"
        ? `Delete ${name}? This cannot be undone.`
        : `Delete ${name}? This cycle is already ${cycle.data?.data?.status} — their certificate link will stop working immediately, even if already downloaded. This cannot be undone.`;
    if (!(await confirmDialog(message, { title: "Delete candidate", confirmLabel: "Delete", danger: true })))
      return;
    remove.mutate(p.id);
  };
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    setError("");
    try {
      await downloadAdmin(
        `/admin/cycles/${id}/candidates/export`,
        `candidates-${c?.resultNumber || id}.xlsx`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const publish = async () => {
    if (
      !(await confirmDialog(
        "Publish this cycle? Candidate data becomes protected and important changes will be audited.",
        { title: "Publish cycle", confirmLabel: "Publish" },
      ))
    )
      return;
    setError("");
    try {
      await adminFetch(`/admin/cycles/${id}/publish`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["cycle", id] });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exp = async () => {
    if (
      !(await confirmDialog(
        "Expire this certificate window immediately? Public access will be blocked.",
        { title: "Expire cycle", confirmLabel: "Expire", danger: true },
      ))
    )
      return;
    await adminFetch(`/admin/cycles/${id}/expire`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["cycle", id] });
  };
  if (cycle.isPending) return <p>Loading cycle…</p>;
  if (cycle.error)
    return <p className="notice notice-danger">{cycle.error.message}</p>;
  if (!cycle.data?.data)
    return <p className="notice notice-danger">Cycle data is unavailable.</p>;
  const c = cycle.data.data;
  const candidateRows: Candidate[] = candidates.data?.data ?? [];
  return (
    <>
      <div className="page-head">
        <div>
          <div style={{ marginBottom: 8 }}>
            <Badge
              tone={
                c.status === "published"
                  ? "success"
                  : c.status === "draft"
                    ? "warning"
                    : "danger"
              }
            >
              {c.status}
            </Badge>
          </div>
          <h1>{c.title}</h1>
          <p>
            Published {formatIndia(c.publicationAt)} · Certificate deadline{" "}
            {formatIndia(c.expiresAt)}
          </p>
        </div>
        <div className="actions">
          {c.status === "draft" && (
            <Button onClick={publish}>Publish cycle</Button>
          )}
          {c.status === "published" && (
            <Button variant="danger" onClick={exp}>
              Expire
            </Button>
          )}
        </div>
      </div>
      {error && <p className="notice notice-danger">{error}</p>}
      <div className="metrics">
        <Card className="metric">
          <div className="metric-label">Candidates</div>
          <div className="metric-value">
            {candidateRows.length}
          </div>
        </Card>
        <Card className="metric">
          <div className="metric-label">Downloaded</div>
          <div className="metric-value">
            {candidateRows.filter((x) => x.downloadCount > 0).length}
          </div>
        </Card>
        <Card className="metric">
          <div className="metric-label">Window</div>
          <div className="metric-value">
            {c.downloadWindowDays}
            <small style={{ fontSize: 14 }}> days</small>
          </div>
        </Card>
        <Card className="metric">
          <div className="metric-label">Public link</div>
          <div style={{ marginTop: 12, fontSize: 13, wordBreak: "break-all" }}>
            {c.publicSlug}
          </div>
        </Card>
      </div>
      <Card>
        <div className="page-head">
          <div>
            <h2>Candidates</h2>
            <p>Certificates are accessed with the mobile number on file.</p>
          </div>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={exportExcel}
              disabled={exporting || !candidateRows.length}
            >
              {exporting ? "Exporting…" : "Export to Excel"}
            </Button>
            <Button
              onClick={() => {
                addForm.reset();
                setAdding(true);
              }}
              disabled={c.status === "purged"}
            >
              Add candidate
            </Button>
          </div>
        </div>
        {candidates.isPending ? (
          <p>Loading candidates…</p>
        ) : candidates.error ? (
          <p className="notice notice-danger">{candidates.error.message}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Candidate</th>
                  <th>Serial number</th>
                  <th>Mobile</th>
                  <th>Score</th>
                  <th>Download</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidateRows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>#{p.rank}</strong>
                    </td>
                    <td>
                      {p.nameHindi}
                      {p.nameEnglish && p.nameEnglish !== p.nameHindi && (
                        <>
                          <br />
                          <span style={{ color: "var(--muted)" }}>
                            {p.nameEnglish}
                          </span>
                        </>
                      )}
                    </td>
                    <td>{p.participantId}</td>
                    <td>{p.phone}</td>
                    <td>{p.score}</td>
                    <td>
                      {p.downloadCount ? (
                        <Badge tone="success">
                          {p.downloadCount} download
                          {p.downloadCount > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge>Not downloaded</Badge>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-secondary"
                          onClick={() => openPreview(p)}
                        >
                          Preview
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            editForm.reset(candidateToFormValues(p));
                            setEditing(p);
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn btn-danger" onClick={() => deleteCandidate(p)}>
                          Delete
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
      {adding && (
        <div className="modal-backdrop">
          <div className="modal modal--wide">
            <h2>Add candidate</h2>
            <p>
              The approved certificate prints the Hindi name, guardian name,
              class, age, rank, score and date. Type Roman letters into any
              Hindi field to pick a suggested spelling.
            </p>
            <form
              className="form-grid"
              onSubmit={addForm.handleSubmit((v) => create.mutate(v))}
            >
              <CandidateFields form={addForm} mode="add" />
              {create.error && (
                <p className="notice notice-danger span-full">
                  {create.error.message}
                </p>
              )}
              <div
                className="actions span-full"
                style={{ justifyContent: "flex-end" }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdding(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Add candidate"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop">
          <div className="modal modal--wide">
            <h2>Edit candidate</h2>
            <p>
              The approved certificate prints the Hindi name, guardian name,
              class, age, rank, score and date. Type Roman letters into any
              Hindi field to pick a suggested spelling.
            </p>
            <form
              className="form-grid"
              onSubmit={editForm.handleSubmit((v) => edit.mutate(v))}
            >
              <CandidateFields form={editForm} mode="edit" />
              {edit.error && (
                <p className="notice notice-danger span-full">
                  {edit.error.message}
                </p>
              )}
              <div
                className="actions span-full"
                style={{ justifyContent: "flex-end" }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={edit.isPending}>
                  {edit.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {previewing && (
        <CertificatePreviewModal
          candidate={previewing}
          previewUrl={previewUrl}
          previewError={previewError}
          onClose={closePreview}
        />
      )}
    </>
  );
}
