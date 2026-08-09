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
import { ensureHindi, getNameSuggestions } from "@pathey/hindi-text";
import { Download } from "lucide-react";
import { Badge, Button, Card, Field } from "@pathey/ui";
import { adminFetch, downloadAdmin, previewAdmin, formatIndia } from "@/lib/api";

const fieldLabels: Record<keyof CandidateInput, string> = {
  participantId: "Unique participant/reference ID",
  certificateNumber: "Internal certificate number",
  phone: "Mobile number (used to access the certificate)",
  nameHindi: "Candidate name (Hindi)",
  nameEnglish: "Candidate name (English)",
  guardianName: "Parent/guardian name on certificate",
  className: "Class on certificate",
  age: "Age on certificate",
  city: "City/district (magazine only)",
  address: "Full Address",
  score: "Score on certificate",
  rank: "Rank/position on certificate",
  resultDate: "Serial number / क्रम संख्या (date)",
  photoPath: "Photo path",
};

// English name drives an auto-populated Hindi spelling plus a set of
// alternate-spelling suggestions to pick from — transliteration is
// inherently approximate (there's no single "correct" Devanagari spelling
// for a Roman name), so this offers choices rather than committing to one
// guess. Auto-fill stops the moment the admin edits Hindi directly or picks
// a suggestion, so it never silently overwrites a deliberate choice.
function NameFields({ form }: { form: UseFormReturn<CandidateInput> }) {
  const [hindiTouched, setHindiTouched] = useState(
    () => !!form.getValues("nameHindi")?.trim(),
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const englishName = form.watch("nameEnglish") ?? "";
  const suggestions = getNameSuggestions(englishName);

  const onEnglishChange = (value: string) => {
    if (!hindiTouched) {
      form.setValue("nameHindi", value.trim() ? ensureHindi(value) : "");
    }
  };
  const pickSuggestion = (suggestion: string) => {
    form.setValue("nameHindi", suggestion, { shouldValidate: true });
    setHindiTouched(true);
    setDropdownOpen(false);
  };

  return (
    <div className="span-full name-fields">
      <Field
        label={fieldLabels.nameEnglish}
        {...form.register("nameEnglish", {
          onChange: (e) => onEnglishChange(e.target.value),
        })}
        error={form.formState.errors.nameEnglish?.message}
      />
      <div className="name-hindi-wrap">
        <Field
          label={fieldLabels.nameHindi}
          autoComplete="off"
          {...form.register("nameHindi", {
            onChange: () => setHindiTouched(true),
            onBlur: () => setDropdownOpen(false),
          })}
          onFocus={() => setDropdownOpen(true)}
          error={form.formState.errors.nameHindi?.message}
        />
        {dropdownOpen && suggestions.length > 0 && (
          <ul className="name-suggestions-dropdown" role="listbox">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  // onMouseDown (not onClick) fires before the input's blur,
                  // and preventDefault stops that blur — otherwise the
                  // dropdown would close from the blur handler above before
                  // the click ever registers.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Shared by the add and edit forms. Add generates participantId/certificateNumber
// server-side (see store.createCandidate), so those two are only shown on Edit,
// where an existing candidate already has real values worth reviewing.
function CandidateFields({
  form,
  mode,
}: {
  form: UseFormReturn<CandidateInput>;
  mode: "add" | "edit";
}) {
  const textFields: (keyof CandidateInput)[] = [
    ...(mode === "edit" ? (["participantId", "certificateNumber"] as const) : []),
    "phone",
    "guardianName",
    "className",
    "city",
    "address",
  ];
  return (
    <>
      <NameFields form={form} />
      {textFields.map((k) => (
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
        type="text"
        inputMode="numeric"
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
                          onClick={() => openPreview(p)}
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
                              address: p.address,
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
          <div className="modal modal--wide">
            <h2>Add candidate</h2>
            <p>
              The approved certificate prints the Hindi name, guardian name,
              class, age, rank, score and date. The Hindi name is suggested
              automatically from the English name — review and adjust if
              needed. City and the English name are used for the magazine
              and administration only.
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
              class, age, rank, score and date. The Hindi name is suggested
              automatically from the English name — review and adjust if
              needed. City and the English name are used for the magazine
              and administration only.
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
        <div className="modal-backdrop" onMouseDown={closePreview}>
          <div
            className="modal modal--wide"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2>Certificate preview</h2>
            <p>
              <strong>{previewing.nameHindi || previewing.nameEnglish}</strong>{" "}
              · {previewing.certificateNumber}
            </p>
            {previewError ? (
              <p className="notice notice-danger">{previewError}</p>
            ) : previewUrl ? (
              <iframe
                className="pdf-frame"
                title="Certificate preview"
                src={previewUrl}
              />
            ) : (
              <p>Loading preview…</p>
            )}
            <div
              className="actions"
              style={{ marginTop: 16, justifyContent: "flex-end" }}
            >
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
