import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_DIR = path.resolve('data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'beo.db');

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    pass_hash     TEXT NOT NULL,
    sex           TEXT NOT NULL,
    dob           TEXT NOT NULL,
    email         TEXT NOT NULL,
    phone         TEXT NOT NULL,
    balance_mwk   REAL NOT NULL DEFAULT 0,
    signature_url TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id),
    date         TEXT NOT NULL,
    amount_mwk   REAL NOT NULL,
    channel      TEXT NOT NULL,
    purpose      TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    date          TEXT NOT NULL,
    location      TEXT NOT NULL,
    duration      TEXT NOT NULL,
    chairperson   TEXT NOT NULL,
    tag           TEXT NOT NULL,
    minutes       TEXT,
    cancelled     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    meeting_id  TEXT NOT NULL REFERENCES meetings(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (meeting_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS memos (
    id                TEXT PRIMARY KEY,
    author_id         TEXT NOT NULL REFERENCES users(id),
    to_field          TEXT NOT NULL,
    from_field        TEXT NOT NULL,
    date              TEXT NOT NULL,
    subject           TEXT NOT NULL,
    salute            TEXT NOT NULL,
    body              TEXT NOT NULL,
    total_recipients  INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS memo_reads (
    memo_id    TEXT NOT NULL REFERENCES memos(id),
    user_id    TEXT NOT NULL REFERENCES users(id),
    read_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (memo_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pdf_files (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id),
    type        TEXT NOT NULL,
    ref_id      TEXT NOT NULL,
    filename    TEXT NOT NULL,
    path        TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id),
    purpose      TEXT NOT NULL,
    amount_mwk   REAL NOT NULL,
    provider     TEXT NOT NULL,
    phone        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending',
    gateway_ref  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    actor_id    TEXT REFERENCES users(id),
    actor_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    details     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id          TEXT PRIMARY KEY,
    author_id   TEXT NOT NULL REFERENCES users(id),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'announcement',
    link_url    TEXT,
    link_label  TEXT,
    expires_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user
    ON transactions(user_id, date DESC);

  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_pdf_files_owner
    ON pdf_files(owner_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_payments_user
    ON payments(user_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_audit_created
    ON audit_log(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_announcements_created
    ON announcements(created_at DESC);
`);