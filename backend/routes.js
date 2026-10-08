// Todas as rotas da API, montadas em /api por server.js (que já aplica cabeçalhos, limite geral e
// bloqueio de outras origens). A lógica fica em services/.
const router = require('express').Router();
const db = require('./db');
const { startSession, endSession, requireAuth } = require('./middleware/session');
const limits = require('./middleware/rate-limit');
const accounts = require('./services/accounts');
const tree = require('./services/tree');
const missions = require('./services/missions');
const rewards = require('./services/rewards');

// Verificação de saúde para o provedor de hospedagem: confirma que o banco responde.
router.get('/health', (_req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

// Conta. Cadastro, reenvio e "esqueci a senha" sempre respondem igual, exista ou não conta com o e-mail.
const EMAIL_SENT = 'Pronto! Enviamos uma mensagem para o seu e-mail com o próximo passo.';
router.post('/auth/register', limits.register, limits.emailsByIp, limits.emailsToAddress, async (req, res) => {
  await accounts.register(req.body ?? {});
  res.status(202).json({ message: EMAIL_SENT });
});
router.post('/auth/resend-confirmation', limits.emailsByIp, limits.emailsToAddress, (req, res) => {
  accounts.resendConfirmation(req.body?.email);
  res.status(202).json({ message: 'Se houver um cadastro aguardando confirmação para este e-mail, enviamos um novo link.' });
});
router.post('/auth/confirm-email', limits.linksByIp, (req, res) => {
  const userId = accounts.confirmEmail(req.body?.token);
  startSession(res, userId);
  res.json(tree.publicUser(userId));
});
router.post('/auth/login', limits.loginByIp, limits.loginByEmail, async (req, res) => {
  const userId = await accounts.login(req.body ?? {});
  startSession(res, userId);
  res.json(tree.publicUser(userId));
});
router.post('/auth/forgot-password', limits.emailsByIp, limits.emailsToAddress, (req, res) => {
  accounts.requestPasswordReset(req.body?.email);
  res.status(202).json({ message: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.' });
});
router.post('/auth/reset-password', limits.linksByIp, async (req, res) => {
  const userId = await accounts.resetPassword(req.body ?? {});
  startSession(res, userId);
  res.json(tree.publicUser(userId));
});
router.post('/auth/logout', (req, res) => {
  endSession(req, res);
  res.status(204).end();
});
router.get('/auth/me', requireAuth, (req, res) => res.json(tree.publicUser(req.userId)));

// Árvore
router.post('/tree/plant', requireAuth, (req, res) => res.json(tree.plantSeed(req.userId)));
router.post('/tree/water', requireAuth, (req, res) => res.json(tree.waterTree(req.userId)));
router.post('/tree/care', requireAuth, (req, res) => res.json(tree.careForTree(req.userId, req.body?.item)));
router.patch('/tree/name', requireAuth, (req, res) => res.json(tree.renameTree(req.userId, req.body?.name)));
router.get('/tree/forest', requireAuth, (req, res) => res.json(tree.listForest(req.userId)));

// Missões
router.get('/missions', requireAuth, (req, res) => res.json(missions.listMissions(req.userId)));
router.post('/missions/:key/complete', requireAuth, (req, res) => res.json(missions.completeMission(req.userId, req.params.key)));

// Recompensas
router.get('/rewards', requireAuth, (req, res) => res.json(rewards.listRewards(req.userId)));
router.post('/rewards/:key/claim', requireAuth, (req, res) => res.json(rewards.claimReward(req.userId, req.params.key)));

module.exports = router;
