import { Injectable, OnModuleInit } from "@nestjs/common";
import { MongoClient, type Db, type Document } from "mongodb";
import { verify } from "argon2";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
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
export type AdminProfile = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
type Session = {
  id: string;
  candidateId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
};

const iso = () => new Date().toISOString();
const withId = <T extends { id: string }>(item: T) => ({ ...item, _id: item.id });
const noId = { projection: { _id: 0 } } as const;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const photoDir = () => process.env.CANDIDATE_PHOTO_DIR ?? "./storage/candidate-photos";

@Injectable()
export class Store implements OnModuleInit {

  private mongo?: MongoClient;
  private db?: Db;
  private cycles: ResultCycle[] = [];
  private candidates: Candidate[] = [];
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

  private col<T extends Document = Document>(name: string) {
    return this.db!.collection<T & { _id: string }>(name);
  }

  async onModuleInit() {
    if (!this.demo) {
      if (!process.env.MONGODB_URI)
        throw new Error("MongoDB configuration is required outside demo mode");
      this.mongo = new MongoClient(process.env.MONGODB_URI);
      await this.mongo.connect();
      this.db = this.mongo.db();
      await this.ensureIndexes();
      return;
    }
    await this.seedDemo();
  }

  private async ensureIndexes() {
    const db = this.db!;
    await Promise.all([
      db.collection("result_cycles").createIndex({ publicSlug: 1 }, { unique: true }),
      db.collection("result_cycles").createIndex({ status: 1, expiresAt: 1 }),
      db.collection("candidates").createIndex({ cycleId: 1 }),
      db.collection("candidates").createIndex({ cycleId: 1, rank: 1 }, { unique: true }),
      db.collection("candidates").createIndex({ cycleId: 1, certificateNumber: 1 }, { unique: true }),
      db.collection("candidates").createIndex({ cycleId: 1, phone: 1 }, { unique: true }),
      db.collection("candidates").createIndex({ publicCertificateId: 1 }, { unique: true }),
      db.collection("claim_sessions").createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection("claim_sessions").createIndex({ candidateId: 1 }),
      db.collection("certificate_download_events").createIndex({ candidateId: 1 }),
      db.collection("audit_logs").createIndex({ createdAt: -1 }),
      db.collection("cleanup_runs").createIndex({ startedAt: -1 }),
      db.collection("admin_profiles").createIndex({ email: 1 }, { unique: true }),
    ]);
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
        phone: `9${String(100000000 + i).padStart(9, "0")}`,
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

  async roleFor(userId: string): Promise<AdminRole | null> {
    if (this.demo)
      return userId === "demo-viewer"
        ? "viewer"
        : userId === "demo-certificate-admin"
          ? "certificate_admin"
          : "super_admin";
    const admin = await this.col("admin_profiles").findOne(
      { _id: userId, active: true } as any,
      { projection: { role: 1 } },
    );
    return (admin?.role as AdminRole) ?? null;
  }
  async verifyAdminPassword(email: string, password: string) {
    if (this.demo) return undefined;
    const admin = await this.col("admin_profiles").findOne({
      email: email.toLowerCase(),
      active: true,
    } as any);
    if (!admin) return undefined;
    const ok = await verify(admin.passwordHash as string, password).catch(() => false);
    if (!ok) return undefined;
    return {
      id: admin._id as string,
      email: admin.email as string,
      displayName: admin.displayName as string,
      role: admin.role as AdminRole,
    };
  }
  async listCycles(search = "", status = ""): Promise<ResultCycle[]> {
    if (!this.demo) {
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (search) {
        const rx = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ title: rx }, { resultNumber: rx }];
      }
      return this.col("result_cycles")
        .find(filter, noId)
        .sort({ publicationAt: -1 })
        .toArray() as unknown as Promise<ResultCycle[]>;
    }
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
      const doc = await this.col("result_cycles").findOne({ _id: id } as any, noId);
      return (doc as unknown as ResultCycle) ?? undefined;
    }
    return this.cycles.find((c) => c.id === id);
  }
  async getCycleBySlug(slug: string) {
    if (!this.demo) {
      const doc = await this.col("result_cycles").findOne({ publicSlug: slug }, noId);
      return (doc as unknown as ResultCycle) ?? undefined;
    }
    return this.cycles.find((c) => c.publicSlug === slug);
  }
  async createCycle(input: CycleInput, actorId: string) {
    const now = iso(),
      publication = new Date(input.publicationAt);
    // The create-cycle form no longer offers a template picker, so a cycle
    // created without one would otherwise be silently unpublishable later
    // (publish() requires an approved template) — default to the first
    // approved, active template when the caller doesn't specify one.
    let certificateTemplateId = input.certificateTemplateId ?? null;
    if (!certificateTemplateId) {
      const templates = await this.listTemplates();
      certificateTemplateId =
        templates.find((t) => t.approved && t.active)?.id ?? null;
    }
    const item: ResultCycle = {
      id: randomUUID(),
      publicSlug: nanoid(24),
      title: input.title,
      resultNumber: input.resultNumber ?? "",
      issueNumber: input.issueNumber ?? "",
      displayStartAt: publication.toISOString(),
      displayEndAt: calculateDisplayEnd(publication).toISOString(),
      publicationAt: publication.toISOString(),
      expiresAt: calculateExpiry(
        publication,
        this.availability.days,
      ).toISOString(),
      downloadWindowDays: this.availability.days,
      status: input.status ?? "draft",
      certificateTemplateId,
      candidateCount: 0,
      downloadCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      purgedAt: null,
    };
    if (!this.demo) {
      await this.col("result_cycles").insertOne({ ...withId(item), createdBy: actorId });
      return item;
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
      const updated = await this.col("result_cycles").findOneAndUpdate(
        { _id: id } as any,
        { $set: safe },
        { returnDocument: "after", projection: { _id: 0 } },
      );
      if (!updated) throw new Error("CYCLE_NOT_FOUND");
      return updated as unknown as ResultCycle;
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
      const updated = await this.col("result_cycles").findOneAndUpdate(
        { _id: id, status: { $in: ["draft", "scheduled"] } } as any,
        { $set: patch },
        { returnDocument: "after", projection: { _id: 0 } },
      );
      if (!updated) throw new Error("CYCLE_STATUS_CHANGED");
      await this.audit(actorId, "cycle.published", "result_cycle", id, {});
      return updated as unknown as ResultCycle;
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
      const updated = await this.col("result_cycles").findOneAndUpdate(
        { _id: id } as any,
        { $set: patch },
        { returnDocument: "after", projection: { _id: 0 } },
      );
      if (!updated) throw new Error("CYCLE_NOT_FOUND");
      await this.audit(actorId, `cycle.${status}`, "result_cycle", id, {});
      return updated as unknown as ResultCycle;
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
      await this.col("result_cycles").updateOne(
        { _id: id } as any,
        { $set: { publicSlug: slug } },
      );
    }
    await this.audit(actorId, "cycle.slug_regenerated", "result_cycle", id, {});
    return this.getCycle(id);
  }
  async listCandidates(cycleId: string): Promise<Candidate[]> {
    if (!this.demo)
      return this.col("candidates")
        .find({ cycleId }, noId)
        .sort({ rank: 1 })
        .toArray() as unknown as Promise<Candidate[]>;
    return this.candidates
      .filter((c) => c.cycleId === cycleId)
      .sort((a, b) => a.rank - b.rank);
  }
  async candidateByPhone(cycleId: string, phone: string) {
    if (!this.demo) {
      const doc = await this.col("candidates").findOne({ cycleId, phone }, noId);
      return (doc as unknown as Candidate) ?? undefined;
    }
    return this.candidates.find(
      (c) => c.cycleId === cycleId && c.phone === phone,
    );
  }
  async candidateById(id: string) {
    if (!this.demo) {
      const doc = await this.col("candidates").findOne({ _id: id } as any, noId);
      return (doc as unknown as Candidate) ?? undefined;
    }
    return this.candidates.find((x) => x.id === id);
  }
  async candidateByPublicId(id: string) {
    if (!this.demo) {
      const doc = await this.col("candidates").findOne({ publicCertificateId: id }, noId);
      return (doc as unknown as Candidate) ?? undefined;
    }
    return this.candidates.find((x) => x.publicCertificateId === id);
  }
  async createCandidate(cycleId: string, input: CandidateInput) {
    const now = iso();
    // participantId/certificateNumber are optional on input — an admin adding
    // a single candidate no longer types these in, so generate them from the
    // cycle's result number + rank when missing (same convention the demo
    // seed and CSV import already use), guaranteeing every stored candidate
    // still has real, unique-per-cycle values.
    const cycle = await this.getCycle(cycleId);
    const resultNumber = cycle?.resultNumber || "0";
    const participantId = input.participantId?.trim() || `${resultNumber}-${input.rank}`;
    const certificateNumber =
      input.certificateNumber?.trim() ||
      `PK${resultNumber}-${String(input.rank).padStart(3, "0")}`;
    const item: Candidate = {
      ...input,
      participantId,
      certificateNumber,
      photoPath: input.photoPath ?? null,
      id: randomUUID(),
      cycleId,
      publicCertificateId: randomUUID(),
      downloadCount: 0,
      firstDownloadedAt: null,
      lastDownloadedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    if (!this.demo) {
      await this.col("candidates").insertOne(withId(item));
    } else {
      if (
        this.candidates.some(
          (c) =>
            c.cycleId === cycleId &&
            (c.rank === item.rank || c.phone === item.phone),
        )
      )
        throw new Error("DUPLICATE_CANDIDATE");
      this.candidates.push(item);
      const cycle = await this.getCycle(cycleId);
      if (cycle) cycle.candidateCount++;
    }
    return { candidate: item };
  }
  async importCandidates(cycleId: string, inputs: CandidateInput[]) {
    const existing = await this.listCandidates(cycleId);
    const all = [
      ...existing.map((c) => ({
        phone: c.phone,
        rank: c.rank,
      })),
      ...inputs,
    ];
    if (new Set(all.map((x) => x.rank)).size !== all.length)
      throw new Error("DUPLICATE_RANK");
    if (new Set(all.map((x) => x.phone)).size !== all.length)
      throw new Error("DUPLICATE_PHONE");
    const generated: { candidate: Candidate }[] = [];
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
    const now = iso();
    const docs = inputs.map((input) => {
      const candidate: Candidate = {
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
      };
      generated.push({ candidate });
      return candidate;
    });
    const session = this.mongo!.startSession();
    try {
      await session.withTransaction(async () => {
        const cycle = await this.col("result_cycles").findOne(
          { _id: cycleId, status: { $in: ["draft", "scheduled"] } } as any,
          { session },
        );
        if (!cycle) throw new Error("Cycle is not editable");
        await this.col("candidates").insertMany(docs.map(withId), {
          session,
          ordered: true,
        });
      });
    } finally {
      await session.endSession();
    }
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
      const updated = await this.col("candidates").findOneAndUpdate(
        { _id: id } as any,
        { $set: { ...patch, updatedAt: iso() } },
        { returnDocument: "after", projection: { _id: 0 } },
      );
      await this.audit(actorId, "candidate.updated", "candidate", id, {
        fields: Object.keys(patch),
      });
      return updated as unknown as Candidate;
    }
    const target = this.candidates.find((c) => c.id === id)!;
    Object.assign(target, patch, { updatedAt: iso() });
    await this.audit(actorId, "candidate.updated", "candidate", id, {
      fields: Object.keys(patch),
    });
    return target;
  }
  async deleteCandidate(id: string, actorId: string) {
    const c = await this.candidateById(id);
    if (!c) return false;
    const cycle = await this.getCycle(c.cycleId);
    if (cycle?.status !== "draft")
      throw new Error("PUBLISHED_CANDIDATE_DELETE");
    if (!this.demo) {
      await this.col("candidates").deleteOne({ _id: id } as any);
    } else {
      this.candidates = this.candidates.filter((x) => x.id !== id);
      if (cycle) cycle.candidateCount--;
    }
    await this.audit(actorId, "candidate.deleted", "candidate", id, {});
    return true;
  }
  async verifyClaim(cycleId: string, phone: string) {
    return this.candidateByPhone(cycleId, phone);
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
    if (!this.demo) await this.col("claim_sessions").insertOne(withId(session));
    else this.sessions.push(session);
    return session;
  }
  async sessionCandidate(rawToken: string) {
    const tokenHash = sha256(rawToken);
    if (!this.demo) {
      const doc = await this.col("claim_sessions").findOne({ tokenHash });
      if (!doc || doc.revokedAt || new Date(doc.expiresAt as string) <= new Date())
        return;
      return this.candidateById(doc.candidateId as string);
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
      await this.col("certificate_download_events").insertOne({
        _id: randomUUID(),
        candidateId: id,
        downloadedAt: now,
        requestFingerprint: fingerprint,
      });
      await this.col("candidates").updateOne({ _id: id } as any, [
        {
          $set: {
            downloadCount: { $add: [{ $ifNull: ["$downloadCount", 0] }, 1] },
            firstDownloadedAt: { $ifNull: ["$firstDownloadedAt", now] },
            lastDownloadedAt: now,
          },
        },
      ] as any);
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
    return this.demo
      ? this.templates
      : (this.col("certificate_templates").find({}, noId).toArray() as unknown as Promise<Template[]>);
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
      await this.col("certificate_templates").insertOne({
        ...withId(item),
        createdBy: actorId,
      });
      return item;
    }
    this.templates.push(item);
    return item;
  }
  async updateTemplate(id: string, patch: Partial<Template>) {
    if (!this.demo) {
      const updated = await this.col("certificate_templates").findOneAndUpdate(
        { _id: id } as any,
        { $set: { ...patch, updatedAt: iso() } },
        { returnDocument: "after", projection: { _id: 0 } },
      );
      return updated as unknown as Template;
    }
    const t = this.templates.find((x) => x.id === id);
    if (t) Object.assign(t, patch, { updatedAt: iso() });
    return t;
  }
  async getSettings() {
    if (!this.demo) {
      const doc = await this.col("app_settings").findOne({ _id: "certificate_availability" } as any);
      if (!doc) throw new Error("SETTINGS_NOT_SEEDED");
      return {
        days: Number((doc.value as any).days),
        changedBy: doc.changedBy as string,
        changedAt: doc.updatedAt as string,
      };
    }
    return this.availability;
  }
  async setSettings(days: number, actorId: string) {
    this.availability = { days, changedBy: actorId, changedAt: iso() };
    if (!this.demo) {
      await this.col("app_settings").updateOne(
        { _id: "certificate_availability" } as any,
        {
          $set: {
            value: { days },
            changedBy: actorId,
            updatedAt: this.availability.changedAt,
          },
        },
        { upsert: true },
      );
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
        await this.col("result_cycles").updateOne(
          { _id: a.id, status: "published" } as any,
          {
            $set: {
              expiresAt: a.newExpiresAt,
              downloadWindowDays: days,
              updatedAt: iso(),
            },
          },
        );
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
    if (!this.demo) await this.col("audit_logs").insertOne(withId(item));
    else this.audits.unshift(item);
  }
  async listAudits() {
    return this.demo
      ? this.audits.slice(0, 100)
      : (this.col("audit_logs")
          .find({}, noId)
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray() as unknown as Promise<Audit[]>);
  }
  async listCleanups() {
    return this.demo
      ? this.cleanups
      : (this.col("cleanup_runs")
          .find({}, noId)
          .sort({ startedAt: -1 })
          .limit(100)
          .toArray() as unknown as Promise<Cleanup[]>);
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
      else await this.col("cleanup_runs").insertOne(withId(run));
      try {
        if (!this.demo) {
          const photoDocs = await this.col("candidates")
            .find(
              { cycleId: cycle.id, photoPath: { $ne: null } },
              { projection: { photoPath: 1 } },
            )
            .toArray();
          const paths = photoDocs
            .map((x) => x.photoPath as string | null)
            .filter((p): p is string => Boolean(p));
          await Promise.all(
            paths.map((p) => rm(join(photoDir(), p), { force: true }).catch(() => {})),
          );
          const session = this.mongo!.startSession();
          let deleted = 0;
          try {
            await session.withTransaction(async () => {
              const nowIso = new Date().toISOString();
              const eligible = await this.col("result_cycles").findOne(
                { _id: cycle.id, status: { $ne: "purged" }, expiresAt: { $lte: nowIso } } as any,
                { session },
              );
              if (!eligible) {
                deleted = 0;
                return;
              }
              const candidateDocs = await this.col("candidates")
                .find({ cycleId: cycle.id }, { session, projection: { _id: 1 } })
                .toArray();
              const ids = candidateDocs.map((d) => d._id as string);
              if (ids.length) {
                await this.col("claim_sessions").deleteMany(
                  { candidateId: { $in: ids } },
                  { session },
                );
                await this.col("certificate_download_events").deleteMany(
                  { candidateId: { $in: ids } },
                  { session },
                );
                await this.col("candidates").deleteMany(
                  { cycleId: cycle.id },
                  { session },
                );
              }
              deleted = ids.length;
              await this.col("result_cycles").updateOne(
                { _id: cycle.id } as any,
                { $set: { status: "purged", purgedAt: iso(), updatedAt: iso() } },
                { session },
              );
            });
          } finally {
            await session.endSession();
          }
          run.deletedRecords = deleted;
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
        await this.col("cleanup_runs").updateOne(
          { _id: run.id } as any,
          { $set: run },
        );
    }
    return results;
  }
}
