const prisma = require('../src/config/prisma');
const { hashPassword } = require('../src/modules/auth/auth.service');
const assetTemplates = require('../src/modules/templates/assetTemplates');
const logger = require('../src/utils/logger');
require('dotenv').config();

async function seed() {
  console.log('--- Seeding Database ---');

  // 1. Seed Admin User
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@college.edu').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const adminName = process.env.SEED_ADMIN_NAME || 'System Administrator';

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash: await hashPassword(adminPassword),
        role: 'ADMIN',
        designation: 'Chief Administrator',
        canCreateEvents: true,
        canRevoke: true,
        isActive: true,
      },
    });
    console.log(`Created default Admin user: ${adminEmail}`);
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  // 2. Seed Teacher User
  const teacherEmail = (process.env.SEED_TEACHER_EMAIL || 'teacher@college.edu').toLowerCase();
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD || 'Teacher@12345';

  let teacher = await prisma.user.findUnique({ where: { email: teacherEmail } });
  if (!teacher) {
    teacher = await prisma.user.create({
      data: {
        email: teacherEmail,
        name: 'Prof. Rajesh Sharma',
        passwordHash: await hashPassword(teacherPassword),
        role: 'TEACHER',
        designation: 'Assistant Professor, Computer Engineering',
        canCreateEvents: true,
        canRevoke: true,
        isActive: true,
      },
    });
    console.log(`Created default Teacher user: ${teacherEmail}`);
  } else {
    console.log(`Teacher user already exists: ${teacherEmail}`);
  }

  // 3. Seed the four supplied certificate PDF designs.
  let defaultTemplateId = null;
  const activeTemplateDefinitions = assetTemplates;
  for (const t of activeTemplateDefinitions) {
    const existing = await prisma.certificateTemplate.findUnique({ where: { key: t.key } });
    if (!existing) {
      const created = await prisma.certificateTemplate.create({
        data: {
          key: t.key,
          name: t.name,
          description: t.description,
          category: t.category,
          orientation: 'landscape',
          layout: t.layout,
          backgroundKey: t.backgroundKey,
          backgroundMimeType: t.backgroundMimeType,
          isActive: true,
          version: 1,
          createdById: admin.id,
        },
      });
      console.log(`Created template: ${t.key}`);
      if (!defaultTemplateId) defaultTemplateId = created.id;
    } else {
      if (t.key.startsWith('asset-') && JSON.stringify(existing.layout) !== JSON.stringify(t.layout)) {
        await prisma.certificateTemplate.update({
          where: { id: existing.id },
          data: {
            layout: t.layout,
            backgroundKey: t.backgroundKey,
            backgroundMimeType: t.backgroundMimeType,
            version: existing.version + 1,
          },
        });
      }
      if (!defaultTemplateId) defaultTemplateId = existing.id;
    }
  }

  // Keep historical template rows for existing certificate relations, but do
  // not expose obsolete designs for new issuance.
  await prisma.certificateTemplate.updateMany({
    where: { key: { notIn: activeTemplateDefinitions.map((t) => t.key) } },
    data: { isActive: false },
  });

  if (defaultTemplateId) {
    await prisma.event.updateMany({
      where: {
        defaultTemplateId: { not: defaultTemplateId },
      },
      data: { defaultTemplateId },
    });
  }

  // 4. Seed the 5 actual event records
  const targetEventDefs = [
    {
      name: 'GENESIS 2.0',
      description: 'Annual National Technical Symposium and Project Showcase',
      category: 'TECHNICAL_WORKSHOPS',
      certificateType: 'PARTICIPATION',
      eventDate: new Date('2026-02-15'),
      organizingBody: 'VESIT Technical Society',
      institutionName: 'VES Institute of Technology',
      signatoryName: 'Dr. (Mrs.) J. M. Nair',
      signatoryTitle: 'Principal',
      defaultTemplateId,
    },
    {
      name: 'BLOCKCHAIN WORKSHOP',
      description: 'Comprehensive Hands-on Workshop on Ethereum, Smart Contracts and Decentralized Architecture',
      category: 'TECHNICAL_WORKSHOPS',
      certificateType: 'COMPLETION',
      eventDate: new Date('2026-01-20'),
      organizingBody: 'Department of Computer Engineering',
      institutionName: 'VES Institute of Technology',
      signatoryName: 'Dr. (Mrs.) J. M. Nair',
      signatoryTitle: 'Principal',
      defaultTemplateId,
    },
    {
      name: 'AGENTIC AI SEMINAR',
      description: 'Advanced Research Seminar on Autonomous Agents and LLM Architectures',
      category: 'SEMINARS',
      certificateType: 'PARTICIPATION',
      eventDate: new Date('2026-02-28'),
      organizingBody: 'Department of Information Technology',
      institutionName: 'VES Institute of Technology',
      signatoryName: 'Dr. (Mrs.) J. M. Nair',
      signatoryTitle: 'Principal',
      defaultTemplateId,
    },
    {
      name: 'ENTREPRENEUR TALK',
      description: 'Interactive Leadership & Innovation Session with Tech Founders and Angel Investors',
      category: 'ENTREPRENEURSHIP',
      certificateType: 'PARTICIPATION',
      eventDate: new Date('2026-03-10'),
      organizingBody: 'VESIT E-Cell & IIC',
      institutionName: 'VES Institute of Technology',
      signatoryName: 'Dr. (Mrs.) J. M. Nair',
      signatoryTitle: 'Principal',
      defaultTemplateId,
    },
    {
      name: 'UTSAV 3.0',
      description: 'Annual Inter-Collegiate Cultural Festival & Talent Showcase',
      category: 'CULTURAL',
      certificateType: 'PARTICIPATION',
      eventDate: new Date('2026-03-25'),
      organizingBody: 'VESIT Cultural Council',
      institutionName: 'VES Institute of Technology',
      signatoryName: 'Dr. (Mrs.) J. M. Nair',
      signatoryTitle: 'Principal',
      defaultTemplateId,
    },
  ];

  for (const evDef of targetEventDefs) {
    const existing = await prisma.event.findFirst({ where: { name: evDef.name } });
    if (!existing) {
      await prisma.event.create({
        data: {
          ...evDef,
          createdById: admin.id,
          issuerId: admin.id,
        },
      });
      console.log(`Seeded event: ${evDef.name}`);
    }
  }

  console.log('\n--- Seeding Complete ---');
  console.log(`Admin Login:   ${adminEmail} / ${adminPassword}`);
  console.log(`Teacher Login: ${teacherEmail} / ${teacherPassword}`);
}

seed()
  .catch((err) => {
    console.error('Seed script error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
