// Todas as rotas da API, montadas em /api por app.js (que já aplica cabeçalhos, limite geral e
// bloqueio de outras origens). A lógica fica em services/.
const router = require('express').Router();
const db = require('./db');
const { startSession, endSession, requireAuth } = require('./middleware/session');
const limits = require('./middleware/rate-limit');
const accounts = require('./services/accounts');
const tree = require('./services/tree');
const missions = require('./services/missions');
const rewards = require('./services/rewards');

/** Abre a sessão do usuário e responde com o estado dele. */
async function signIn(req, res, userId) {
  await limits.refundAttempts(req); // deu certo: a tentativa não conta para o limite
  await startSession(res, userId);
  res.json(await tree.publicUser(userId));
}

// Verificação de saúde para o provedor de hospedagem: confirma que o banco responde.
router.get('/health', async (_req, res) => {
  await db.get('SELECT 1');
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
router.post('/auth/confirm-email', limits.linksByIp, async (req, res) => {
  await signIn(req, res, await accounts.confirmEmail(req.body?.token));
});
router.post('/auth/login', limits.loginByIp, limits.loginByEmail, async (req, res) => {
  await signIn(req, res, await accounts.login(req.body ?? {}));
});
router.post('/auth/forgot-password', limits.emailsByIp, limits.emailsToAddress, (req, res) => {
  accounts.requestPasswordReset(req.body?.email);
  res.status(202).json({ message: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.' });
});
router.post('/auth/reset-password', limits.linksByIp, async (req, res) => {
  await signIn(req, res, await accounts.resetPassword(req.body ?? {}));
});
router.post('/auth/logout', async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});
router.get('/auth/me', requireAuth, async (req, res) => res.json(await tree.publicUser(req.userId)));

// Árvore
router.post('/tree/plant', requireAuth, async (req, res) => res.json(await tree.plantSeed(req.userId)));
router.post('/tree/water', requireAuth, async (req, res) => res.json(await tree.waterTree(req.userId)));
router.post('/tree/care', requireAuth, async (req, res) => res.json(await tree.careForTree(req.userId, req.body?.item)));
router.patch('/tree/name', requireAuth, async (req, res) => res.json(await tree.renameTree(req.userId, req.body?.name)));
router.get('/tree/forest', requireAuth, async (req, res) => res.json(await tree.listForest(req.userId)));

// Missões
router.get('/missions', requireAuth, async (req, res) => res.json(await missions.listMissions(req.userId)));
router.post('/missions/:key/complete', requireAuth, async (req, res) => res.json(await missions.completeMission(req.userId, req.params.key)));

// Recompensas
router.get('/rewards', requireAuth, async (req, res) => res.json(await rewards.listRewards(req.userId)));
router.post('/rewards/:key/claim', requireAuth, async (req, res) => res.json(await rewards.claimReward(req.userId, req.params.key)));

module.exports = router;
