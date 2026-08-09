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
const blank: CandidateInput = {
  participantId: "",
  certificateNumber: "",
  phone: "",
  nameHindi: "",
  nameEnglish: "",
  guardianName: "",
  className: "",
  age: 10,
  city: "",
  score: 0,
  rank: 1,
  resultDate: new Date().toISOString().slice(0, 10),
  photoPath: null,
};
export function CycleWorkspace({ id }: { id: string }) {
  const qc = useQueryClient(),
    [addOpen, setAddOpen] = useState(false),
    [added, setAdded] = useState("");
  const [error, setError] = useState("");
  const cycle = useQuery({
      queryKey: ["cycle", id],
      queryFn: () => adminFetch<any>(`/admin/cycles/${id}`),
    }),
    candidates = useQuery({
      queryKey: ["candidates", id],
      queryFn: () => adminFetch<any>(`/admin/cycles/${id}/candidates`),
    });
  const form = useForm<CandidateInput>({
    resolver: zodResolver(candidateInputSchema),
    defaultValues: blank,
  });
  const add = useMutation<any, Error, CandidateInput>({
    mutationFn: (v: CandidateInput) =>
      adminFetch<any>(`/admin/cycles/${id}/candidates`, {
        method: "POST",
        body: JSON.stringify(v),
      }),
    onSuccess: (r) => {
      setAdded(
        `Added ${r.data.candidate.participantId} (${r.data.candidate.phone}).`,
      );
      setAddOpen(false);
      form.reset(blank);
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
                  if (
                    !confirm(`Import ${v.data.rowCount} validated candidates?`)
                  )
                    return;
                  const result = await adminFetch<any>(
                    `/admin/cycles/${id}/candidates/import/commit`,
                    {
                      method: "POST",
                      body: JSON.stringify({ rows: v.data.rows }),
                    },
                  );
                  setAdded(`Imported ${result.data.count} candidates.`);
                  qc.invalidateQueries({ queryKey: ["candidates", id] });
                } catch (err) {
                  alert((err as Error).message);
                } finally {
                  e.target.value = "";
                }
              }}
            />
            <Button
              onClick={() => setAddOpen(true)}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {addOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Add candidate</h2>
            <form
              className="form-grid"
              onSubmit={form.handleSubmit((v) => add.mutate(v))}
            >
              <div className="notice span-2 certificate-field-guide">
                <strong>Certificate artwork fields</strong>
                <p>
                  The approved certificate prints result number, score, Hindi
                  candidate name, parent/guardian name, class, age, rank, and
                  result date. City and English name are used for the magazine
                  and administration only.
                </p>
                <p>
                  The candidate&rsquo;s mobile number secures the download
                  and is never printed on the certificate or in the
                  magazine.
                </p>
              </div>
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
                  label={
                    {
                      participantId: "Unique participant/reference ID",
                      certificateNumber: "Internal certificate number",
                      phone: "Mobile number (used to access the certificate)",
                      nameHindi: "Candidate name on certificate (Hindi)",
                      nameEnglish: "Candidate name (English/admin)",
                      guardianName: "Parent/guardian name on certificate",
                      className: "Class on certificate",
                      city: "City/district (magazine only)",
                    }[k]
                  }
                  type={k === "phone" ? "tel" : undefined}
                  {...form.register(k)}
                  error={form.formState.errors[k]?.message}
                />
              ))}
              <Field
                label="Age on certificate"
                type="number"
                {...form.register("age", { valueAsNumber: true })}
                error={form.formState.errors.age?.message}
              />
              <Field
                label="Score on certificate"
                type="number"
                step="0.01"
                {...form.register("score", { valueAsNumber: true })}
                error={form.formState.errors.score?.message}
              />
              <Field
                label="Rank/position on certificate (1–10)"
                type="number"
                {...form.register("rank", { valueAsNumber: true })}
                error={form.formState.errors.rank?.message}
              />
              <Field
                label="Date on certificate"
                type="date"
                {...form.register("resultDate")}
                error={form.formState.errors.resultDate?.message}
              />
              {add.error && (
                <p className="notice notice-danger span-2">
                  {add.error.message}
                </p>
              )}
              <div
                className="actions span-2"
                style={{ justifyContent: "flex-end" }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={add.isPending}>
                  Add candidate
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
  const lines = text
      .replace(/^\uFEFF/, "")
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
