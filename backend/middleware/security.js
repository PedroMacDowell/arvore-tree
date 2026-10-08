const HttpError = require('../http-error');
const { production } = require('../config');

// O que a página pode carregar: só arquivos do próprio site (inclusive as fontes).
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Cabeçalhos de proteção do navegador. As páginas estáticas na Vercel recebem os mesmos via vercel.json
// (um teste confere que as duas listas são iguais).
const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY, // bloqueia scripts injetados (XSS)
  'X-Frame-Options': 'DENY', // impede embutir o site em iframe (clickjacking)
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
// Força HTTPS nas próximas visitas. Só em produção, que roda atrás de HTTPS.
const HSTS = 'max-age=31536000; includeSubDomains';

function securityHeaders(_req, res, next) {
  res.set(SECURITY_HEADERS);
  if (production) res.set('Strict-Transport-Security', HSTS);
  next();
}

/**
 * Proteção contra CSRF: ações (POST/PATCH…) só são aceitas quando vêm do próprio site.
 * Complementa o cookie SameSite=Strict. Navegadores modernos enviam Sec-Fetch-Site; nos antigos,
 * vale o Origin. Clientes sem nenhum dos dois (curl, scripts) não carregam o cookie de ninguém.
 */
function sameOriginOnly(req, _res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const site = req.get('sec-fetch-site');
  const origin = req.get('origin');
  const crossSite = site
    ? site !== 'same-origin' && site !== 'none'
    : Boolean(origin) && originHost(origin) !== (req.get('x-forwarded-host') || req.get('host'));
  if (crossSite) throw new HttpError(403, 'Requisição de outra origem bloqueada.');
  next();
}

function originHost(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/** Respostas da API têm dados da conta: navegador e proxies não devem guardá-las. */
function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { SECURITY_HEADERS, HSTS, securityHeaders, sameOriginOnly, noStore };
