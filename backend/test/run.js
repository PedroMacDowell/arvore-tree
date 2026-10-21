const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { MongoClient } = require('mongodb');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const BACKEND = path.resolve(__dirname, '..');
const SUITES = ['game', 'security', 'account'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
let passed = 0;
const check = (cond, message) => { assert.ok(cond, message); passed++; console.log('  ✓', message); };
const inbox = [];
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
  onData(stream, _session, done) {
    simpleParser(stream).then(m => { inbox.push({ to: m.to.value.map(a => a.address.toLowerCase()), subject: m.subject, text: m.text, html: m.html, from: m.from.text, used: false }); done(); }, done);
  },
});
const mail = {
  async next(to, subject, timeout = 5000) {
    const address = to.trim().toLowerCase();
    for (const until = Date.now() + timeout; Date.now() < until; await wait(50)) {
      const m = inbox.find(x => !x.used && x.to.includes(address) && x.subject.includes(subject));
      if (m) { m.used = true; return m; }
    }
    throw new Error('nenhum e-mail ' + subject + ' para ' + address);
  },
  async none(to, ms = 800) { await wait(ms); return !inbox.some(x => !x.used && x.to.includes(to.trim().toLowerCase())); },
  token: m => (m.text.match(/#token=([A-Za-z0-9_-]+)/) || [])[1],
};
function makeClient(base) {
  let sequence = 1;
  return function client(ip = '198.51.100.' + ((sequence++ % 250) + 1)) {
    let cookie = '';
    const call = async (method, url, body, headers = {}) => {
      const init = { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), 'X-Forwarded-For': ip, ...headers } };
      if (body !== undefined) init.body = JSON.stringify(body);
      const res = await fetch(base + '/api' + url, init);
      const setCookie = res.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
      const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      return { status: res.status, data, headers: res.headers };
    };
    call.cookie = () => cookie; call.setCookie = value => (cookie = value); return call;
  };
}
async function openDatabase(name) {
  const client = new MongoClient('mongodb://127.0.0.1:27017'); await client.connect();
  const database = client.db(name);
  return {
    sessionByTokenHash: token_hash => database.collection('sessions').findOne({ token_hash }),
    userByEmail: email => database.collection('users').findOne({ email }),
    pendingByEmail: email => database.collection('pending_registrations').findOne({ email }),
    collectionDump: name => database.collection(name).find({}).toArray(),
    resetCount: () => database.collection('password_resets').countDocuments(),
    coins: async userId => (await database.collection('users').findOne({ id: userId }))?.coins,
    expireSession: token_hash => database.collection('sessions').updateOne({ token_hash }, { $set: { expires_at: new Date(Date.now() - 60000) } }),
    expirePasswordResets: () => database.collection('password_resets').updateMany({}, { $set: { expires_at: new Date(Date.now() - 60000) } }),
    expirePending: email => database.collection('pending_registrations').updateOne({ email }, { $set: { expires_at: new Date(Date.now() - 60000) } }),
    setLastGrowthDate: userId => database.collection('users').updateOne({ id: userId }, { $set: { last_growth_date: '2000-01-01' } }),
    close: () => client.close(),
    drop: () => database.dropDatabase(),
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
async function startServer(databaseName, smtpPort) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), MONGODB_URI: 'mongodb://127.0.0.1:27017', MONGODB_DATABASE: databaseName, APP_URL: 'http://localhost:' + port, TRUST_PROXY: '1', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_USER: '', MAIL_FROM: 'Árvore da Amazônia <nao-responda@arvore.test>' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; child.stdout.on('data', d => (log += d)); child.stderr.on('data', d => (log += d));
  const base = 'http://localhost:' + port;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) return { base, child, log: () => log }; } catch {}
    await wait(100);
  }
  child.kill(); throw new Error('o servidor não subiu:\n' + log);
}
(async () => {
  const suites = process.argv.slice(2).length ? process.argv.slice(2) : SUITES;
  const smtpPort = await freePort(); await new Promise(resolve => smtp.listen(smtpPort, '127.0.0.1', resolve));
  let failed = false;
  for (const name of suites) {
    let server, db;
    const databaseName = 'arvore_test_' + name + '_' + Date.now();
    try {
      server = await startServer(databaseName, smtpPort);
      console.log('\n── ' + name);
      db = await openDatabase(databaseName);
      await require('./suite-' + name)({ base: server.base, db, check, mail, client: makeClient(server.base), registerAndConfirm, wait });
    } catch (err) {
      failed = true; console.error('  ✘ ' + err.message + (server ? '\n--- log do servidor:\n' + server.log() : ''));
    } finally {
      if (server && server.child.exitCode === null) {
        const exited = new Promise(resolve => server.child.once('exit', resolve)); server.child.kill(); await exited;
      }
      if (db) await db.close();
      const cleanup = new MongoClient('mongodb://127.0.0.1:27017');
      await cleanup.connect(); await cleanup.db(databaseName).dropDatabase(); await cleanup.close();
    }
  }
  smtp.close(); await wait(300);
  console.log(failed ? '\n✘ Falhou (' + passed + ' verificações passaram antes).' : '\n✔ ' + passed + ' verificações passaram.');
  process.exit(failed ? 1 : 0);
})();
