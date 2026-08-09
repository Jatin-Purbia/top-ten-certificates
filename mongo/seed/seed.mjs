import { MongoClient } from 'mongodb';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';

const required = ['MONGODB_URI', 'INITIAL_ADMIN_EMAIL', 'INITIAL_ADMIN_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

await db.collection('result_cycles').createIndex({ publicSlug: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, participantId: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, rank: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, certificateNumber: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, phone: 1 }, { unique: true });
await db.collection('candidates').createIndex({ publicCertificateId: 1 }, { unique: true });
await db.collection('admin_profiles').createIndex({ email: 1 }, { unique: true });

const now = new Date().toISOString();
const adminEmail = process.env.INITIAL_ADMIN_EMAIL.toLowerCase();
let admin = await db.collection('admin_profiles').findOne({ email: adminEmail });
if (!admin) {
  const adminId = randomUUID();
  admin = {
    _id: adminId,
    id: adminId,
    email: adminEmail,
    displayName: 'Initial Super Admin',
    role: 'super_admin',
    active: true,
    passwordHash: await argon2.hash(process.env.INITIAL_ADMIN_PASSWORD, { type: argon2.argon2id }),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('admin_profiles').insertOne(admin);
  console.log(`Created administrator ${adminEmail}`);
} else {
  console.log(`Administrator ${adminEmail} already exists`);
}

let template = await db.collection('certificate_templates').findOne({ name: 'Approved Pathye Kan Certificate' });
if (!template) {
  const templateId = randomUUID();
  template = {
    _id: templateId,
    id: templateId,
    name: 'Approved Pathye Kan Certificate',
    storagePath: 'certificate-demo.jpeg',
    approved: true,
    active: true,
    fieldConfig: {},
    createdBy: admin._id,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection('certificate_templates').insertOne(template);
}

await db.collection('app_settings').updateOne(
  { _id: 'certificate_availability' },
  { $setOnInsert: { value: { days: 30 }, changedBy: admin._id, updatedAt: now } },
  { upsert: true },
);

const day = 86_400_000;
const makeCycle = (status, offset, resultNumber) => {
  const publication = new Date(Date.now() + offset * day);
  const created = new Date().toISOString();
  const cycleId = randomUUID();
  return {
    _id: cycleId,
    id: cycleId,
    publicSlug: randomBytes(18).toString('hex'),
    title: 'बाल प्रश्नोत्तरी',
    resultNumber,
    issueNumber: `PK-${resultNumber}`,
    displayStartAt: publication.toISOString(),
    displayEndAt: new Date(publication.getTime() + 15 * day).toISOString(),
    publicationAt: publication.toISOString(),
    expiresAt: new Date(publication.getTime() + 30 * day).toISOString(),
    downloadWindowDays: 30,
    status,
    certificateTemplateId: template._id,
    candidateCount: 0,
    downloadCount: 0,
    createdBy: admin._id,
    createdAt: created,
    updatedAt: created,
    publishedAt: status === 'published' ? created : null,
    purgedAt: null,
  };
};
const cycles = [makeCycle('draft', 15, '202'), makeCycle('published', -2, '201'), makeCycle('expired', -40, '200')];
cycles[2].expiresAt = new Date(Date.now() - 10 * day).toISOString();
for (const cycle of cycles) {
  await db.collection('result_cycles').updateOne({ publicSlug: cycle.publicSlug }, { $setOnInsert: cycle }, { upsert: true });
}

const hindi = ['अनया जोशी', 'विवान मेहता', 'सान्वी राव', 'आरव बंसल', 'काव्या अय्यर', 'ईशान सेठी', 'मीरा नायर', 'अद्विक शाह', 'तारा कपूर', 'कबीर वर्मा'];
const english = ['Anaya Joshi', 'Vivaan Mehta', 'Saanvi Rao', 'Aarav Bansal', 'Kavya Iyer', 'Ishaan Sethi', 'Meera Nair', 'Advik Shah', 'Tara Kapoor', 'Kabir Verma'];
const published = cycles[1];
for (let i = 0; i < 10; i++) {
  const candidateId = randomUUID();
  const candidate = {
    _id: candidateId,
    id: candidateId,
    cycleId: published.id,
    participantId: `SEED-${String(i + 1).padStart(3, '0')}`,
    certificateNumber: `PK201-${String(i + 1).padStart(3, '0')}`,
    phone: `9${String(700000000 + i).padStart(9, '0')}`,
    publicCertificateId: randomUUID(),
    nameHindi: hindi[i],
    nameEnglish: english[i],
    guardianName: 'Demo Guardian',
    className: String(5 + (i % 3)),
    age: 10 + (i % 3),
    city: ['जयपुर', 'अजमेर', 'कोटा', 'जोधपुर', 'उदयपुर'][i % 5],
    score: 100 - i,
    rank: i + 1,
    resultDate: published.publicationAt.slice(0, 10),
    photoPath: null,
    downloadCount: 0,
    firstDownloadedAt: null,
    lastDownloadedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('candidates').updateOne(
    { cycleId: published.id, participantId: candidate.participantId },
    { $setOnInsert: candidate },
    { upsert: true },
  );
  if (result.upsertedCount) console.log(`${candidate.participantId}: phone ${candidate.phone}`);
}

console.log('Seed complete. Certificates are looked up by the phone numbers printed above; for local testing only.');
await client.close();
