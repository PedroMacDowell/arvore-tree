// Regras do jogo de ponta a ponta: cadastro, missões, ciclo completo de 14 dias, recompensas, indicação.
module.exports = async ({ base, db, check, client, registerAndConfirm }) => {
  const a = client();
  const id = Date.now().toString(36);
  const nextDay = userId => db.run("UPDATE users SET last_growth_date = '2000-01-01' WHERE id = ?", userId);

  // Cadastro e validações
  check((await a('POST', '/auth/register', { username: '', email: 'x@y.z', password: '123456' })).status === 400, 'cadastro sem nome');
  check((await a('POST', '/auth/register', { username: 'xy', email: 'invalido', password: '123456' })).status === 400, 'e-mail inválido');
  check((await a('POST', '/auth/register', { username: 'xy', email: 'x@y.z', password: '123' })).status === 400, 'senha curta');
  const user = await registerAndConfirm(a, { username: 'Ana ' + id, email: `  Ana${id}@Exemplo.com `, password: 'senha123' });
  check(user.email === `ana${id}@exemplo.com`, 'e-mail normalizado');
  check(user.seeds === 1 && user.coins === 10 && !user.planted_at && !user.is_growing && !user.can_water, 'estado inicial');
  check(/^ANA[A-Z0-9]-\d{4}$/.test(user.referral_code), 'código de indicação ' + user.referral_code);
  check(!('password' in user) && !('last_growth_date' in user), 'não vaza campos internos');

  // Sessão
  check((await a('GET', '/auth/me')).data.id === user.id, '/me');
  const anon = client();
  check((await anon('GET', '/auth/me')).status === 401, '/me sem sessão');
  check((await anon('GET', '/missions')).status === 401, 'missões sem sessão');

  // Missões: só o nível 1 liberado
  let r = await a('GET', '/missions');
  check(r.data.length === 6 && r.data[0].unlocked && !r.data[1].unlocked, 'níveis');
  check(r.data[0].missions.length === 10 && r.data[1].missions.length === 0 && r.data[1].total === 10, 'missões por nível');
  const first = r.data[0].missions[0];
  check(first.key === 'terra-preta' && first.fertilizer_reward === 1 && first.completed === false, 'formato da missão');
  r = await a('POST', `/missions/${first.key}/complete`);
  check(r.status === 200 && r.data.user.coins === 25 && r.data.user.fertilizer === 1 && r.data.user.insect_protection === 1, 'concluir missão');
  check((await a('POST', `/missions/${first.key}/complete`)).status === 409, 'missão repetida');
  check((await a('POST', '/missions/rios-voadores/complete')).status === 403, 'missão de nível bloqueado');
  check((await a('POST', '/missions/nao-existe/complete')).status === 404, 'missão inexistente');
  for (const m of (await a('GET', '/missions')).data[0].missions.slice(1, 6)) await a('POST', `/missions/${m.key}/complete`);
  check((await a('GET', '/missions')).data[0].completed === 6, 'contagem de concluídas');

  // Árvore
  check((await a('POST', '/tree/water')).status === 409, 'regar sem plantar');
  r = await a('POST', '/tree/plant');
  check(r.status === 200 && r.data.user.seeds === 0 && r.data.user.is_growing && r.data.user.can_water && r.data.user.tree_cycle === 1, 'plantar');
  check((await a('POST', '/tree/plant')).status === 409, 'plantar de novo');
  check((await a('POST', '/tree/care', { item: 'fertilizer' })).status === 409, 'fertilizar com solo cheio');
  check((await a('POST', '/tree/care', { item: 'protection' })).status === 409, 'proteger sem insetos');
  check((await a('POST', '/tree/care', { item: 'xyz' })).status === 400, 'cuidado inválido');

  let u;
  const stagesSeen = [];
  for (let day = 1; day <= 14; day++) {
    u = (await a('GET', '/auth/me')).data;
    if (u.pests) check((await a('POST', '/tree/care', { item: 'protection' })).status === 200, `tratar insetos (dia ${day})`);
    if (u.soil < 20) check((await a('POST', '/tree/care', { item: 'fertilizer' })).status === 200, `fertilizar (dia ${day})`);
    r = await a('POST', '/tree/water');
    check(r.status === 200 && r.data.user.growth_days === day, `regar (dia ${day})`);
    u = r.data.user;
    stagesSeen.push(u.tree_stage);
    check(u.pests === (day % 4 === 0 && day < 14), `insetos corretos (dia ${day})`);
    if (day < 14) check((await a('POST', '/tree/water')).status === 409, `não rega 2x no mesmo dia (dia ${day})`);
    await nextDay(u.id);
  }
  check(JSON.stringify(stagesSeen) === JSON.stringify([0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5]), 'estágios ' + stagesSeen);
  check(u.seeds === 1 && !u.is_growing && !u.can_water && u.highest_stage === 5 && u.stage_progress === 100 && u.next_stage_day === null, 'árvore completa');
  check(r.data.message.includes('floresta'), 'mensagem de conclusão');
  check((await a('POST', '/tree/water')).status === 409, 'regar árvore completa');
  r = await a('GET', '/tree/forest');
  check(r.data.length === 1 && r.data[0].cycle === 1 && r.data[0].name === 'Sumaúma Sagrada', 'floresta');
  check((await a('GET', '/missions')).data.every(l => l.unlocked), 'todos os níveis liberados');

  // Renomear e replantar
  check((await a('PATCH', '/tree/name', { name: '  ' })).status === 400, 'nome vazio');
  check((await a('PATCH', '/tree/name', { name: 'x'.repeat(41) })).status === 400, 'nome longo');
  r = await a('PATCH', '/tree/name', { name: '  Minha Sumaúma ' });
  check(r.data.user.tree_name === 'Minha Sumaúma', 'renomear');
  r = await a('POST', '/tree/plant');
  check(r.status === 200 && r.data.user.tree_cycle === 2 && r.data.user.growth_days === 0 && r.data.user.tree_stage === 0 && r.data.user.highest_stage === 5 && r.data.user.soil === 60, 'replantar');

  // Recompensas
  r = await a('GET', '/rewards');
  check(r.data.length === 5 && r.data.every(x => x.claimed === false), 'listar recompensas');
  const coinsBefore = (await a('GET', '/auth/me')).data.coins;
  r = await a('POST', '/rewards/guia-bioeconomia/claim');
  check(r.status === 200 && r.data.user.coins === coinsBefore - 15, 'resgatar');
  check((await a('POST', '/rewards/guia-bioeconomia/claim')).status === 409, 'resgatar 2x');
  check((await a('POST', '/rewards/brigadistas/claim')).status === 409, 'moedas insuficientes');
  check((await a('GET', '/rewards')).data.find(x => x.key === 'guia-bioeconomia').claimed, 'marcada como resgatada');

  // Indicação (o bônus só vale depois que o amigo confirma o e-mail)
  const b = client();
  const bia = await registerAndConfirm(b, { username: 'Bia ' + id, email: `bia${id}@exemplo.com`, password: 'senha123', referral_code: ' ' + user.referral_code.toLowerCase() });
  check(bia.coins === 20, 'bônus de quem foi indicado');
  check((await a('GET', '/auth/me')).data.coins === coinsBefore - 15 + 25, 'bônus de quem indicou');
  check((await b('POST', '/rewards/muda-nativa/claim')).status === 403, 'recompensa bloqueada por nível');

  // Logout / login
  check((await a('POST', '/auth/logout')).status === 204, 'logout');
  check((await a('GET', '/auth/me')).status === 401, 'sessão encerrada');
  check((await a('POST', '/auth/login', { email: `ana${id}@exemplo.com`, password: 'errada' })).status === 401, 'senha errada');
  check((await a('POST', '/auth/login', { email: '' })).status === 400, 'login sem campos');
  r = await a('POST', '/auth/login', { email: `ANA${id}@exemplo.com`, password: 'senha123' });
  check(r.status === 200 && r.data.id === user.id, 'login (e-mail sem diferenciar maiúsculas)');

  // Erros gerais
  const bad = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  check(bad.status === 400 && (await bad.json()).error, 'JSON malformado vira 400 JSON');
  check((await a('GET', '/nao-existe')).status === 404, 'rota de API inexistente');
  check((await a('GET', '/health')).data.ok, 'health (consulta o banco)');
};
