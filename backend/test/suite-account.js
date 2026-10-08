// Confirmação de e-mail, recuperação de senha, anti-enumeração e limite de indicações.
module.exports = async ({ base, db, check, mail, client, registerAndConfirm, wait }) => {
  const id = Date.now().toString(36);
  const email = `conta${id}@exemplo.com`;

  console.log(' Cadastro com confirmação de e-mail');
  const a = client();
  let r = await a('POST', '/auth/register', { username: 'Rita ' + id, email, password: 'senha-1234' });
  check(r.status === 202 && !r.headers.get('set-cookie'), 'cadastro responde 202 e não abre sessão');
  const firstMail = await mail.next(email, 'Confirme seu e-mail');
  check(firstMail.from.includes('nao-responda@arvore.test'), 'e-mail sai do remetente configurado (MAIL_FROM)');
  check(firstMail.text.includes(`${base}/confirmar-email#token=`), 'link aponta para APP_URL com o token depois do "#"');
  check(/Rita/.test(firstMail.html) && !/<script/i.test(firstMail.html), 'e-mail em HTML com o nome do jogador');
  check(!await db.get('SELECT 1 FROM users WHERE email = ?', email), 'conta ainda não existe antes da confirmação');
  check((await a('GET', '/auth/me')).status === 401, 'sem sessão antes de confirmar');
  check((await a('POST', '/auth/login', { email, password: 'senha-1234' })).status === 401, 'login antes de confirmar → 401');
  const pending = await db.get('SELECT * FROM pending_registrations WHERE email = ?', email);
  check(pending && pending.password.startsWith('$2') && !JSON.stringify(pending).includes(mail.token(firstMail)), 'pendente guarda hash da senha e hash do token');

  r = await a('POST', '/auth/register', { username: 'Rita Nova ' + id, email, password: 'outra-senha' });
  check(r.status === 202, 'novo cadastro com o mesmo e-mail pendente');
  const secondMail = await mail.next(email, 'Confirme seu e-mail');
  check((await a('POST', '/auth/confirm-email', { token: mail.token(firstMail) })).status === 400, 'link antigo deixa de valer');
  r = await a('POST', '/auth/confirm-email', { token: mail.token(secondMail) });
  check(r.status === 200 && r.data.username === 'Rita Nova ' + id && /session=/.test(r.headers.get('set-cookie')), 'confirmação cria a conta (dados do último cadastro) e abre a sessão');
  check((await a('GET', '/auth/me')).status === 200, 'sessão ativa após confirmar');
  check((await client()('POST', '/auth/confirm-email', { token: mail.token(secondMail) })).status === 400, 'link de confirmação é de uso único');
  check((await client()('POST', '/auth/confirm-email', { token: 'x'.repeat(43) })).status === 400, 'token inventado → 400');
  check((await client()('POST', '/auth/confirm-email', {})).status === 400, 'sem token → 400');

  console.log(' Cadastro não revela e-mails já usados');
  const outsider = client();
  const fresh = await outsider('POST', '/auth/register', { username: 'Novo ' + id, email: `novo${id}@exemplo.com`, password: 'senha-1234' });
  const taken = await outsider('POST', '/auth/register', { username: 'Intruso ' + id, email, password: 'senha-do-intruso' });
  check(fresh.status === taken.status && JSON.stringify(fresh.data) === JSON.stringify(taken.data), 'mesma resposta para e-mail novo e e-mail já cadastrado');
  const notice = await mail.next(email, 'Tentativa de cadastro');
  check(notice.text.includes(`${base}/login`) && !notice.text.includes('#token='), 'dono do e-mail recebe só um aviso (sem link de ativação)');
  check(!await db.get('SELECT 1 FROM pending_registrations WHERE email = ?', email), 'nada fica pendente para e-mail já cadastrado');
  check((await client()('POST', '/auth/login', { email, password: 'outra-senha' })).status === 200, 'senha do dono continua a mesma');
  check((await client()('POST', '/auth/login', { email, password: 'senha-do-intruso' })).status === 401, 'senha do intruso não vale');
  await mail.next(`novo${id}@exemplo.com`, 'Confirme seu e-mail');
  const t0 = performance.now(); await client()('POST', '/auth/register', { username: 'Tempo ' + id, email: `tempo${id}@exemplo.com`, password: 'senha-1234' }); const tNew = performance.now() - t0;
  const t1 = performance.now(); await client()('POST', '/auth/register', { username: 'Tempo Dois ' + id, email, password: 'senha-1234' }); const tTaken = performance.now() - t1;
  check(tTaken > tNew * 0.5 && tTaken < tNew * 2, `cadastro leva tempo parecido nos dois casos (${tNew.toFixed(0)} ms × ${tTaken.toFixed(0)} ms)`);
  r = await client()('POST', '/auth/register', { username: 'Rita Nova ' + id, email: `outra${id}@exemplo.com`, password: 'senha-1234' });
  check(r.status === 409, 'nome de guardião em uso → 409 (nomes são públicos)');

  console.log(' Reenvio do link');
  const resendTo = `reenvio${id}@exemplo.com`;
  await client()('POST', '/auth/register', { username: 'Reenvio ' + id, email: resendTo, password: 'senha-1234' });
  const original = await mail.next(resendTo, 'Confirme seu e-mail');
  r = await client()('POST', '/auth/resend-confirmation', { email: resendTo });
  const resent = await mail.next(resendTo, 'Confirme seu e-mail');
  check(r.status === 202 && mail.token(resent) !== mail.token(original), 'reenvio gera um novo link');
  check((await client()('POST', '/auth/confirm-email', { token: mail.token(original) })).status === 400, 'link anterior ao reenvio deixa de valer');
  const unknown = await client()('POST', '/auth/resend-confirmation', { email: `ninguem${id}@exemplo.com` });
  check(unknown.status === 202 && unknown.data.message === r.data.message && await mail.none(`ninguem${id}@exemplo.com`), 'reenvio para e-mail sem cadastro: mesma resposta e nenhum e-mail');

  console.log(' Esqueci minha senha');
  // Conta própria para esta parte: cada endereço recebe no máximo 5 e-mails por hora.
  const owner = client();
  const pwEmail = `senha${id}@exemplo.com`;
  await registerAndConfirm(owner, { username: 'Senha ' + id, email: pwEmail, password: 'senha-antiga' });
  const ownerCookie = owner.cookie();
  const ghost = await client()('POST', '/auth/forgot-password', { email: `fantasma${id}@exemplo.com` });
  r = await client('203.0.113.77')('POST', '/auth/forgot-password', { email: pwEmail }, { Host: 'site-malicioso.example', 'X-Forwarded-Host': 'site-malicioso.example' });
  check(r.status === 202 && ghost.status === 202 && ghost.data.message === r.data.message, 'mesma resposta com ou sem conta');
  check(await mail.none(`fantasma${id}@exemplo.com`), 'nenhum e-mail para endereço sem conta');
  const reset1 = await mail.next(pwEmail, 'Redefinir sua senha');
  check(reset1.text.includes(`${base}/redefinir-senha#token=`) && !reset1.text.includes('site-malicioso'), 'link usa APP_URL, nunca o Host enviado pelo atacante');
  check(!JSON.stringify(await db.all('SELECT * FROM password_resets')).includes(mail.token(reset1)), 'banco guarda só o hash do link');
  await client()('POST', '/auth/forgot-password', { email: pwEmail });
  const reset2 = await mail.next(pwEmail, 'Redefinir sua senha');
  check(await db.value('SELECT COUNT(*) FROM password_resets') === 1, 'só o link mais recente fica válido');

  const r1 = client();
  check((await r1('POST', '/auth/reset-password', { token: mail.token(reset1), password: 'nova-senha-1' })).status === 400, 'link antigo de senha não vale');
  check((await r1('POST', '/auth/reset-password', { token: mail.token(reset2), password: '123' })).status === 400, 'senha nova curta → 400');
  r = await r1('POST', '/auth/reset-password', { token: mail.token(reset2), password: 'nova-senha-1' });
  check(r.status === 200 && r.data.email === pwEmail, 'senha curta antes não gastou o link; redefinição funciona e já entra na conta');
  const loginCheck = client();
  loginCheck.setCookie(ownerCookie);
  check((await loginCheck('GET', '/auth/me')).status === 401, 'sessões abertas antes da troca são encerradas');
  check((await r1('GET', '/auth/me')).status === 200, 'nova sessão funciona');
  check((await client()('POST', '/auth/login', { email: pwEmail, password: 'senha-antiga' })).status === 401, 'senha antiga não entra mais');
  check((await client()('POST', '/auth/login', { email: pwEmail, password: 'nova-senha-1' })).status === 200, 'senha nova entra');
  check((await client()('POST', '/auth/reset-password', { token: mail.token(reset2), password: 'outra-nova-1' })).status === 400, 'link de senha é de uso único');
  check((await mail.next(pwEmail, 'Sua senha foi alterada')).text.includes('sessões abertas foram encerradas'), 'aviso de senha alterada enviado');

  const burst = client('203.0.113.88');
  await burst('POST', '/auth/forgot-password', { email: pwEmail });
  const race = await mail.next(pwEmail, 'Redefinir sua senha');
  const results = await Promise.all([1, 2, 3].map(i => client()('POST', '/auth/reset-password', { token: mail.token(race), password: `paralela-${i}x` })));
  check(results.filter(x => x.status === 200).length === 1, 'envios simultâneos com o mesmo link: só um funciona');
  await mail.next(pwEmail, 'Sua senha foi alterada');

  console.log(' Links expirados');
  await client()('POST', '/auth/forgot-password', { email: pwEmail });
  const expiring = await mail.next(pwEmail, 'Redefinir sua senha');
  await db.run("UPDATE password_resets SET expires_at = datetime('now', '-1 minute')");
  check((await client()('POST', '/auth/reset-password', { token: mail.token(expiring), password: 'expirada-1' })).status === 400, 'link de senha expirado (1 h) → 400');
  const late = `atrasado${id}@exemplo.com`;
  await client()('POST', '/auth/register', { username: 'Atrasado ' + id, email: late, password: 'senha-1234' });
  const lateMail = await mail.next(late, 'Confirme seu e-mail');
  await db.run("UPDATE pending_registrations SET expires_at = datetime('now', '-1 minute') WHERE email = ?", late);
  check((await client()('POST', '/auth/confirm-email', { token: mail.token(lateMail) })).status === 400, 'link de confirmação expirado (24 h) → 400');

  console.log(' Limite de e-mails por endereço (contra lotar a caixa de alguém)');
  const target = `alvo${id}@exemplo.com`;
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await client()('POST', '/auth/forgot-password', { email: target })).status);
  check(statuses.slice(0, 5).every(s => s === 202) && statuses[5] === 429, '6º pedido de e-mail para o mesmo endereço na hora → 429');

  console.log(' Indicação: bônus só após confirmar e no máximo 10 amigos');
  const host = client();
  const referrer = await registerAndConfirm(host, { username: 'Anfitriao ' + id, email: `anfitriao${id}@exemplo.com`, password: 'senha-1234' });
  const coins = () => db.value('SELECT coins FROM users WHERE id = ?', referrer.id);
  await client()('POST', '/auth/register', { username: 'Pendente ' + id, email: `pendente${id}@exemplo.com`, password: 'senha-1234', referral_code: referrer.referral_code });
  await mail.next(`pendente${id}@exemplo.com`, 'Confirme seu e-mail');
  check(await coins() === 10, 'amigo que não confirmou o e-mail não rende bônus');
  const friendCoins = [];
  for (let i = 1; i <= 11; i++) {
    const friend = await registerAndConfirm(client(), { username: `Amigo ${i} ${id}`, email: `amigo${i}-${id}@exemplo.com`, password: 'senha-1234', referral_code: referrer.referral_code });
    friendCoins.push(friend.coins);
  }
  const finalCoins = await coins();
  check(finalCoins === 10 + 10 * 25, `quem indica ganha 25 moedas pelos 10 primeiros amigos (saldo ${finalCoins})`);
  check(friendCoins.every(c => c === 20), 'todo amigo indicado começa com 10 moedas extras, inclusive o 11º');
  await wait(100);
};
