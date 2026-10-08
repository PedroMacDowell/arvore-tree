// Ataques contra o servidor em modo produção: sessão, CSRF, força bruta, entradas maliciosas, arquivos, cabeçalhos.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sha = t => createHash('sha256').update(t).digest('base64url');

module.exports = async ({ base, db, check, mail }) => {
  const id = Date.now().toString(36);
  const email = `seg${id}@exemplo.com`;

  async function call(method, url, { body, cookie, headers = {}, raw } = {}) {
    const payload = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
    const init = { method, headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers } };
    if (payload) init.body = payload;
    const res = await fetch(base + url, init);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, headers: res.headers, data };
  }
  const cookieOf = r => r.headers.get('set-cookie');
  /** Cadastro completo (com o link do e-mail); devolve a resposta da confirmação. */
  async function signUp(fields) {
    const r = await call('POST', '/api/auth/register', { body: fields });
    if (r.status !== 202) return r;
    const m = await mail.next(fields.email, 'Confirme seu e-mail');
    return call('POST', '/api/auth/confirm-email', { body: { token: mail.token(m) } });
  }

  console.log(' Cabeçalhos e fontes');
  // Na Vercel as páginas estáticas não passam pelo Express: o vercel.json precisa repetir os mesmos cabeçalhos.
  const { SECURITY_HEADERS, HSTS } = require('../middleware/security');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
  const staticHeaders = Object.fromEntries(vercel.headers.find(h => h.source === '/(.*)').headers.map(h => [h.key, h.value]));
  check(JSON.stringify(staticHeaders) === JSON.stringify({ ...SECURITY_HEADERS, 'Strict-Transport-Security': HSTS }),
    'vercel.json aplica às páginas os mesmos cabeçalhos de segurança da API');
  for (const url of ['/', '/api/health']) {
    const h = (await call('GET', url)).headers;
    const csp = h.get('content-security-policy') || '';
    check(csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("style-src 'self';") && csp.includes("font-src 'self';"), `${url}: CSP restrita ao próprio site`);
    check(!csp.includes('google'), `${url}: CSP sem domínios do Google`);
    check(h.get('x-frame-options') === 'DENY' && h.get('x-content-type-options') === 'nosniff', `${url}: anti-clickjacking e nosniff`);
    check(h.get('strict-transport-security')?.startsWith('max-age=31536000'), `${url}: HSTS em produção`);
    check(!h.get('x-powered-by'), `${url}: não revela Express`);
  }
  check((await call('GET', '/api/health')).headers.get('cache-control') === 'no-store', 'API com Cache-Control: no-store');
  if (fs.existsSync(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'))) {
    const html = (await call('GET', '/')).data;
    check(!/googleapis|gstatic/.test(html), 'página não chama o Google Fonts');
    const css = (await call('GET', html.match(/href="(\/assets\/[^"]+\.css)"/)[1])).data;
    check(/font-family:\s*['"]?Fraunces Variable/.test(css) && /url\(\/assets\/fraunces-latin-opsz-normal-[\w-]+\.woff2\)/.test(css) && !css.includes('data:font'),
      'fontes servidas pelo próprio site como arquivos (/assets/*.woff2)');
  } else {
    console.log('  – frontend sem build (npm run build): verificações de HTML e fontes puladas');
  }

  console.log(' Cookie e token de sessão');
  let r = await call('POST', '/api/auth/register', { body: { username: 'Seg ' + id, email, password: 'senha-forte-1' } });
  check(r.status === 202 && !cookieOf(r), 'cadastro não abre sessão antes de confirmar o e-mail');
  const confirmMail = await mail.next(email, 'Confirme seu e-mail');
  r = await call('POST', '/api/auth/confirm-email', { body: { token: mail.token(confirmMail) } });
  const setCookie = cookieOf(r);
  check(r.status === 200 && setCookie.startsWith('__Host-session='), 'confirmação abre sessão com cookie __Host-');
  check(/HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /Path=\//.test(setCookie) && !/Domain=/i.test(setCookie), 'cookie HttpOnly, Secure, SameSite=Strict, Path=/ e sem Domain');
  const cookie = setCookie.split(';')[0];
  const token = cookie.split('=')[1];
  check(token.length >= 43, 'token com 256 bits');
  check(await db.get('SELECT 1 FROM sessions WHERE token_hash = ?', sha(token)), 'banco guarda o SHA-256 do token');
  const dump = (await Promise.all(['sessions', 'users', 'pending_registrations', 'password_resets'].map(async t => JSON.stringify(await db.all(`SELECT * FROM ${t}`))))).join();
  check(!dump.includes(token) && !dump.includes(mail.token(confirmMail)), 'nenhum token (sessão ou link) aparece no banco');
  check((await call('GET', '/api/auth/me', { cookie: `__Host-session=${sha(token)}` })).status === 401, 'hash roubado do banco não abre a sessão');
  const user = await db.get('SELECT password FROM users WHERE email = ?', email);
  check(/^\$2[aby]\$11\$/.test(user.password) && !dump.includes('senha-forte-1'), 'senha guardada só como bcrypt (custo 11)');
  check((await call('GET', '/api/auth/me', { cookie })).status === 200, 'sessão válida funciona');

  console.log(' Sessão adulterada, expirada e após logout');
  check((await call('GET', '/api/auth/me', { cookie: '__Host-session=' + 'A'.repeat(43) })).status === 401, 'token inventado → 401');
  check((await call('GET', '/api/auth/me', { cookie: '__Host-session=j%3A%7B%22a%22%3A1%7D' })).status === 401, 'cookie em formato JSON (j:{…}) → 401, sem erro 500');
  check((await call('POST', '/api/auth/logout', { cookie: '__Host-session=j%3A%7B%22a%22%3A1%7D' })).status === 204, 'logout com cookie adulterado não quebra');
  r = await call('POST', '/api/auth/login', { body: { email, password: 'senha-forte-1' } });
  const cookie2 = cookieOf(r).split(';')[0];
  check(cookie2 !== cookie, 'cada login gera um token novo');
  await db.run("UPDATE sessions SET expires_at = datetime('now', '-1 minute') WHERE token_hash = ?", sha(cookie2.split('=')[1]));
  check((await call('GET', '/api/auth/me', { cookie: cookie2 })).status === 401, 'sessão expirada → 401');
  await call('POST', '/api/auth/logout', { cookie });
  check((await call('GET', '/api/auth/me', { cookie })).status === 401, 'token antigo não funciona após logout (sem replay)');
  const cookie3 = cookieOf(await call('POST', '/api/auth/login', { body: { email, password: 'senha-forte-1' } })).split(';')[0];

  console.log(' CSRF (requisições de outro site)');
  check((await call('POST', '/api/tree/plant', { cookie: cookie3, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status === 403, 'Sec-Fetch-Site: cross-site → 403');
  check((await call('POST', '/api/tree/plant', { cookie: cookie3, headers: { 'Sec-Fetch-Site': 'same-site' } })).status === 403, 'Sec-Fetch-Site: same-site (subdomínio) → 403');
  check((await call('POST', '/api/tree/plant', { cookie: cookie3, headers: { Origin: 'https://site-malicioso.example' } })).status === 403, 'navegador antigo com Origin de outro site → 403');
  check((await call('POST', '/api/auth/forgot-password', { body: { email }, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status === 403, 'outro site não dispara e-mails de senha');
  check((await call('POST', '/api/auth/logout', { cookie: cookie3, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status === 403, 'logout forçado por outro site → 403');
  check((await call('POST', '/api/tree/plant', { cookie: cookie3, headers: { 'Sec-Fetch-Site': 'same-origin' } })).status === 200, 'mesma origem continua funcionando');
  check((await call('GET', '/api/auth/me', { cookie: cookie3, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status === 200, 'leitura (GET) não é afetada');

  console.log(' Entradas maliciosas');
  check((await call('POST', '/api/auth/login', { raw: JSON.stringify({ email, password: 'x'.repeat(20000) }) })).status === 413, 'corpo > 10 KB → 413');
  r = await call('POST', '/api/auth/login', { raw: '{"email":' });
  check(r.status === 400 && r.data.error === 'Requisição inválida.', 'JSON malformado → 400 genérico');
  check((await call('POST', '/api/auth/login', { body: { email: { $ne: 1 }, password: ['a'] } })).status === 400, 'campos que não são texto → 400');
  check((await call('POST', '/api/auth/register', { body: { username: { a: 1 }, email: 'x@y.z', password: 'senha123' } })).status === 400, 'cadastro com objeto no nome → 400');
  check((await call('POST', '/api/auth/confirm-email', { body: { token: { $gt: '' } } })).status === 400, 'token de confirmação que não é texto → 400');
  check((await call('POST', '/api/auth/reset-password', { body: { token: ['a'], password: 'senha-nova-1' } })).status === 400, 'token de senha que não é texto → 400');
  check((await call('POST', '/api/auth/register', { body: { username: 'Usuário ' + id, email: `long${id}@x.com`, password: 'é'.repeat(37) } })).status === 400, 'senha > 72 bytes → 400 (bcrypt cortaria)');
  check((await call('POST', '/api/auth/register', { body: { username: '\u0430na' + id, email: `cyr${id}@x.com`, password: 'senha123' } })).status === 400, 'nome com letra cirílica imitando latina → 400');
  check((await call('POST', '/api/auth/register', { body: { username: 'SEG ' + id, email: `case${id}@x.com`, password: 'senha123' } })).status === 409, 'nome igual com outra caixa ("SEG" × "Seg") → 409');
  r = await signUp({ username: `Zé\u200B\u202E${id}`, email: `zw${id}@x.com`, password: 'senha123' });
  check(r.status === 200 && r.data.username === `Zé${id}`, 'caracteres invisíveis e de direção removidos do nome');
  const czw = cookieOf(r).split(';')[0];
  r = await call('PATCH', '/api/tree/name', { cookie: czw, body: { name: 'Minha\u202E árvore\n\t  linda\u0000' } });
  check(r.status === 200 && r.data.user.tree_name === 'Minha árvore linda', 'nome da árvore limpo');
  check((await call('POST', '/api/missions/__proto__/complete', { cookie: czw })).status === 404, 'chave de missão "__proto__" → 404');
  check((await call('POST', '/api/rewards/constructor/claim', { cookie: czw })).status === 404, 'chave de recompensa "constructor" → 404');
  check((await call('POST', "/api/missions/x' OR '1'='1/complete", { cookie: czw })).status === 404, 'tentativa de SQL injection → 404');

  console.log(' Arquivos do servidor');
  for (const p of ['/.env', '/backend/.env', '/%2e%2e/backend/.env', '/..%2fbackend%2f.env', '/backend/arvore.db', '/package.json', '/backend/config.js']) {
    const body = await new Promise(resolve => http.get(base + p, res => { let d = ''; res.on('data', c => (d += c)); res.on('end', () => resolve(d)); }));
    check(!/NODE_ENV|SMTP_|PORT=|SQLite format|"dependencies"|process\.env/.test(body), `${p} não vaza conteúdo`);
  }

  console.log(' Enumeração de contas e força bruta no login');
  const time = async body => { const t = performance.now(); await call('POST', '/api/auth/login', { body }); return performance.now() - t; };
  const known = [], unknown = [];
  for (let i = 0; i < 3; i++) { known.push(await time({ email, password: 'errada' })); unknown.push(await time({ email: `naoexiste${i}${id}@x.com`, password: 'errada' })); }
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  check(avg(unknown) > avg(known) * 0.5, `login com e-mail inexistente leva tempo parecido (${avg(unknown).toFixed(0)} ms × ${avg(known).toFixed(0)} ms)`);
  r = await call('POST', '/api/auth/login', { body: { email: `naoexiste${id}@x.com`, password: 'errada' } });
  check(r.data.error === 'E-mail ou senha incorretos.', 'mesma mensagem para e-mail inexistente e senha errada');

  const victim = `vitima${id}@x.com`;
  await signUp({ username: 'Vitima ' + id, email: victim, password: 'senha-certa' });
  for (let i = 0; i < 10; i++) await call('POST', '/api/auth/login', { body: { email: victim, password: 'chute' + i } });
  r = await call('POST', '/api/auth/login', { body: { email: victim, password: 'chute-11' } });
  check(r.status === 429 && Number(r.headers.get('retry-after')) > 0, '11ª senha errada na mesma conta → 429 com Retry-After');
  check((await call('POST', '/api/auth/login', { body: { email: ` ${victim.toUpperCase()} `, password: 'x' } })).status === 429, 'limite por conta não é contornado mudando maiúsculas/espaços no e-mail');

  // Por IP: usa um IP próprio (via proxy confiável) para não afetar os outros testes.
  let blocked = 0;
  for (let i = 0; i < 31; i++) {
    const res = await call('POST', '/api/auth/login', { body: { email: `ip${i}${id}@x.com`, password: 'x' }, headers: { 'X-Forwarded-For': '203.0.113.9' } });
    if (res.status === 429) blocked++;
  }
  check(blocked === 1, '31ª tentativa errada do mesmo IP (contas diferentes) → 429');
  const victim2 = `vitima2${id}@x.com`;
  await signUp({ username: 'Vitima Dois ' + id, email: victim2, password: 'senha-certa' });
  const burst = await Promise.all(Array.from({ length: 25 }, (_, i) => call('POST', '/api/auth/login', { body: { email: victim2, password: 'p' + i }, headers: { 'X-Forwarded-For': '203.0.113.50' } })));
  const n = code => burst.filter(x => x.status === code).length;
  check(n(401) === 10 && n(429) === 15, `25 tentativas simultâneas na mesma conta: só 10 testam a senha (${n(401)} testadas, ${n(429)} bloqueadas)`);

  let linkBlocked = 0;
  for (let i = 0; i < 31; i++) {
    const res = await call('POST', '/api/auth/reset-password', { body: { token: 'chute' + i, password: 'senha-nova-1' }, headers: { 'X-Forwarded-For': '203.0.113.60' } });
    if (res.status === 429) linkBlocked++;
  }
  check(linkBlocked === 1, '31º link inválido do mesmo IP → 429');
};
