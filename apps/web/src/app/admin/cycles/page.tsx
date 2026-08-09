"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  cycleInputSchema,
  type CycleInput,
  type ResultCycle,
} from "@pathey/types";
import { Badge, Button, Card, Field } from "@pathey/ui";
import { adminFetch, formatIndia } from "@/lib/api";
const tone = (s: string) =>
  s === "published"
    ? "success"
    : s === "expired" || s === "purged"
      ? "danger"
      : "warning";
const initialPublicationAt = new Date(Date.now() + 86_400_000).toISOString();
// datetime-local inputs need "YYYY-MM-DDTHH:mm" with no timezone offset —
// this trims the stored ISO string down to that instead of reformatting it,
// so the same field works for both display and re-submission.
const toDatetimeLocal = (iso: string) => iso.slice(0, 16);

export default function Cycles() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<ResultCycle | null>(null),
    qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["cycles", search, status],
    queryFn: () =>
      adminFetch<any>(
        `/admin/cycles?search=${encodeURIComponent(search)}&status=${status}`,
      ),
  });
  const form = useForm<CycleInput>({
    resolver: zodResolver(cycleInputSchema),
    defaultValues: {
      title: "",
      resultNumber: "",
      publicationAt: initialPublicationAt,
      status: "draft",
    },
  });
  const create = useMutation({
    mutationFn: (v: CycleInput) =>
      adminFetch("/admin/cycles", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] });
      setOpen(false);
      form.reset();
    },
  });
  const editForm = useForm<Partial<CycleInput>>({
    resolver: zodResolver(cycleInputSchema.partial()),
  });
  const update = useMutation({
    mutationFn: (v: Partial<CycleInput>) =>
      adminFetch(`/admin/cycles/${editing!.id}`, {
        method: "PATCH",
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] });
      setEditing(null);
    },
  });
  const openEdit = (c: ResultCycle) => {
    editForm.reset({
      title: c.title,
      resultNumber: c.resultNumber,
      publicationAt: toDatetimeLocal(c.publicationAt),
      status: c.status === "scheduled" ? "scheduled" : "draft",
    });
    setEditing(c);
  };
  const editable = editing && editing.status !== "published" && editing.status !== "expired" && editing.status !== "purged";
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Result cycles</h1>
          <p>Manage overlapping magazine editions and certificate windows.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Create cycle</Button>
      </div>
      <Card>
        <div className="toolbar">
          <input
            className="input"
            placeholder="Search title or result number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            style={{ maxWidth: 220 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter status"
          >
            <option value="">All statuses</option>
            {["draft", "scheduled", "published", "expired", "purged"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </div>
        {isPending ? (
          <p>Loading cycles…</p>
        ) : error ? (
          <p className="notice notice-danger">{error.message}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Status</th>
                  <th>Candidates</th>
                  <th>Publication</th>
                  <th>Deadline</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((c: ResultCycle) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>
                        Result {c.resultNumber} · Issue {c.issueNumber}
                      </span>
                    </td>
                    <td>
                      <Badge tone={tone(c.status)}>{c.status}</Badge>
                    </td>
                    <td>{c.candidateCount}</td>
                    <td>{formatIndia(c.publicationAt)}</td>
                    <td>{formatIndia(c.expiresAt)}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-secondary"
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                        <Link
                          className="btn btn-secondary"
                          href={`/admin/cycles/${c.id}`}
                        >
                          Manage
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-cycle-title"
          >
            <h2 id="new-cycle-title">Create result cycle</h2>
            <form
              className="form-grid"
              onSubmit={form.handleSubmit((v) =>
                create.mutate({
                  ...v,
                  publicationAt: new Date(v.publicationAt).toISOString(),
                }),
              )}
            >
              <Field
                label="Quiz / competition title"
                {...form.register("title")}
                error={form.formState.errors.title?.message}
              />
              <Field
                label="Result number"
                {...form.register("resultNumber")}
                error={form.formState.errors.resultNumber?.message}
              />
              <Field
                label="Publication date and time"
                type="datetime-local"
                {...form.register("publicationAt", {
                  setValueAs: (value) => value ? new Date(value).toISOString() : value,
                })}
                error={form.formState.errors.publicationAt?.message}
              />
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
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating…" : "Create draft"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {editing && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-cycle-title"
          >
            <h2 id="edit-cycle-title">Edit result cycle</h2>
            {!editable && (
              <p className="notice">
                This cycle is {editing.status} — only the title can still be
                changed. Use Publish/Expire on the cycle&apos;s own page for
                status changes.
              </p>
            )}
            <form
              className="form-grid"
              onSubmit={editForm.handleSubmit((v) => {
                const patch: Partial<CycleInput> = editable
                  ? {
                      ...v,
                      publicationAt: v.publicationAt
                        ? new Date(v.publicationAt).toISOString()
                        : undefined,
                    }
                  : { title: v.title };
                update.mutate(patch);
              })}
            >
              <Field
                label="Quiz / competition title"
                {...editForm.register("title")}
                error={editForm.formState.errors.title?.message}
              />
              {editable && (
                <>
                  <Field
                    label="Result number"
                    {...editForm.register("resultNumber")}
                    error={editForm.formState.errors.resultNumber?.message}
                  />
                  <Field
                    label="Publication date and time"
                    type="datetime-local"
                    {...editForm.register("publicationAt")}
                    error={editForm.formState.errors.publicationAt?.message}
                  />
                  <label className="field span-2">
                    Status
                    <select {...editForm.register("status")}>
                      <option value="draft">draft</option>
                      <option value="scheduled">scheduled</option>
                    </select>
                  </label>
                </>
              )}
              {update.error && (
                <p className="notice notice-danger span-2">
                  {update.error.message}
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
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
