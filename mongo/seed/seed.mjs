import { MongoClient } from 'mongodb';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const required = ['MONGODB_URI', 'INITIAL_ADMIN_EMAIL', 'INITIAL_ADMIN_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

await db.collection('result_cycles').createIndex({ publicSlug: 1 }, { unique: true });
await db.collection('result_cycles').createIndex({ status: 1, expiresAt: 1 });
await db.collection('candidates').createIndex({ cycleId: 1 });
await db.collection('candidates').createIndex({ cycleId: 1, participantId: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, rank: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, certificateNumber: 1 }, { unique: true });
await db.collection('candidates').createIndex({ cycleId: 1, phone: 1 }, { unique: true });
await db.collection('candidates').createIndex({ publicCertificateId: 1 }, { unique: true });
await db.collection('claim_sessions').createIndex({ tokenHash: 1 }, { unique: true });
await db.collection('claim_sessions').createIndex({ candidateId: 1 });
await db.collection('certificate_download_events').createIndex({ candidateId: 1 });
await db.collection('audit_logs').createIndex({ createdAt: -1 });
await db.collection('cleanup_runs').createIndex({ startedAt: -1 });
await db.collection('admin_profiles').createIndex({ email: 1 }, { unique: true });
console.log('Indexes ensured.');

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
  console.log('Registered the approved certificate template.');
} else {
  console.log('Certificate template already registered.');
}

await db.collection('app_settings').updateOne(
  { _id: 'certificate_availability' },
  { $setOnInsert: { value: { days: 30 }, changedBy: admin._id, updatedAt: now } },
  { upsert: true },
);
console.log('Default certificate-availability setting ensured (30 days).');

console.log('Bootstrap complete. No cycles or candidates were created; add real result cycles from the admin app.');
await client.close();
