"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  candidateInputSchema,
  type CandidateInput,
  type Candidate,
} from "@pathey/types";
import { Badge, Button, Card, Field } from "@pathey/ui";
import { adminFetch, downloadAdmin, formatIndia } from "@/lib/api";

const fieldLabels: Record<keyof CandidateInput, string> = {
  participantId: "Unique participant/reference ID",
  certificateNumber: "Internal certificate number",
  phone: "Mobile number (used to access the certificate)",
  nameHindi: "Candidate name on certificate (Hindi) — optional, auto-generated from the English name if left blank",
  nameEnglish: "Candidate name (English/admin)",
  guardianName: "Parent/guardian name on certificate",
  className: "Class on certificate",
  age: "Age on certificate",
  city: "City/district (magazine only)",
  score: "Score on certificate",
  rank: "Rank/position on certificate (1–10)",
  resultDate: "Date on certificate",
  photoPath: "Photo path",
};
// Shared by the add and edit forms so both ask for exactly the same fields.
function CandidateFields({ form }: { form: UseFormReturn<CandidateInput> }) {
  return (
    <>
      {(
        [
          "participantId",
          "certificateNumber",
          "phone",
          "nameHindi",
          "nameEnglish",
          "guardianName",
          "className",
          "city",
        ] as const
      ).map((k) => (
        <Field
          key={k}
          label={fieldLabels[k]}
          type={k === "phone" ? "tel" : undefined}
          {...form.register(k)}
          error={form.formState.errors[k]?.message}
        />
      ))}
      <Field
        label={fieldLabels.age}
        type="number"
        {...form.register("age", { valueAsNumber: true })}
        error={form.formState.errors.age?.message}
      />
      <Field
        label={fieldLabels.score}
        type="number"
        step="0.01"
        {...form.register("score", { valueAsNumber: true })}
        error={form.formState.errors.score?.message}
      />
      <Field
        label={fieldLabels.rank}
        type="number"
        {...form.register("rank", { valueAsNumber: true })}
        error={form.formState.errors.rank?.message}
      />
      <Field
        label={fieldLabels.resultDate}
        type="date"
        {...form.register("resultDate")}
        error={form.formState.errors.resultDate?.message}
      />
    </>
  );
}

export function CycleWorkspace({ id }: { id: string }) {
  const qc = useQueryClient(),
    [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
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
  const publish = async () => {
    if (
      !confirm(
        "Publish this cycle? Candidate data becomes protected and important changes will be audited.",
      )
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
      !confirm(
        "Expire this certificate window immediately? Public access will be blocked.",
      )
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
          <h1>
            {c.title} · Result {c.resultNumber}
          </h1>
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
                  <th>Reference ID</th>
                  <th>Mobile</th>
                  <th>City</th>
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
                      <br />
                      <span style={{ color: "var(--muted)" }}>
                        {p.nameEnglish}
                      </span>
                    </td>
                    <td>{p.participantId}</td>
                    <td>{p.phone}</td>
                    <td>{p.city}</td>
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
                          onClick={() =>
                            downloadAdmin(
                              `/admin/candidates/${p.id}/certificate-preview`,
                              `${p.certificateNumber}.pdf`,
                            )
                          }
                        >
                          Preview
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            editForm.reset({
                              participantId: p.participantId,
                              certificateNumber: p.certificateNumber,
                              phone: p.phone,
                              nameHindi: p.nameHindi,
                              nameEnglish: p.nameEnglish,
                              guardianName: p.guardianName,
                              className: p.className,
                              age: p.age,
                              city: p.city,
                              score: p.score,
                              rank: p.rank,
                              resultDate: p.resultDate,
                              photoPath: p.photoPath,
                            });
                            setEditing(p);
                          }}
                        >
                          Edit
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
          <div className="modal">
            <h2>Add candidate</h2>
            <p>
              The approved certificate prints the Hindi name, guardian name,
              class, age, rank, score and date. City and the English name are
              used for the magazine and administration only.
            </p>
            <form
              className="form-grid"
              onSubmit={addForm.handleSubmit((v) => create.mutate(v))}
            >
              <CandidateFields form={addForm} />
              {create.error && (
                <p className="notice notice-danger span-2">
                  {create.error.message}
                </p>
              )}
              <div
                className="actions span-2"
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
          <div className="modal">
            <h2>Edit candidate</h2>
            <p>
              The approved certificate prints the Hindi name, guardian name,
              class, age, rank, score and date. City and the English name are
              used for the magazine and administration only.
            </p>
            <form
              className="form-grid"
              onSubmit={editForm.handleSubmit((v) => edit.mutate(v))}
            >
              <CandidateFields form={editForm} />
              {edit.error && (
                <p className="notice notice-danger span-2">
                  {edit.error.message}
                </p>
              )}
              <div
                className="actions span-2"
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
    </>
  );
}
