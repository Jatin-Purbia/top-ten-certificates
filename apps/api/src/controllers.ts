import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {
  candidateInputSchema,
  claimSchema,
  cycleInputSchema,
  type CandidateInput,
} from "@pathey/types";
import { z } from "zod";
import { Store } from "./store.js";
import { ExportService } from "./export.service.js";
import { ensureHindi } from "@pathey/hindi-text";
import {
  ClaimRateLimiter,
  Public,
  Roles,
  adminSecret,
  type AdminRequest,
} from "./security.js";
import { publicCycleState, sanitizeFilename, sha256 } from "./domain.js";

const genericClaimError = "No certificate was found for this mobile number.";
const expiredEn =
  "The certificate download period for this result has ended. Please contact the publication office if you require assistance.";
const expiredHi =
  "इस परिणाम के लिए प्रमाण पत्र डाउनलोड की अवधि समाप्त हो गई है। सहायता के लिए कृपया प्रकाशन कार्यालय से संपर्क करें।";
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Please correct the highlighted fields.",
      details: z.treeifyError(r.error),
    });
  return r.data;
};
const secret = () =>
  new TextEncoder().encode(
    process.env.COOKIE_SECRET ?? "development-only-cookie-secret-32chars",
  );
const claimCookie = "pk_claim_session";
const production = process.env.NODE_ENV === "production";
// The web app and API are deployed on different domains (Vercel/Render), so
// this cookie must be sent cross-site — that requires SameSite=None, which
// browsers only honor when Secure is also set. Locally the app is served
// over http on the same site (just a different port), where SameSite=None
// without Secure would be rejected outright, so dev keeps the stricter
// same-site policy instead.
// "Strict" blocks the cookie on things like the certificate-preview
// <iframe> load, which isn't a genuine cross-site request in dev — the
// download endpoint already carries its own x-claim-csrf token, so "Lax"
// costs no real security here and avoids that class of false rejection.
const claimCookieSameSite: "none" | "lax" = production ? "none" : "lax";
const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: production,
  sameSite: claimCookieSameSite,
  path: "/api/v1/public",
  maxAge,
});
const urlFor = (slug: string) =>
  `${(process.env.PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/certificate/${slug}`;
const actor = (req: AdminRequest) => req.admin.id;

@ApiTags("Public certificate portal")
@Public()
@Controller("public")
export class PublicController {
  constructor(
    @Inject(Store) private readonly store: Store,
    @Inject(ExportService) private readonly exports: ExportService,
    @Inject(ClaimRateLimiter) private readonly limiter: ClaimRateLimiter,
  ) {}
  @Get("cycles") async activeCycles() {
    const cycles = await this.store.listCycles();
    return {
      data: cycles
        .filter((cycle) => publicCycleState(cycle) === "open")
        .map((cycle) => ({
          slug: cycle.publicSlug,
          title: cycle.title,
          resultNumber: cycle.resultNumber,
          publicationAt: cycle.publicationAt,
          expiresAt: cycle.expiresAt,
        })),
    };
  }
  @Get("cycles/:slug") async cycle(@Param("slug") slug: string) {
    const cycle = await this.store.getCycleBySlug(slug);
    if (!cycle)
      throw new NotFoundException("This certificate link is invalid.");
    const state = publicCycleState(cycle);
    return {
      data: {
        slug: cycle.publicSlug,
        title: cycle.title,
        resultNumber: cycle.resultNumber,
        publicationAt: cycle.publicationAt,
        expiresAt: cycle.expiresAt,
        state,
        message: state === "expired" ? { en: expiredEn, hi: expiredHi } : null,
      },
    };
  }
  @Post("claims/verify")
  @ApiOperation({
    summary: "Look up a candidate's certificate by mobile number",
  })
  async verify(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(claimSchema, body),
      key = `${req.ip}:${sha256(input.phone)}`;
    this.limiter.check(key);
    const cycle = await this.store.getCycleBySlug(input.cycleSlug);
    if (!cycle) throw new UnauthorizedException(genericClaimError);
    const state = publicCycleState(cycle);
    if (state === "expired" || state === "purged")
      throw new BadRequestException({
        code: "CERTIFICATE_EXPIRED",
        message: expiredEn,
        messageHi: expiredHi,
      });
    if (state !== "open")
      throw new BadRequestException({
        code: "CERTIFICATE_NOT_AVAILABLE",
        message: "Certificates are not available for this result yet.",
      });
    const candidate = await this.store.verifyClaim(cycle.id, input.phone);
    if (!candidate) throw new UnauthorizedException(genericClaimError);
    this.limiter.clear(key);
    const ttl = Math.max(
        1,
        Math.min(15 * 60_000, new Date(cycle.expiresAt).getTime() - Date.now()),
      ),
      csrf = randomBytes(18).toString("base64url");
    const token = await new SignJWT({ candidateId: candidate.id, csrf })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(candidate.id)
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + ttl) / 1000))
      .setJti(randomBytes(12).toString("hex"))
      .sign(secret());
    await this.store.createSession(
      candidate.id,
      token,
      new Date(Date.now() + ttl).toISOString(),
    );
    res.cookie(claimCookie, token, cookieOptions(ttl));
    return {
      data: { csrf, expiresAt: new Date(Date.now() + ttl).toISOString() },
    };
  }
  private async session(req: Request) {
    const token = req.cookies?.[claimCookie];
    if (!token) throw new UnauthorizedException("Claim session required");
    try {
      const { payload } = await jwtVerify(token, secret());
      const candidate = await this.store.sessionCandidate(token);
      if (!candidate || payload.sub !== candidate.id) throw new Error();
      const cycle = await this.store.getCycle(candidate.cycleId);
      if (!cycle || publicCycleState(cycle) !== "open")
        throw new BadRequestException({
          code: "CERTIFICATE_EXPIRED",
          message: expiredEn,
          messageHi: expiredHi,
        });
      return { token, payload, candidate, cycle };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new UnauthorizedException(
        "Your secure claim session has expired. Please sign in again.",
      );
    }
  }
  @Get("claims/session") async getSession(@Req() req: Request) {
    const { candidate, cycle } = await this.session(req);
    return {
      data: {
        candidate: {
          nameHindi: ensureHindi(candidate.nameHindi?.trim() || candidate.nameEnglish),
          nameEnglish: candidate.nameEnglish,
          certificateNumber: candidate.certificateNumber,
          rank: candidate.rank,
          score: candidate.score,
          className: ensureHindi(candidate.className),
          resultDate: candidate.resultDate,
        },
        cycle: {
          title: cycle.title,
          resultNumber: cycle.resultNumber,
          expiresAt: cycle.expiresAt,
        },
      },
    };
  }
  @Get("certificates/preview") async preview(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { candidate, cycle } = await this.session(req);
    const pdf = await this.exports.certificate(cycle, candidate);
    res
      .type("application/pdf")
      .setHeader("Cache-Control", "no-store, private")
      .setHeader(
        "Content-Disposition",
        'inline; filename="certificate-preview.pdf"',
      )
      .send(pdf);
  }
  @Post("certificates/download") async download(
    @Req() req: Request,
    @Headers("x-claim-csrf") csrf: string,
    @Res() res: Response,
  ) {
    const { payload, candidate, cycle } = await this.session(req);
    if (!csrf || csrf !== payload.csrf)
      throw new UnauthorizedException("Invalid request token");
    const pdf = await this.exports.certificate(cycle, candidate);
    await this.store.recordDownload(
      candidate.id,
      sha256(`${req.ip}:${req.get("user-agent") ?? ""}`),
    );
    res
      .type("application/pdf")
      .setHeader("Cache-Control", "no-store, private")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${this.exports.filename(candidate)}"`,
      )
      .send(pdf);
  }
  @Get("certificates/:publicCertificateId/verify") async verifyCertificate(
    @Param("publicCertificateId") id: string,
  ) {
    const candidate = await this.store.candidateByPublicId(id);
    if (!candidate)
      throw new NotFoundException("Certificate record not found.");
    const cycle = await this.store.getCycle(candidate.cycleId);
    return {
      data: {
        valid: !!cycle && cycle.status !== "purged",
        certificateNumber: candidate.certificateNumber,
        name: candidate.nameEnglish,
        resultNumber: cycle?.resultNumber,
        resultDate: candidate.resultDate,
      },
    };
  }
}

@ApiTags("Administration")
@ApiBearerAuth()
@Controller("admin")
export class AdminController {
  constructor(
    @Inject(Store) private readonly store: Store,
    @Inject(ExportService) private readonly exports: ExportService,
  ) {}
  @Post("auth/login")
  @Public()
  @ApiOperation({ summary: "Administrator email/password sign-in" })
  async login(@Body() body: unknown) {
    const { email, password } = parse(
      z.object({ email: z.string().trim().email(), password: z.string().min(1) }),
      body,
    );
    const admin = await this.store.verifyAdminPassword(email, password);
    if (!admin)
      throw new UnauthorizedException("Invalid email or password.");
    const token = await new SignJWT({ role: admin.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(admin.id)
      .setIssuedAt()
      .setExpirationTime("12h")
      .setJti(randomBytes(12).toString("hex"))
      .sign(adminSecret());
    return {
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          displayName: admin.displayName,
          role: admin.role,
        },
      },
    };
  }
  @Get("dashboard") async dashboard() {
    return { data: await this.store.dashboard() };
  }
  @Get("cycles") async cycles(
    @Query("search") search = "",
    @Query("status") status = "",
    @Query("page") p = "1",
    @Query("pageSize") ps = "25",
  ) {
    const all = await this.store.listCycles(search, status),
      page = Math.max(1, +p || 1),
      pageSize = Math.min(100, Math.max(1, +ps || 25));
    return {
      data: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: all.length,
    };
  }
  @Post("cycles") @Roles("super_admin", "certificate_admin") async createCycle(
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    return {
      data: await this.store.createCycle(
        parse(cycleInputSchema, body),
        actor(req),
      ),
    };
  }
  @Get("cycles/:id") async getCycle(@Param("id") id: string) {
    const cycle = await this.store.getCycle(id);
    if (!cycle) throw new NotFoundException("Cycle not found");
    return { data: cycle };
  }
  @Patch("cycles/:id")
  @Roles("super_admin", "certificate_admin")
  async patchCycle(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    return { data: await this.store.patchCycle(id, body as any, actor(req)) };
  }
  @Post("cycles/:id/publish")
  @Roles("super_admin", "certificate_admin")
  async publish(@Param("id") id: string, @Req() req: AdminRequest) {
    return { data: await this.store.publish(id, actor(req)) };
  }
  @Post("cycles/:id/expire") @Roles("super_admin") async expire(
    @Param("id") id: string,
    @Req() req: AdminRequest,
  ) {
    return { data: await this.store.expire(id, actor(req)) };
  }
  @Post("cycles/:id/regenerate-slug") @Roles("super_admin") async slug(
    @Param("id") id: string,
    @Req() req: AdminRequest,
  ) {
    return { data: await this.store.regenerateSlug(id, actor(req)) };
  }
  @Delete("cycles/:id") @Roles("super_admin") async deleteCycle(
    @Param("id") id: string,
    @Req() req: AdminRequest,
  ) {
    const deleted = await this.store.deleteCycle(id, actor(req));
    if (!deleted) throw new NotFoundException("Cycle not found");
    return { data: { deleted } };
  }
  @Get("cycles/:id/qr") async qr(
    @Param("id") id: string,
    @Query("format") fmt = "svg",
    @Query("theme") theme = "light",
    @Res() res: Response,
  ) {
    const cycle = await this.store.getCycle(id);
    if (!cycle) throw new NotFoundException("Cycle not found");
    const format = ["svg", "png", "pdf"].includes(fmt) ? fmt : "svg",
      url = urlFor(cycle.publicSlug);
    const file =
      format === "pdf"
        ? await this.exports.qrPdf(url, theme === "dark")
        : await this.exports.qr(url, format as "svg" | "png", theme === "dark");
    res
      .type(
        format === "svg"
          ? "image/svg+xml"
          : format === "png"
            ? "image/png"
            : "application/pdf",
      )
      .setHeader(
        "Content-Disposition",
        `attachment; filename="cycle-${cycle.resultNumber}-qr.${format}"`,
      )
      .send(file);
  }
  @Get("cycles/:id/magazine-export") async magazine(
    @Param("id") id: string,
    @Query("format") fmt = "pdf",
    @Res() res: Response,
  ) {
    const cycle = await this.store.getCycle(id);
    if (!cycle) throw new NotFoundException("Cycle not found");
    const candidates = await this.store.listCandidates(id),
      format = fmt === "png" ? "png" : "pdf";
    const file = await this.exports.magazine(
      cycle,
      candidates,
      format,
      urlFor(cycle.publicSlug),
    );
    res
      .type(format === "png" ? "image/png" : "application/pdf")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="top-10-${cycle.resultNumber}.${format}"`,
      )
      .send(file);
  }
  @Get("cycles/:id/candidates") async candidates(@Param("id") id: string) {
    return { data: await this.store.listCandidates(id) };
  }
  @Get("cycles/:id/candidates/export") async exportCandidates(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const cycle = await this.store.getCycle(id);
    if (!cycle) throw new NotFoundException("Cycle not found");
    const candidates = await this.store.listCandidates(id);
    const file = await this.exports.candidatesExcel(cycle, candidates);
    res
      .type(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .setHeader(
        "Content-Disposition",
        `attachment; filename="candidates-${sanitizeFilename(cycle.resultNumber || cycle.title)}.xlsx"`,
      )
      .send(file);
  }
  @Post("cycles/:id/candidates")
  @Roles("super_admin", "certificate_admin")
  async addCandidate(@Param("id") id: string, @Body() body: unknown) {
    return {
      data: await this.store.createCandidate(
        id,
        parse(candidateInputSchema, body),
      ),
    };
  }
  @Patch("candidates/:id")
  @Roles("super_admin", "certificate_admin")
  async updateCandidate(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    const parsed = parse(candidateInputSchema.partial(), body);
    return { data: await this.store.updateCandidate(id, parsed, actor(req)) };
  }
  @Delete("candidates/:id")
  @Roles("super_admin", "certificate_admin")
  async deleteCandidate(@Param("id") id: string, @Req() req: AdminRequest) {
    return {
      data: { deleted: await this.store.deleteCandidate(id, actor(req)) },
    };
  }
  private validateRows(body: any) {
    const rows = Array.isArray(body?.rows) ? body.rows : [],
      errors: any[] = [];
    const parsed: CandidateInput[] = [];
    rows.forEach((row: any, index: number) => {
      const result = candidateInputSchema.safeParse(row);
      if (result.success) parsed.push(result.data);
      else
        errors.push({
          row: index + 2,
          issues: result.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
    });
    const ranks = parsed.map((r) => r.rank);
    for (const value of new Set(ranks))
      if (ranks.filter((x) => x === value).length > 1)
        errors.push({
          row: 0,
          issues: [{ field: "rank", message: `Duplicate rank: ${value}` }],
        });
    const phones = parsed.map((r) => r.phone);
    for (const value of new Set(phones))
      if (phones.filter((x) => x === value).length > 1)
        errors.push({
          row: 0,
          issues: [{ field: "phone", message: `Duplicate mobile number: ${value}` }],
        });
    return { parsed, errors };
  }
  @Post("cycles/:id/candidates/import/validate")
  @Roles("super_admin", "certificate_admin")
  async validateImport(@Body() body: unknown) {
    const { parsed, errors } = this.validateRows(body);
    return {
      data: {
        valid: errors.length === 0,
        rowCount: parsed.length,
        errors,
        rows: parsed,
      },
    };
  }
  @Post("cycles/:id/candidates/import/commit")
  @Roles("super_admin", "certificate_admin")
  async commitImport(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    const { parsed, errors } = this.validateRows(body);
    if (errors.length)
      throw new BadRequestException({
        code: "CSV_INVALID",
        message: "No rows were imported because validation failed.",
        details: errors,
      });
    const result = await this.store.importCandidates(id, parsed);
    await this.store.audit(
      actor(req),
      "candidates.imported",
      "result_cycle",
      id,
      { count: result.length },
    );
    return { data: { count: result.length } };
  }
  @Get("candidates/:id/certificate-preview") async candidatePreview(
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const candidate = await this.store.candidateById(id);
    if (!candidate) throw new NotFoundException("Candidate not found");
    const cycle = await this.store.getCycle(candidate.cycleId);
    if (!cycle) throw new NotFoundException("Cycle not found");
    res
      .type("application/pdf")
      .setHeader("Content-Disposition", 'inline; filename="admin-preview.pdf"')
      .send(await this.exports.certificate(cycle, candidate));
  }
  @Get("templates") async templates() {
    return { data: await this.store.listTemplates() };
  }
  @Post("templates") @Roles("super_admin") async template(
    @Body() body: any,
    @Req() req: AdminRequest,
  ) {
    return { data: await this.store.createTemplate(body, actor(req)) };
  }
  @Patch("templates/:id") @Roles("super_admin") async patchTemplate(
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return { data: await this.store.updateTemplate(id, body) };
  }
  @Get("settings") async settings() {
    return { data: await this.store.getSettings() };
  }
  @Patch("settings/certificate-availability")
  @Roles("super_admin")
  async setSettings(@Body() body: unknown, @Req() req: AdminRequest) {
    const { days } = parse(
      z.object({ days: z.coerce.number().int().min(1).max(365) }),
      body,
    );
    return { data: await this.store.setSettings(days, actor(req)) };
  }
  @Post("settings/apply-to-active-cycles")
  @Roles("super_admin")
  async applySettings(@Body() body: unknown, @Req() req: AdminRequest) {
    const { days } = parse(
      z.object({
        days: z.coerce.number().int().min(1).max(365),
        confirm: z.literal(true),
      }),
      body,
    );
    return { data: await this.store.applySettings(days, actor(req)) };
  }
  @Get("settings/apply-to-active-cycles/preview")
  @Roles("super_admin")
  async previewSettings(@Query("days") days: string) {
    return {
      data: await this.store.activeCyclePreview(
        z.coerce.number().int().min(1).max(365).parse(days),
      ),
    };
  }
  @Get("audit-logs") @Roles("super_admin") async audits() {
    return { data: await this.store.listAudits() };
  }
  @Get("cleanup-runs") @Roles("super_admin") async cleanup() {
    return { data: await this.store.listCleanups() };
  }
}

@ApiTags("Internal jobs")
@Public()
@Controller("internal/jobs")
export class InternalController {
  constructor(@Inject(Store) private readonly store: Store) {}
  @Post("purge-expired-certificates") async purge(
    @Headers("x-internal-job-secret") provided: string,
  ) {
    const expected =
      process.env.INTERNAL_JOB_SECRET ?? "development-internal-job-secret";
    if (
      !provided ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    return { data: await this.store.closeExpiredWindows() };
  }
}
