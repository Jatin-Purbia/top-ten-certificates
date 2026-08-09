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
import { Badge, Button, Card, Field } from "@pathey/ui";
import { adminFetch, downloadAdmin, formatIndia } from "@/lib/api";

const fieldLabels: Record<keyof CandidateInput, string> = {
  participantId: "Unique participant/reference ID",
  certificateNumber: "Internal certificate number",
  phone: "Mobile number (used to access the certificate)",
  nameHindi: "Candidate name on certificate (Hindi)",
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
const emptyRow = () => ({ nameHindi: "", nameEnglish: "", phone: "" });
const QUICK_ADD_SIZE = 10;

export function CycleWorkspace({ id }: { id: string }) {
  const qc = useQueryClient(),
    [added, setAdded] = useState(""),
    [error, setError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false),
    [quickDate, setQuickDate] = useState(new Date().toISOString().slice(0, 10)),
    [quickRows, setQuickRows] = useState(
      Array.from({ length: QUICK_ADD_SIZE }, emptyRow),
    ),
    [quickError, setQuickError] = useState(""),
    [quickPending, setQuickPending] = useState(false);
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
  const importRows = async (rows: unknown[]) => {
    const v = await adminFetch<any>(
      `/admin/cycles/${id}/candidates/import/validate`,
      { method: "POST", body: JSON.stringify({ rows }) },
    );
    if (!v.data.valid)
      throw new Error(
        v.data.errors
          .map(
            (x: any) =>
              `Row ${x.row}: ${x.issues.map((i: any) => i.message).join(", ")}`,
          )
          .join("\n"),
      );
    const result = await adminFetch<any>(
      `/admin/cycles/${id}/candidates/import/commit`,
      { method: "POST", body: JSON.stringify({ rows: v.data.rows }) },
    );
    setAdded(`Added ${result.data.count} candidate(s).`);
    qc.invalidateQueries({ queryKey: ["candidates", id] });
    qc.invalidateQueries({ queryKey: ["cycle", id] });
  };
  const submitQuickAdd = async () => {
    setQuickError("");
    const resultNumber = cycle.data?.data?.resultNumber ?? "0";
    const rows = quickRows
      .map((row, i) => ({ ...row, rank: i + 1 }))
      .filter((row) => row.nameHindi.trim() !== "")
      .map((row) => ({
        participantId: `${resultNumber}-${row.rank}`,
        certificateNumber: `PK${resultNumber}-${String(row.rank).padStart(3, "0")}`,
        phone: row.phone.trim(),
        nameHindi: row.nameHindi.trim(),
        nameEnglish: row.nameEnglish.trim() || row.nameHindi.trim(),
        guardianName: "Pending",
        className: "Pending",
        age: 10,
        city: "Pending",
        score: 0,
        rank: row.rank,
        resultDate: quickDate,
        photoPath: null,
      }));
    if (!rows.length) {
      setQuickError("Enter at least one candidate name.");
      return;
    }
    setQuickPending(true);
    try {
      await importRows(rows);
      setQuickOpen(false);
      setQuickRows(Array.from({ length: QUICK_ADD_SIZE }, emptyRow));
    } catch (err) {
      setQuickError((err as Error).message);
    } finally {
      setQuickPending(false);
    }
  };
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
          <Button
            variant="secondary"
            onClick={() =>
              downloadAdmin(`/admin/cycles/${id}/qr?format=svg`, "cycle-qr.svg")
            }
          >
            QR SVG
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadAdmin(
                `/admin/cycles/${id}/magazine-export?format=pdf`,
                "top-10.pdf",
              )
            }
          >
            Magazine PDF
          </Button>
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
      {added && (
        <p className="notice notice-success">
          {added}{" "}
          <button className="btn btn-secondary" onClick={() => setAdded("")}>
            Dismiss
          </button>
        </p>
      )}
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
            <a
              className="btn btn-secondary"
              href="/candidate-import-template.csv"
              download
            >
              CSV template
            </a>
            <Button
              variant="secondary"
              onClick={() => document.getElementById("csv-input")?.click()}
            >
              Import CSV
            </Button>
            <input
              id="csv-input"
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const rows = parseCsv(await f.text());
                  if (!confirm(`Import ${rows.length} candidates from this file?`))
                    return;
                  await importRows(rows);
                } catch (err) {
                  alert((err as Error).message);
                } finally {
                  e.target.value = "";
                }
              }}
            />
            <Button
              onClick={() => setQuickOpen(true)}
              disabled={c.status === "purged"}
            >
              Quick add Top 10
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
      {quickOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: "min(900px,100%)" }}>
            <h2>Quick add Top 10</h2>
            <p>
              Enter each candidate&rsquo;s name and mobile number; rank is set
              by row position. Leave a row blank to skip it. Guardian name,
              class, age, city and score are filled with a placeholder you
              can correct later using Edit.
            </p>
            <Field
              label="Result date (applies to all rows)"
              type="date"
              value={quickDate}
              onChange={(e) => setQuickDate(e.target.value)}
            />
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Name (Hindi)</th>
                    <th>Name (English)</th>
                    <th>Mobile number</th>
                  </tr>
                </thead>
                <tbody>
                  {quickRows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <strong>#{i + 1}</strong>
                      </td>
                      <td>
                        <input
                          className="input"
                          value={row.nameHindi}
                          onChange={(e) =>
                            setQuickRows((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, nameHindi: e.target.value } : r,
                              ),
                            )
                          }
                          placeholder="अनया जोशी"
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          value={row.nameEnglish}
                          onChange={(e) =>
                            setQuickRows((rows) =>
                              rows.map((r, j) =>
                                j === i
                                  ? { ...r, nameEnglish: e.target.value }
                                  : r,
                              ),
                            )
                          }
                          placeholder="Anaya Joshi"
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="tel"
                          value={row.phone}
                          onChange={(e) =>
                            setQuickRows((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, phone: e.target.value } : r,
                              ),
                            )
                          }
                          placeholder="9800000000"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {quickError && (
              <p className="notice notice-danger" style={{ marginTop: 12 }}>
                {quickError}
              </p>
            )}
            <div
              className="actions"
              style={{ marginTop: 20, justifyContent: "flex-end" }}
            >
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setQuickOpen(false);
                  setQuickError("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitQuickAdd}
                disabled={quickPending}
              >
                {quickPending ? "Saving…" : "Save all"}
              </Button>
            </div>
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
                  {...editForm.register(k)}
                  error={editForm.formState.errors[k]?.message}
                />
              ))}
              <Field
                label={fieldLabels.age}
                type="number"
                {...editForm.register("age", { valueAsNumber: true })}
                error={editForm.formState.errors.age?.message}
              />
              <Field
                label={fieldLabels.score}
                type="number"
                step="0.01"
                {...editForm.register("score", { valueAsNumber: true })}
                error={editForm.formState.errors.score?.message}
              />
              <Field
                label={fieldLabels.rank}
                type="number"
                {...editForm.register("rank", { valueAsNumber: true })}
                error={editForm.formState.errors.rank?.message}
              />
              <Field
                label={fieldLabels.resultDate}
                type="date"
                {...editForm.register("resultDate")}
                error={editForm.formState.errors.resultDate?.message}
              />
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
function parseCsv(text: string) {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
      .split(/\r?\n/)
      .filter(Boolean),
    headers = split(lines.shift() ?? "");
  return lines.map((line) => {
    const cells = split(line),
      o: any = {};
    headers.forEach((h, i) => (o[h] = cells[i] ?? ""));
    o.age = Number(o.age);
    o.score = Number(o.score);
    o.rank = Number(o.rank);
    o.photoPath = o.photoPath || null;
    return o;
  });
}
function split(line: string) {
  const out: string[] = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\"' && line[i + 1] === '\"') {
      value += '\"';
      i++;
    } else if (c === '\"') quoted = !quoted;
    else if (c === "," && !quoted) {
      out.push(value.trim());
      value = "";
    } else value += c;
  }
  out.push(value.trim());
  return out;
}
