import bcrypt from 'bcrypt';
import { db } from './client.js';

const users = [
  { id: 'USR-101', name: 'CHRISTOPHER SODA', role: 'ceo',       pass: '123456', sex: 'Male',   dob: '1988-04-12', email: 'ceo@beo.org',       phone: '+265991000001', balance: 150 },
  { id: 'USR-102', name: 'LUCAS MASHONGA',   role: 'manager',   pass: '123456', sex: 'Male',   dob: '1991-08-22', email: 'manager@beo.org',   phone: '+265991000002', balance: 0 },
  { id: 'USR-103', name: 'FANUEL SODA',      role: 'secretary', pass: '123456', sex: 'Male',   dob: '1993-11-05', email: 'secretary@beo.org', phone: '+265991000003', balance: -50 },
  { id: 'USR-104', name: 'MISHECK NZONDO',   role: 'treasurer', pass: '123456', sex: 'Male',   dob: '1990-02-14', email: 'treasurer@beo.org', phone: '+265991000004', balance: 0 },
  { id: 'USR-105', name: 'SAMUEL CHAULUKA',  role: 'ict',       pass: '123456', sex: 'Male',   dob: '1995-06-30', email: 'ict@beo.org',       phone: '+265991000005', balance: 0 },
  { id: 'USR-200', name: 'LETTUS RAPKEN',    role: 'member',    pass: '123456', sex: 'Male',   dob: '1997-09-18', email: 'member@beo.org',    phone: '+265991000006', balance: 0 },
];

const existing = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
if (existing.c > 0) {
  console.log('⚠️  Database already seeded. Skipping.');
  console.log('   Delete data/beo.db and re-run to reset.');
  process.exit(0);
}

// ---------- Prepared statements ----------
const insertUser = db.prepare(`
  INSERT INTO users (id, name, role, pass_hash, sex, dob, email, phone, balance_mwk)
  VALUES (@id, @name, @role, @pass_hash, @sex, @dob, @email, @phone, @balance)
`);

const insertMeeting = db.prepare(`
  INSERT INTO meetings (id, title, date, location, duration, chairperson, tag)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertTxn = db.prepare(`
  INSERT INTO transactions (id, user_id, date, amount_mwk, channel, purpose)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertNotif = db.prepare(`
  INSERT INTO notifications (id, user_id, title, body, read)
  VALUES (?, ?, ?, ?, ?)
`);

const insertAnnouncement = db.prepare(`
  INSERT INTO announcements (id, author_id, title, body, type)
  VALUES (?, ?, ?, ?, ?)
`);

// ---------- Transaction: everything in order ----------
const tx = db.transaction(() => {
  // 1. USERS first — everything else references them
  for (const u of users) {
    const hash = bcrypt.hashSync(u.pass, 10);
    insertUser.run({
      id: u.id,
      name: u.name,
      role: u.role,
      pass_hash: hash,
      sex: u.sex,
      dob: u.dob,
      email: u.email,
      phone: u.phone,
      balance: u.balance,
    });
  }

  // 2. MEETINGS (no user FK)
  insertMeeting.run(
    'MTG-001',
    'Q3 Strategic Planning Session',
    '2026-09-25T10:00:00',
    'Conference Room A & Virtual',
    '2 Hours',
    'Alex Johnson (CEO)',
    'Official Meeting',
  );
  insertMeeting.run(
    'MTG-002',
    'Finance Review Committee',
    '2026-10-05T14:00:00',
    'Virtual Only',
    '1.5 Hours',
    'Grace Lee (Treasurer)',
    'Committee',
  );

  // 3. TRANSACTIONS (FK → users)
  insertTxn.run('TXN-9081', 'USR-101', '2026-08-01', 5000, 'Airtel Money', 'Membership');
  insertTxn.run('TXN-9075', 'USR-101', '2026-07-15', 3000, 'TNM Mpamba',   'Membership');
  insertTxn.run('TXN-9050', 'USR-101', '2026-06-02', 2500, 'PayChangu',    'Tech Support');

  // 4. NOTIFICATIONS (FK → users)
  insertNotif.run('NTF-1', 'USR-101', '🎉 New Appointment', 'Grace Lee elevated to Financial Director.', 0);
  insertNotif.run('NTF-2', 'USR-101', '📅 Meeting Reminder', 'Q3 Strategic Planning in 5 days.', 0);
  insertNotif.run('NTF-3', 'USR-101', '💰 Payment Received', 'TXN-9081 confirmed via Airtel Money.', 1);
  insertNotif.run('NTF-4', 'USR-102', 'Welcome to BEO MIS', 'Your account is ready.', 0);

  // 5. ANNOUNCEMENTS (FK → users) — must run AFTER users are inserted
  insertAnnouncement.run(
    'ANN-1',
    'USR-101',
    'Welcome to the BEO MIS Platform',
    'This workspace replaces our manual paperwork. Use it for payments, memos, meetings, and staying informed.',
    'announcement',
  );

  insertAnnouncement.run(
    'ANN-2',
    'USR-101',
    'Q3 Strategic Planning Session',
    'Mark your calendars — the Q3 planning meeting is scheduled. Please confirm your attendance in the Meetings module.',
    'meeting',
  );
});

tx();

console.log(`✅ Seeded ${users.length} users, 3 transactions, 2 meetings, 2 announcements, 4 notifications.`);
console.log('   Login: USR-101 / 123456');