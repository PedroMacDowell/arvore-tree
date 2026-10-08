// Testes de ponta a ponta da API: `npm test` (na raiz, que também compila o frontend).
// Cada suíte sobe o servidor em modo produção, com banco temporário e um servidor SMTP falso
// que captura os e-mails enviados, e faz requisições HTTP de verdade.
//   node test/run.js [game|security|account ...]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createClient } = require('@libsql/client');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

const BACKEND = path.resolve(__dirname, '..');
const SUITES = ['game', 'security', 'account'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

let passed = 0;
const check = (cond, message) => {
  assert.ok(cond, message);
  passed++;
  console.log('  ✓', message);
};

// ── SMTP falso: guarda tudo o que o app envia ──
const inbox = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  logger: false,
  onData(stream, _session, done) {
    simpleParser(stream).then(m => {
      inbox.push({ to: m.to.value.map(a => a.address.toLowerCase()), subject: m.subject, text: m.text, html: m.html, from: m.from.text, used: false });
      done();
    }, done);
  },
});

const mail = {
  /** Próximo e-mail ainda não lido para o endereço, com o assunto contendo `subject`. */
  async next(to, subject, timeout = 5000) {
    const address = to.trim().toLowerCase();
    for (const until = Date.now() + timeout; Date.now() < until; await wait(50)) {
      const m = inbox.find(x => !x.used && x.to.includes(address) && x.subject.includes(subject));
      if (m) {
        m.used = true;
        return m;
      }
    }
    throw new Error(`nenhum e-mail "${subject}" para ${address}`);
  },
  /** true se nenhum e-mail chegar para o endereço em `ms`. */
  async none(to, ms = 800) {
    await wait(ms);
    return !inbox.some(x => !x.used && x.to.includes(to.trim().toLowerCase()));
  },
  token: m => (m.text.match(/#token=([A-Za-z0-9_-]+)/) || [])[1],
};

/** Cliente HTTP com cookie próprio e IP próprio (X-Forwarded-For, como atrás do proxy da hospedagem). */
function makeClient(base) {
  let sequence = 1;
  return function client(ip = `198.51.100.${(sequence++ % 250) + 1}`) {
    let cookie = '';
    const call = async (method, url, body, headers = {}) => {
      const init = { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), 'X-Forwarded-For': ip, ...headers } };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await fetch(base + '/api' + url, init);
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data, headers: res.headers };
    };
    call.cookie = () => cookie;
    call.setCookie = value => (cookie = value);
    return call;
  };
}

/** Acesso direto ao banco do servidor de teste (para simular o passar dos dias, links vencidos etc.). */
function openDatabase(file) {
  const client = createClient({ url: `file:${file}` });
  // Servidor e teste usam o mesmo arquivo: se o servidor estiver gravando, espera a vez.
  const execute = async (sql, args) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await client.execute({ sql, args });
      } catch (err) {
        if (err.code !== 'SQLITE_BUSY' || attempt > 100) throw err;
        await wait(20);
      }
    }
  };
  return {
    get: async (sql, ...args) => (await execute(sql, args)).rows[0],
    all: async (sql, ...args) => (await execute(sql, args)).rows,
    value: async (sql, ...args) => {
      const row = (await execute(sql, args)).rows[0];
      return row === undefined ? undefined : Object.values(row)[0];
    },
    run: async (sql, ...args) => (await execute(sql, args)).rowsAffected,
    close: () => client.close(),
  };
}

async function registerAndConfirm(client, fields) {
  const r = await client('POST', '/auth/register', fields);
  assert.equal(r.status, 202, 'cadastro: ' + JSON.stringify(r.data));
  const m = await mail.next(fields.email, 'Confirme seu e-mail');
  const confirmed = await client('POST', '/auth/confirm-email', { token: mail.token(m) });
  assert.equal(confirmed.status, 200, 'confirmação: ' + JSON.stringify(confirmed.data));
  return confirmed.data;
}

async function startServer(tmp, smtpPort) {
  const port = await freePort();
  const dbPath = path.join(tmp, `${port}.db`);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND,
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(port), DATABASE_URL: `file:${dbPath}`, DATABASE_AUTH_TOKEN: '', APP_URL: `http://localhost:${port}`, TRUST_PROXY: '1',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_USER: '', MAIL_FROM: 'Árvore da Amazônia <nao-responda@arvore.test>',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => (log += d));
  child.stderr.on('data', d => (log += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return { base, dbPath, child, log: () => log };
    } catch {
      // ainda subindo
    }
    await wait(100);
  }
  child.kill();
  throw new Error('o servidor não subiu:\n' + log);
}

(async () => {
  const suites = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arvore-test-'));
  const smtpPort = await freePort();
  await new Promise(resolve => smtp.listen(smtpPort, '127.0.0.1', resolve));
  let failed = false;

  for (const name of suites) {
    let server;
    try {
      server = await startServer(tmp, smtpPort);
      console.log(`\n━━ ${name}`);
      const db = openDatabase(server.dbPath);
      await require(`./suite-${name}`)({ base: server.base, db, check, mail, client: makeClient(server.base), registerAndConfirm, wait });
      db.close();
    } catch (err) {
      failed = true;
      console.error(`  ✘ ${err.message}${server ? `\n--- log do servidor:\n${server.log()}` : ''}`);
    } finally {
      if (server && server.child.exitCode === null) {
        const exited = new Promise(resolve => server.child.once('exit', resolve));
        server.child.kill();
        await exited; // no Windows, o arquivo do banco só é liberado quando o processo termina
      }
    }
  }

  smtp.close();
  await wait(300);
  // Assíncrono de propósito: o cliente libsql solta o arquivo logo depois do close(), no event loop.
  await fs.promises.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log(failed ? `\n✘ Falhou (${passed} verificações passaram antes).` : `\n✔ ${passed} verificações passaram.`);
  process.exit(failed ? 1 : 0);
})();
