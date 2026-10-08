const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { dbPath: file } = require('./config');

const SCHEMA_VERSION = 1;

fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const hasTables = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table'").get();
if (hasTables && db.pragma('user_version', { simple: true }) !== SCHEMA_VERSION) {
  throw new Error(`O banco ${file} foi criado por uma versão antiga do app. Mova o arquivo e reinicie para criar um novo.`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY,
    username          TEXT NOT NULL UNIQUE COLLATE NOCASE, -- "Ana" e "ana" são o mesmo nome
    email             TEXT NOT NULL UNIQUE,
    password          TEXT NOT NULL,       -- hash bcrypt, nunca a senha
    referral_code     TEXT NOT NULL UNIQUE,
    referred_by       TEXT REFERENCES users(id),
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),

    -- Inventário
    seeds             INTEGER NOT NULL DEFAULT 1,
    coins             INTEGER NOT NULL DEFAULT 10,
    fertilizer        INTEGER NOT NULL DEFAULT 0,
    insect_protection INTEGER NOT NULL DEFAULT 0,

    -- Árvore atual (datas no formato AAAA-MM-DD, fuso de São Paulo)
    tree_name         TEXT NOT NULL DEFAULT 'Sumaúma Sagrada',
    tree_cycle        INTEGER NOT NULL DEFAULT 0,
    planted_at        TEXT,
    growth_days       INTEGER NOT NULL DEFAULT 0,
    last_growth_date  TEXT,
    tree_stage        INTEGER NOT NULL DEFAULT 0,
    highest_stage     INTEGER NOT NULL DEFAULT 0,
    soil              INTEGER NOT NULL DEFAULT 60,
    pests             INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,         -- SHA-256 do token do cookie
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  -- Cadastros aguardando a confirmação do e-mail. A conta só é criada em users quando o link é aberto.
  CREATE TABLE IF NOT EXISTS pending_registrations (
    email       TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    password    TEXT NOT NULL,             -- hash bcrypt
    referred_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    token_hash  TEXT NOT NULL UNIQUE,      -- SHA-256 do token do link
    expires_at  TEXT NOT NULL
  );

  -- Pedidos de redefinição de senha (link de uso único).
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,           -- SHA-256 do token do link
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS password_resets_user ON password_resets(user_id);

  CREATE TABLE IF NOT EXISTS mission_completions (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_key  TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, mission_key)
  );

  CREATE TABLE IF NOT EXISTS reward_claims (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_key TEXT NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, reward_key)
  );

  -- Árvores que completaram os dias de cuidado
  CREATE TABLE IF NOT EXISTS forest_trees (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cycle        INTEGER NOT NULL,
    name         TEXT NOT NULL,
    planted_at   TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, cycle)
  );
`);
db.pragma(`user_version = ${SCHEMA_VERSION}`);

module.exports = db;
