/* Seed script for Med-Tracker dev database. */
import { prisma } from './client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const drugsDir = join(__dirname, '..', '..', '..', 'content', 'drugs');

async function main() {
  console.log('Seeding Med-Tracker dev database...');
  const drugFiles = readdirSync(drugsDir).filter((f) => f.endsWith('.json')).slice(0, 5);
  const drugs = drugFiles.map((f) => JSON.parse(readFileSync(join(drugsDir, f), 'utf8')));

  const passwordHash = crypto.createHash('sha256').update('demo-password-1').digest('hex');
  const user = await prisma.user.upsert({
    where: { email: 'demo@med-tracker.dev' },
    update: {},
    create: {
      email: 'demo@med-tracker.dev',
      passwordHash,
      displayName: 'Demo Patient',
      timezone: 'America/Los_Angeles',
      preferences: { create: {} },
    },
  });

  for (const d of drugs) {
    await prisma.medication.create({
      data: {
        userId: user.id,
        drugId: d.id,
        name: d.brand,
        strength: d.dosages[0] ?? '1 unit',
        form: 'tablet',
        startDate: new Date(),
        supplyRemaining: 28,
        schedules: {
          create: [
            {
              kind: 'daily',
              times: JSON.stringify(['08:00', '20:00']),
              startsAt: new Date(),
            },
          ],
        },
      },
    });
  }
  console.log('Seed complete. Demo user demo@med-tracker.dev, password demo-password-1');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
