const fs = require('node:fs');
const path = require('node:path');
const { database } = require('./config');

// Arquivo local: cliente nativo do SQLite. Turso: cliente "web", que fala só HTTP e não depende de
// binário nativo (é o que roda nas funções da Vercel).
const { createClient } = database.isFile ? require('@libsql/client') : require('@libsql/client/web');

const SCHEMA_VERSION = 1;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_info (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL
  );

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

  -- Contadores dos limites de tentativas (login, e-mails, links). Ficam no banco porque na Vercel
  -- cada instância da função tem a própria memória.
  CREATE TABLE IF NOT EXISTS rate_limits (
    key      TEXT PRIMARY KEY,
    count    INTEGER NOT NULL,
    reset_at INTEGER NOT NULL              -- fim da janela, em milissegundos (Date.now())
  );

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
`;

if (database.isFile) fs.mkdirSync(path.dirname(path.resolve(database.url.slice('file:'.length))), { recursive: true });
const client = createClient({ url: database.url, authToken: database.authToken });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Repete a operação enquanto o banco estiver ocupado por outra escrita (até ~3 s). */
async function whenFree(operation) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (err.code !== 'SQLITE_BUSY' || attempt >= 60) throw err;
      await wait(5 + Math.random() * 20 * Math.min(attempt, 5));
    }
  }
}

/** Consultas com parâmetros "?": get = 1ª linha, all = todas, value = 1ª coluna da 1ª linha, run = nº de linhas alteradas. */
function queries(executor) {
  // Dentro de uma transação a trava já é nossa; fora dela, uma escrita pode precisar esperar a vez.
  const execute = (sql, args) => (executor === client ? whenFree(() => client.execute({ sql, args })) : executor.execute({ sql, args }));
  return {
    get: async (sql, ...args) => (await execute(sql, args)).rows[0],
    all: async (sql, ...args) => (await execute(sql, args)).rows,
    value: async (sql, ...args) => {
      const row = (await execute(sql, args)).rows[0];
      return row === undefined ? undefined : Object.values(row)[0];
    },
    run: async (sql, ...args) => (await execute(sql, args)).rowsAffected,
  };
}

/** Cria as tabelas que faltam (idempotente: roda a cada início de instância). */
async function init() {
  if (database.isFile) await client.execute('PRAGMA journal_mode = WAL');
  await client.executeMultiple(SCHEMA);
  await client.execute({ sql: 'INSERT INTO schema_info (id, version) VALUES (1, ?) ON CONFLICT (id) DO NOTHING', args: [SCHEMA_VERSION] });
  const version = (await client.execute('SELECT version FROM schema_info')).rows[0].version;
  if (version !== SCHEMA_VERSION) throw new Error(`O banco é de outra versão do app (esquema ${version}; esperado ${SCHEMA_VERSION}).`);
}
const ready = init();
ready.catch(() => {}); // a falha é tratada por quem aguarda db.ready (app.js), sem "unhandled rejection"

/**
 * Transação de escrita: as outras escritas esperam o commit, então "verificar e depois alterar"
 * é seguro mesmo com requisições simultâneas.
 */
async function transaction(fn) {
  await ready;
  const tx = await whenFree(() => client.transaction('write'));
  try {
    const result = await fn(queries(tx));
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}

module.exports = { ...queries(client), transaction, ready, close: () => client.close() };
