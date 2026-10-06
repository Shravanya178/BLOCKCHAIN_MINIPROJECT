const prisma = require('../src/config/prisma');
const { hashPassword } = require('../src/modules/auth/auth.service');
const defaultTemplates = require('../src/modules/templates/defaultTemplates');
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

  // 3. Seed Default Canva-compatible Starter Templates
  let defaultTemplateId = null;
  for (const t of defaultTemplates) {
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
          isActive: true,
          version: 1,
          createdById: admin.id,
        },
      });
      console.log(`Created template: ${t.key}`);
      if (!defaultTemplateId) defaultTemplateId = created.id;
    } else {
      if (!defaultTemplateId) defaultTemplateId = existing.id;
    }
  }

  // 4. Seed Demo College Event
  const eventName = 'HackVenture 2026 - Annual Hackathon';
  let demoEvent = await prisma.event.findFirst({ where: { name: eventName } });
  if (!demoEvent) {
    demoEvent = await prisma.event.create({
      data: {
        name: eventName,
        description: '36-hour National Level Hackathon celebrating innovation and code.',
        eventDate: new Date('2026-03-15T00:00:00.000Z'),
        endDate: new Date('2026-03-16T00:00:00.000Z'),
        venue: 'College Convention Centre & Tech Labs',
        organizingBody: 'Department of Computer Engineering & ACM Student Chapter',
        institutionName: process.env.INSTITUTION_NAME || 'Institute of Engineering and Technology',
        signatoryName: 'Dr. Ramesh Kulkarni',
        signatoryTitle: 'Principal & Event Patron',
        status: 'ACTIVE',
        createdById: teacher.id,
        issuerId: teacher.id,
        defaultTemplateId: defaultTemplateId,
      },
    });
    console.log(`Created demo Event: "${eventName}" (${demoEvent.id})`);
  } else {
    console.log(`Demo event already exists: "${eventName}"`);
  }

  console.log('\n--- Seeding Complete ---');
  console.log(`Admin Login:   ${adminEmail} / ${adminPassword}`);
  console.log(`Teacher Login: ${teacherEmail} / ${teacherPassword}`);
  console.log(`Demo Event ID: ${demoEvent.id}`);
}

seed()
  .catch((err) => {
    console.error('Seed script error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
