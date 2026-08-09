import { z } from 'zod';

export const cycleStatuses = ['draft', 'scheduled', 'published', 'expired', 'purged'] as const;
export type CycleStatus = (typeof cycleStatuses)[number];
export const adminRoles = ['super_admin', 'certificate_admin', 'viewer'] as const;
export type AdminRole = (typeof adminRoles)[number];

export const cycleSchema = z.object({
  id: z.string().uuid(), publicSlug: z.string(), title: z.string(), resultNumber: z.string(),
  issueNumber: z.string(), displayStartAt: z.string(), displayEndAt: z.string(), publicationAt: z.string(),
  expiresAt: z.string(), downloadWindowDays: z.number().int().min(1).max(365), status: z.enum(cycleStatuses),
  certificateTemplateId: z.string().uuid().nullable(), candidateCount: z.number().int().default(0),
  downloadCount: z.number().int().default(0), createdAt: z.string(), updatedAt: z.string(),
  publishedAt: z.string().nullable(), purgedAt: z.string().nullable()
});
export type ResultCycle = z.infer<typeof cycleSchema>;

export const phoneSchema = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');

export const candidateInputSchema = z.object({
  participantId: z.string().trim().min(3).max(64), certificateNumber: z.string().trim().min(3).max(64),
  phone: phoneSchema,
  nameHindi: z.string().trim().max(120).optional(), nameEnglish: z.string().trim().min(1).max(120),
  guardianName: z.string().trim().min(1).max(120), className: z.string().trim().min(1).max(24),
  age: z.number().int().min(3).max(25), city: z.string().trim().min(1).max(100),
  score: z.number().min(0), rank: z.number().int().min(1).max(10),
  resultDate: z.string().date(), photoPath: z.string().nullable().optional()
});
export type CandidateInput = z.infer<typeof candidateInputSchema>;
export type Candidate = CandidateInput & { id: string; cycleId: string; publicCertificateId: string; downloadCount: number; firstDownloadedAt: string | null; lastDownloadedAt: string | null; createdAt: string; updatedAt: string };

export const cycleInputSchema = z.object({
  title: z.string().trim().min(3).max(160), resultNumber: z.string().trim().max(40).optional(),
  issueNumber: z.string().trim().max(40).optional(), publicationAt: z.string().datetime(),
  certificateTemplateId: z.string().uuid().nullable().optional(), status: z.enum(['draft', 'scheduled']).optional()
});
export type CycleInput = z.infer<typeof cycleInputSchema>;

export const claimSchema = z.object({ phone: phoneSchema, cycleSlug: z.string().min(8).max(80) });
export type ClaimInput = z.infer<typeof claimSchema>;

export type ApiError = { error: { code: string; message: string; requestId?: string; details?: unknown } };
export type Paginated<T> = { data: T[]; page: number; pageSize: number; total: number };
