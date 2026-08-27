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
import { Badge, Button, Card, Field, useConfirm } from "@pathey/ui";
import { adminFetch, formatIndia } from "@/lib/api";
const tone = (s: string) =>
  s === "published"
    ? "success"
    : s === "expired" || s === "purged"
      ? "danger"
      : "warning";
// datetime-local inputs need "YYYY-MM-DDTHH:mm" in local wall-clock time —
// shift by the timezone offset before trimming, otherwise a stored UTC ISO
// string gets mislabeled as local time and displays the wrong clock time.
const toDatetimeLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const initialPublicationAt = toDatetimeLocal(
  new Date(Date.now() + 86_400_000).toISOString(),
);
// cycleInputSchema requires a full ISO datetime with "Z" — the raw
// datetime-local value ("YYYY-MM-DDTHH:mm", local time) fails that
// validator as-is, so convert it before it reaches the zod resolver.
const localToIso = (value: string) => (value ? new Date(value).toISOString() : value);

export default function Cycles() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<ResultCycle | null>(null),
    qc = useQueryClient(),
    confirmDialog = useConfirm();
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
  const remove = useMutation({
    mutationFn: (c: ResultCycle) =>
      adminFetch(`/admin/cycles/${c.id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cycles"] }),
  });
  const deleteCycle = async (c: ResultCycle) => {
    if (
      !(await confirmDialog(`Delete "${c.title}"? This cannot be undone.`, {
        title: "Delete result cycle",
        confirmLabel: "Delete",
        danger: true,
      }))
    )
      return;
    remove.mutate(c);
  };
  const openEdit = (c: ResultCycle) => {
    editForm.reset({
      title: c.title,
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
        {remove.error && (
          <p className="notice notice-danger">{remove.error.message}</p>
        )}
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
                        {(c.status === "draft" ||
                          c.status === "scheduled") && (
                          <button
                            className="btn btn-danger"
                            onClick={() => deleteCycle(c)}
                          >
                            Delete
                          </button>
                        )}
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
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
            >
              <Field
                label="Quiz / competition title"
                {...form.register("title")}
                error={form.formState.errors.title?.message}
              />
              <Field
                label="Publication date and time"
                type="datetime-local"
                {...form.register("publicationAt", { setValueAs: localToIso })}
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
                  ? { ...v, publicationAt: v.publicationAt || undefined }
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
                    label="Publication date and time"
                    type="datetime-local"
                    {...editForm.register("publicationAt", { setValueAs: localToIso })}
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
