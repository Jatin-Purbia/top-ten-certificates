import { Injectable, OnModuleInit } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hash, verify } from "argon2";
import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  AdminRole,
  Candidate,
  CandidateInput,
  CycleInput,
  ResultCycle,
} from "@pathey/types";
import {
  calculateDisplayEnd,
  calculateExpiry,
  claimCode,
  sha256,
} from "./domain.js";

export type Template = {
  id: string;
  name: string;
  storagePath: string;
  approved: boolean;
  active: boolean;
  fieldConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
export type Audit = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actorId: string | null;
  metadata: Record<string, unknown>;
};
export type Cleanup = {
  id: string;
  cycleId: string;
  status: string;
  deletedRecords: number;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
};
type InternalCandidate = Candidate & { claimHash: string };
type Session = {
  id: string;
  candidateId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
};

const iso = () => new Date().toISOString();
const camel = (row: any): any =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  );
const snake = (row: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      v,
    ]),
  );

@Injectable()
export class Store implements OnModuleInit {

  private supabase?: SupabaseClient;
  private cycles: ResultCycle[] = [];
  private candidates: InternalCandidate[] = [];
  private sessions: Session[] = [];
  private templates: Template[] = [];
  private audits: Audit[] = [];
  private cleanups: Cleanup[] = [];
  private availability = {
    days: 30,
    changedBy: "demo-super-admin",
    changedAt: iso(),
  };
  readonly demo = process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "false";

  private hashClaimCode(code: string) {
    return hash(code, {
      type: 2,
      ...(this.demo
        ? { memoryCost: 4096, timeCost: 1, parallelism: 1 }
        : {}),
    });
  }

  async onModuleInit() {
    if (!this.demo) {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
        throw new Error("Supabase configuration is required outside demo mode");
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      return;
    }
    await this.seedDemo();
  }

  private async seedDemo() {
    const templateId = randomUUID();
    this.templates.push({
      id: templateId,
      name: "Approved Pathye Kan Certificate",
      storagePath: "certificate-demo.jpeg",
      approved: true,
      active: true,
      fieldConfig: {},
      createdAt: iso(),
      updatedAt: iso(),
    });
    const makeCycle = (
      status: ResultCycle["status"],
      offset: number,
      number: string,
    ) => {
      const publication = new Date(Date.now() + offset * 86_400_000);
      const now = iso();
      const cycle: ResultCycle = {
        id: randomUUID(),
        publicSlug: nanoid(24),
        title: "बाल प्रश्नोत्तरी",
        resultNumber: number,
        issueNumber: `PK-${number}`,
        displayStartAt: publication.toISOString(),
        displayEndAt: calculateDisplayEnd(publication).toISOString(),
        publicationAt: publication.toISOString(),
        expiresAt: calculateExpiry(publication, 30).toISOString(),
        downloadWindowDays: 30,
        status,
        certificateTemplateId: templateId,
        candidateCount: 0,
        downloadCount: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: status === "published" ? now : null,
        purgedAt: null,
      };
      this.cycles.push(cycle);
      return cycle;
    };
    makeCycle("draft", 15, "102");
    const published = makeCycle("published", -2, "101");
    const expired = makeCycle("expired", -40, "100");
    expired.expiresAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const firstNames = [
      "अनया",
      "विवान",
      "सान्वी",
      "आरव",
      "काव्या",
      "ईशान",
      "मीरा",
      "अद्विक",
      "तारा",
      "कबीर",
    ];
    const english = [
      "Anaya Joshi",
      "Vivaan Mehta",
      "Saanvi Rao",
      "Aarav Bansal",
      "Kavya Iyer",
      "Ishaan Sethi",
      "Meera Nair",
      "Advik Shah",
      "Tara Kapoor",
      "Kabir Verma",
    ];
    for (let i = 0; i < 10; i++)
      await this.createCandidate(published.id, {
        participantId: `DEMO-${String(i + 1).padStart(3, "0")}`,
        certificateNumber: `PK101-${String(i + 1).padStart(3, "0")}`,
        nameHindi: `${firstNames[i]} कुमार`,
        nameEnglish: english[i]!,
        guardianName: "Demo Guardian",
        className: `${5 + (i % 3)}`,
        age: 10 + (i % 3),
        city: ["जयपुर", "अजमेर", "कोटा", "जोधपुर", "उदयपुर"][i % 5]!,
        score: 100 - i,
        rank: i + 1,
        resultDate: published.publicationAt.slice(0, 10),
        photoPath: null,
      });
  }

  private async rows(table: string, query?: (q: any) => any) {
    const q = query
      ? query(this.supabase!.from(table).select("*"))
      : this.supabase!.from(table).select("*");
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(camel);
  }
  async roleFor(userId: string): Promise<AdminRole | null> {
    if (this.demo)
      return userId === "demo-viewer"
        ? "viewer"
        : userId === "demo-certificate-admin"
          ? "certificate_admin"
          : "super_admin";
    const { data } = await this.supabase!.from("admin_profiles")
      .select("role")
      .eq("id", userId)
      .eq("active", true)
      .maybeSingle();
    return (data?.role as AdminRole) ?? null;
  }
  async listCycles(search = "", status = ""): Promise<ResultCycle[]> {
    if (!this.demo)
      return this.rows("result_cycles", (q) => {
        let x = q.order("publication_at", { ascending: false });
        if (search)
          x = x.or(
            `title.ilike.%${search.replace(/[%_,]/g, "")}%,result_number.ilike.%${search.replace(/[%_,]/g, "")}%`,
          );
        if (status) x = x.eq("status", status);
        return x;
      });
    return this.cycles
      .filter(
        (c) =>
          (!status || c.status === status) &&
          (!search ||
            `${c.title} ${c.resultNumber}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      )
      .sort((a, b) => b.publicationAt.localeCompare(a.publicationAt));
  }
  async getCycle(id: string) {
    if (!this.demo) {
      const r = await this.rows("result_cycles", (q) =>
        q.eq("id", id).limit(1),
      );
      return r[0] as ResultCycle | undefined;
    }
    return this.cycles.find((c) => c.id === id);
  }
  async getCycleBySlug(slug: string) {
    if (!this.demo) {
      const r = await this.rows("result_cycles", (q) =>
        q.eq("public_slug", slug).limit(1),
      );
      return r[0] as ResultCycle | undefined;
    }
    return this.cycles.find((c) => c.publicSlug === slug);
  }
  async createCycle(input: CycleInput, actorId: string) {
    const now = iso(),
      publication = new Date(input.publicationAt);
    const item: ResultCycle = {
      id: randomUUID(),
      publicSlug: nanoid(24),
      title: input.title,
      resultNumber: input.resultNumber,
      issueNumber: input.issueNumber,
      displayStartAt: publication.toISOString(),
      displayEndAt: calculateDisplayEnd(publication).toISOString(),
      publicationAt: publication.toISOString(),
      expiresAt: calculateExpiry(
        publication,
        this.availability.days,
      ).toISOString(),
      downloadWindowDays: this.availability.days,
      status: input.status ?? "draft",
      certificateTemplateId: input.certificateTemplateId ?? null,
      candidateCount: 0,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      purgedAt: null,
    };
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("result_cycles")
        .insert({ ...snake(item), created_by: actorId })
        .select()
        .single();
      if (error) throw error;
      return camel(data) as ResultCycle;
    }
    this.cycles.push(item);
    await this.audit(actorId, "cycle.created", "result_cycle", item.id, {});
    return item;
  }
  async patchCycle(id: string, patch: Partial<ResultCycle>, actorId: string) {
    const cycle = await this.getCycle(id);
    if (!cycle) return;
    if (cycle.status === "purged") throw new Error("PURGED_CYCLE");
    const allowed =
      cycle.status === "published"
        ? ["title", "issueNumber"]
        : [
            "title",
            "resultNumber",
            "issueNumber",
            "publicationAt",
            "certificateTemplateId",
            "status",
          ];
    const safe = Object.fromEntries(
      Object.entries(patch).filter(([k]) => allowed.includes(k)),
    );
    if (safe.publicationAt && cycle.status !== "published") {
      safe.displayStartAt = safe.publicationAt;
      safe.displayEndAt = calculateDisplayEnd(
        safe.publicationAt as string,
      ).toISOString();
      safe.expiresAt = calculateExpiry(
        safe.publicationAt as string,
        cycle.downloadWindowDays,
      ).toISOString();
    }
    safe.updatedAt = iso();
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("result_cycles")
        .update(snake(safe))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return camel(data) as ResultCycle;
    }
    Object.assign(cycle, safe);
    await this.audit(actorId, "cycle.updated", "result_cycle", id, {
      fields: Object.keys(safe),
    });
    return cycle;
  }
  async publish(id: string, actorId: string) {
    const cycle = await this.getCycle(id);
    if (!cycle) return;
    const candidates = await this.listCandidates(id);
    const templates = await this.listTemplates();
    const approved = templates.some(
      (t) => t.id === cycle.certificateTemplateId && t.approved,
    );
    if (!candidates.length) throw new Error("CANDIDATES_REQUIRED");
    if (!approved) throw new Error("APPROVED_TEMPLATE_REQUIRED");
    const now = iso(),
      patch = {
        status: "published",
        publishedAt: now,
        updatedAt: now,
      } as const;
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("result_cycles")
        .update(snake(patch))
        .eq("id", id)
        .in("status", ["draft", "scheduled"])
        .select()
        .single();
      if (error) throw error;
      await this.audit(actorId, "cycle.published", "result_cycle", id, {});
      return camel(data) as ResultCycle;
    }
    Object.assign(cycle, patch);
    await this.audit(actorId, "cycle.published", "result_cycle", id, {});
    return cycle;
  }
  async expire(id: string, actorId: string) {
    return this.setStatus(id, "expired", actorId);
  }
  private async setStatus(
    id: string,
    status: ResultCycle["status"],
    actorId: string,
  ) {
    const cycle = await this.getCycle(id);
    if (!cycle) return;
    if (cycle.status === "purged") throw new Error("PURGED_CYCLE");
    const patch = { status, updatedAt: iso() };
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("result_cycles")
        .update(snake(patch))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await this.audit(actorId, `cycle.${status}`, "result_cycle", id, {});
      return camel(data) as ResultCycle;
    }
    Object.assign(cycle, patch);
    await this.audit(actorId, `cycle.${status}`, "result_cycle", id, {});
    return cycle;
  }
  async regenerateSlug(id: string, actorId: string) {
    const slug = nanoid(24);
    const c = await this.patchCycle(id, { publicSlug: slug } as any, actorId);
    if (this.demo && c) c.publicSlug = slug;
    else if (!this.demo) {
      await this.supabase!.from("result_cycles")
        .update({ public_slug: slug })
        .eq("id", id);
    }
    await this.audit(actorId, "cycle.slug_regenerated", "result_cycle", id, {});
    return this.getCycle(id);
  }
  async listCandidates(cycleId: string): Promise<Candidate[]> {
    if (!this.demo) {
      return (
        await this.rows("candidates", (q) =>
          q.eq("cycle_id", cycleId).order("rank"),
        )
      ).map(({ claimHash, ...c }: any) => c);
    }
    return this.candidates
      .filter((c) => c.cycleId === cycleId)
      .sort((a, b) => a.rank - b.rank)
      .map(({ claimHash, ...c }) => c);
  }
  async internalCandidate(cycleId: string, participantId: string) {
    if (!this.demo) {
      const { data } = await this.supabase!.from("candidates")
        .select("*, candidate_claim_credentials(hash)")
        .eq("cycle_id", cycleId)
        .eq("participant_id", participantId)
        .maybeSingle();
      if (!data) return;
      const c = camel(data);
      c.claimHash = data.candidate_claim_credentials?.hash;
      delete c.candidateClaimCredentials;
      return c as InternalCandidate;
    }
    return this.candidates.find(
      (c) =>
        c.cycleId === cycleId &&
        c.participantId.toLowerCase() === participantId.toLowerCase(),
    );
  }
  async candidateById(id: string) {
    if (!this.demo) {
      const r = await this.rows("candidates", (q) => q.eq("id", id).limit(1));
      return r[0] as Candidate | undefined;
    }
    const c = this.candidates.find((x) => x.id === id);
    if (!c) return;
    const { claimHash, ...safe } = c;
    return safe;
  }
  async candidateByPublicId(id: string) {
    if (!this.demo) {
      const r = await this.rows("candidates", (q) =>
        q.eq("public_certificate_id", id).limit(1),
      );
      return r[0] as Candidate | undefined;
    }
    const c = this.candidates.find((x) => x.publicCertificateId === id);
    if (!c) return;
    const { claimHash, ...safe } = c;
    return safe;
  }
  async createCandidate(cycleId: string, input: CandidateInput) {
    const code = claimCode(),
      now = iso();
    const item: InternalCandidate = {
      ...input,
      photoPath: input.photoPath ?? null,
      id: randomUUID(),
      cycleId,
      publicCertificateId: randomUUID(),
      downloadCount: 0,
      firstDownloadedAt: null,
      lastDownloadedAt: null,
      createdAt: now,
      updatedAt: now,
      claimHash: await this.hashClaimCode(code),
    };
    if (!this.demo) {
      const { claimHash, ...candidate } = item;
      const { error } = await this.supabase!.from("candidates").insert(
        snake(candidate),
      );
      if (error) throw error;
      const { error: credError } = await this.supabase!.from(
        "candidate_claim_credentials",
      ).insert({ candidate_id: item.id, hash: claimHash });
      if (credError) throw credError;
    } else {
      if (
        this.candidates.some(
          (c) =>
            c.cycleId === cycleId &&
            (c.rank === item.rank || c.participantId === item.participantId),
        )
      )
        throw new Error("DUPLICATE_CANDIDATE");
      this.candidates.push(item);
      const cycle = await this.getCycle(cycleId);
      if (cycle) cycle.candidateCount++;
    }
    const { claimHash, ...candidate } = item;
    return { candidate, claimCode: code };
  }
  async importCandidates(cycleId: string, inputs: CandidateInput[]) {
    const existing = await this.listCandidates(cycleId);
    const all = [
      ...existing.map((c) => ({
        participantId: c.participantId,
        rank: c.rank,
      })),
      ...inputs,
    ];
    if (new Set(all.map((x) => x.rank)).size !== all.length)
      throw new Error("DUPLICATE_RANK");
    if (
      new Set(all.map((x) => x.participantId.toLowerCase())).size !== all.length
    )
      throw new Error("DUPLICATE_PARTICIPANT_ID");
    const generated = [];
    if (this.demo) {
      const snapshot = this.candidates.slice();
      try {
        for (const input of inputs)
          generated.push(await this.createCandidate(cycleId, input));
      } catch (e) {
        this.candidates = snapshot;
        throw e;
      }
      return generated;
    }
    const payload = [];
    for (const input of inputs) {
      const code = claimCode(),
        now = iso(),
        candidate: InternalCandidate = {
          ...input,
          photoPath: input.photoPath ?? null,
          id: randomUUID(),
          cycleId,
          publicCertificateId: randomUUID(),
          downloadCount: 0,
          firstDownloadedAt: null,
          lastDownloadedAt: null,
          createdAt: now,
          updatedAt: now,
          claimHash: await this.hashClaimCode(code),
        };
      payload.push({ ...snake(candidate), claim_hash: candidate.claimHash });
      const { claimHash, ...safe } = candidate;
      generated.push({ candidate: safe, claimCode: code });
    }
    const { error } = await this.supabase!.rpc(
      "import_candidates_transactional",
      { target_cycle_id: cycleId, payload },
    );
    if (error) throw error;
    return generated;
  }
  async updateCandidate(
    id: string,
    patch: Partial<CandidateInput>,
    actorId: string,
  ) {
    const existing = await this.candidateById(id);
    if (!existing) return;
    const cycle = await this.getCycle(existing.cycleId);
    if (cycle?.status === "purged") throw new Error("PURGED_CYCLE");
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("candidates")
        .update(snake({ ...patch, updatedAt: iso() }))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await this.audit(actorId, "candidate.updated", "candidate", id, {
        fields: Object.keys(patch),
      });
      return camel(data) as Candidate;
    }
    const target = this.candidates.find((c) => c.id === id)!;
    Object.assign(target, patch, { updatedAt: iso() });
    await this.audit(actorId, "candidate.updated", "candidate", id, {
      fields: Object.keys(patch),
    });
    const { claimHash, ...safe } = target;
    return safe;
  }
  async deleteCandidate(id: string, actorId: string) {
    const c = await this.candidateById(id);
    if (!c) return false;
    const cycle = await this.getCycle(c.cycleId);
    if (cycle?.status !== "draft")
      throw new Error("PUBLISHED_CANDIDATE_DELETE");
    if (!this.demo) {
      const { error } = await this.supabase!.from("candidates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    } else {
      this.candidates = this.candidates.filter((x) => x.id !== id);
      if (cycle) cycle.candidateCount--;
    }
    await this.audit(actorId, "candidate.deleted", "candidate", id, {});
    return true;
  }
  async resetCode(id: string, actorId: string) {
    const code = claimCode(),
      claimHash = await hash(code, { type: 2 });
    if (!this.demo) {
      const { error } = await this.supabase!.from("candidate_claim_credentials")
        .update({ hash: claimHash, reset_at: iso() })
        .eq("candidate_id", id);
      if (error) throw error;
    } else {
      const c = this.candidates.find((x) => x.id === id);
      if (!c) return;
      c.claimHash = claimHash;
    }
    await this.audit(
      actorId,
      "candidate.claim_code_reset",
      "candidate",
      id,
      {},
    );
    return code;
  }
  async verifyClaim(cycleId: string, participantId: string, code: string) {
    const candidate = await this.internalCandidate(cycleId, participantId);
    if (!candidate || !candidate.claimHash) return;
    return (await verify(candidate.claimHash, code)) ? candidate : undefined;
  }
  async createSession(
    candidateId: string,
    rawToken: string,
    expiresAt: string,
  ) {
    const session = {
      id: randomUUID(),
      candidateId,
      tokenHash: sha256(rawToken),
      expiresAt,
      revokedAt: null,
    };
    if (!this.demo) {
      const { error } = await this.supabase!.from("claim_sessions").insert(
        snake(session),
      );
      if (error) throw error;
    } else this.sessions.push(session);
    return session;
  }
  async sessionCandidate(rawToken: string) {
    const tokenHash = sha256(rawToken);
    if (!this.demo) {
      const { data } = await this.supabase!.from("claim_sessions")
        .select("candidate_id,expires_at,revoked_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (!data || data.revoked_at || new Date(data.expires_at) <= new Date())
        return;
      return this.candidateById(data.candidate_id);
    }
    const s = this.sessions.find(
      (x) =>
        x.tokenHash === tokenHash &&
        !x.revokedAt &&
        new Date(x.expiresAt) > new Date(),
    );
    return s ? this.candidateById(s.candidateId) : undefined;
  }
  async recordDownload(id: string, fingerprint: string) {
    const now = iso();
    if (!this.demo) {
      await this.supabase!.from("certificate_download_events").insert({
        candidate_id: id,
        request_fingerprint: fingerprint,
      });
      await this.supabase!.rpc("increment_candidate_download", {
        candidate_uuid: id,
      });
    } else {
      const c = this.candidates.find((x) => x.id === id);
      if (c) {
        c.downloadCount++;
        c.firstDownloadedAt ??= now;
        c.lastDownloadedAt = now;
        const cycle = await this.getCycle(c.cycleId);
        if (cycle) cycle.downloadCount++;
      }
    }
  }
  async listTemplates(): Promise<Template[]> {
    return this.demo ? this.templates : this.rows("certificate_templates");
  }
  async createTemplate(input: Partial<Template>, actorId: string) {
    const now = iso(),
      item: Template = {
        id: randomUUID(),
        name: input.name ?? "Certificate Template",
        storagePath: input.storagePath ?? "certificate-demo.jpeg",
        approved: !!input.approved,
        active: !!input.active,
        fieldConfig: input.fieldConfig ?? {},
        createdAt: now,
        updatedAt: now,
      };
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("certificate_templates")
        .insert({ ...snake(item), created_by: actorId })
        .select()
        .single();
      if (error) throw error;
      return camel(data);
    }
    this.templates.push(item);
    return item;
  }
  async updateTemplate(id: string, patch: Partial<Template>) {
    if (!this.demo) {
      const { data, error } = await this.supabase!.from("certificate_templates")
        .update(snake({ ...patch, updatedAt: iso() }))
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return camel(data);
    }
    const t = this.templates.find((x) => x.id === id);
    if (t) Object.assign(t, patch, { updatedAt: iso() });
    return t;
  }
  async getSettings() {
    if (!this.demo) {
      const { data } = await this.supabase!.from("app_settings")
        .select("*")
        .eq("key", "certificate_availability")
        .single();
      return {
        days: Number(data.value.days),
        changedBy: data.changed_by,
        changedAt: data.updated_at,
      };
    }
    return this.availability;
  }
  async setSettings(days: number, actorId: string) {
    this.availability = { days, changedBy: actorId, changedAt: iso() };
    if (!this.demo) {
      const { error } = await this.supabase!.from("app_settings")
        .update({
          value: { days },
          changed_by: actorId,
          updated_at: this.availability.changedAt,
        })
        .eq("key", "certificate_availability");
      if (error) throw error;
    }
    await this.audit(
      actorId,
      "settings.availability_changed",
      "app_setting",
      null,
      { days },
    );
    return this.availability;
  }
  async activeCyclePreview(days: number) {
    const cycles = (await this.listCycles()).filter(
      (c) => c.status === "published",
    );
    return cycles.map((c) => ({
      id: c.id,
      title: c.title,
      resultNumber: c.resultNumber,
      oldExpiresAt: c.expiresAt,
      newExpiresAt: calculateExpiry(c.publicationAt, days).toISOString(),
      willExpireImmediately:
        calculateExpiry(c.publicationAt, days) <= new Date(),
    }));
  }
  async applySettings(days: number, actorId: string) {
    const affected = await this.activeCyclePreview(days);
    for (const a of affected) {
      if (!this.demo)
        await this.supabase!.from("result_cycles")
          .update({
            expires_at: a.newExpiresAt,
            download_window_days: days,
            updated_at: iso(),
          })
          .eq("id", a.id)
          .eq("status", "published");
      else {
        const c = await this.getCycle(a.id);
        if (c) {
          c.expiresAt = a.newExpiresAt;
          c.downloadWindowDays = days;
          c.updatedAt = iso();
        }
      }
    }
    await this.audit(
      actorId,
      "settings.applied_to_active_cycles",
      "app_setting",
      null,
      { days, cycleIds: affected.map((a) => a.id) },
    );
    return affected;
  }
  async audit(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown>,
  ) {
    const item: Audit = {
      id: randomUUID(),
      actorId,
      action,
      entityType,
      entityId,
      metadata,
      createdAt: iso(),
    };
    if (!this.demo) await this.supabase!.from("audit_logs").insert(snake(item));
    else this.audits.unshift(item);
  }
  async listAudits() {
    return this.demo
      ? this.audits.slice(0, 100)
      : this.rows("audit_logs", (q) =>
          q.order("created_at", { ascending: false }).limit(100),
        );
  }
  async listCleanups() {
    return this.demo
      ? this.cleanups
      : this.rows("cleanup_runs", (q) =>
          q.order("started_at", { ascending: false }).limit(100),
        );
  }
  async dashboard() {
    const cycles = await this.listCycles(),
      published = cycles.find((c) => c.status === "published"),
      scheduled = cycles.find(
        (c) => c.status === "scheduled" || c.status === "draft",
      );
    const candidates = published ? await this.listCandidates(published.id) : [];
    const cleanups = await this.listCleanups();
    return {
      currentCycle: published ?? null,
      nextCycle: scheduled ?? null,
      candidateCount: candidates.length,
      downloaded: candidates.filter((c) => c.downloadCount > 0).length,
      notDownloaded: candidates.filter((c) => c.downloadCount === 0).length,
      nearingExpiry: cycles.filter(
        (c) =>
          c.status === "published" &&
          new Date(c.expiresAt).getTime() - Date.now() < 3 * 86_400_000,
      ).length,
      lastCleanup: cleanups[0] ?? null,
      nextExpectedCleanup: new Date(Date.now() + 3_600_000).toISOString(),
      recentActivity: (await this.listAudits()).slice(0, 8),
    };
  }
  async purgeExpired() {
    const cycles = (await this.listCycles()).filter(
      (c) =>
        ["published", "expired"].includes(c.status) &&
        new Date(c.expiresAt) <= new Date(),
    );
    const results = [];
    for (const cycle of cycles) {
      const run: Cleanup = {
        id: randomUUID(),
        cycleId: cycle.id,
        status: "running",
        deletedRecords: 0,
        startedAt: iso(),
        completedAt: null,
        errorCode: null,
      };
      if (this.demo) this.cleanups.unshift(run);
      else await this.supabase!.from("cleanup_runs").insert(snake(run));
      try {
        if (!this.demo) {
          const { data: photos, error: photoQueryError } =
            await this.supabase!.from("candidates")
              .select("photo_path")
              .eq("cycle_id", cycle.id)
              .not("photo_path", "is", null);
          if (photoQueryError) throw photoQueryError;
          const paths = (photos ?? []).map((x) => x.photo_path).filter(Boolean);
          if (paths.length) {
            const { error: storageError } =
              await this.supabase!.storage.from("candidate-private").remove(
                paths,
              );
            if (storageError) throw storageError;
          }
          const { data, error } = await this.supabase!.rpc(
            "purge_expired_cycle",
            { target_cycle_id: cycle.id },
          );
          if (error) throw error;
          run.deletedRecords = Number(data ?? 0);
        } else {
          const before = this.candidates.length;
          const ids = this.candidates
            .filter((c) => c.cycleId === cycle.id)
            .map((c) => c.id);
          this.sessions = this.sessions.filter(
            (s) => !ids.includes(s.candidateId),
          );
          this.candidates = this.candidates.filter(
            (c) => c.cycleId !== cycle.id,
          );
          run.deletedRecords = before - this.candidates.length;
          cycle.status = "purged";
          cycle.purgedAt = iso();
          cycle.candidateCount = 0;
        }
        run.status = "succeeded";
        run.completedAt = iso();
        results.push(run);
      } catch (e) {
        run.status = "failed";
        run.errorCode = "PURGE_FAILED";
        run.completedAt = iso();
        results.push(run);
      }
      if (!this.demo)
        await this.supabase!.from("cleanup_runs")
          .update(snake(run))
          .eq("id", run.id);
    }
    return results;
  }
}
