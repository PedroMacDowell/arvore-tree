const nodemailer = require('nodemailer');
const config = require('../config');

const transport = config.mail && (({ from: _from, ...smtp }) => nodemailer.createTransport(smtp))(config.mail);

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Monta as versões texto e HTML de um e-mail simples: parágrafos e um botão opcional. */
function render({ paragraphs, button, note }) {
  const text = [...paragraphs, button && `${button.label}: ${button.url}`, note].filter(Boolean).join('\n\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f4ec;font-family:Arial,sans-serif;color:#293c2d">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
  <p style="font-size:20px;font-weight:bold;color:#293f30;margin:0 0 24px">🌳 Árvore da Amazônia</p>
  ${paragraphs.map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${escapeHtml(p)}</p>`).join('\n  ')}
  ${button ? `<p style="margin:28px 0"><a href="${escapeHtml(button.url)}" style="background:#45664b;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">${escapeHtml(button.label)}</a></p>
  <p style="font-size:12px;color:#70776a;word-break:break-all">Se o botão não funcionar, copie este endereço: ${escapeHtml(button.url)}</p>` : ''}
  ${note ? `<p style="font-size:12px;color:#70776a;margin-top:24px">${escapeHtml(note)}</p>` : ''}
</div></body></html>`;
  return { text, html };
}

/**
 * Envia em segundo plano: a resposta da API não espera o servidor de e-mail, então o tempo de
 * resposta não revela se o endereço tem conta. Sem SMTP configurado (desenvolvimento), o e-mail
 * aparece no terminal.
 */
function send(to, subject, content) {
  const { text, html } = render(content);
  if (!transport) {
    console.log(`\n📧 E-mail (SMTP não configurado — só exibido aqui)\n   Para: ${to}\n   Assunto: ${subject}\n\n${text}\n`);
    return;
  }
  transport.sendMail({ from: config.mail.from, to, subject, text, html })
    .catch(err => console.error(`Falha ao enviar e-mail "${subject}":`, err.message));
}

const IGNORE = 'Se não foi você, ignore esta mensagem.';

module.exports = {
  sendEmailConfirmation(to, username, url) {
    send(to, 'Confirme seu e-mail — Árvore da Amazônia', {
      paragraphs: [`Olá, ${username}!`, 'Falta só um passo para plantar sua sumaúma: confirme seu e-mail para ativar a conta. O link vale por 24 horas.'],
      button: { label: 'Confirmar meu e-mail', url },
      note: `Alguém se cadastrou com este endereço. ${IGNORE}`,
    });
  },
  sendAlreadyRegistered(to) {
    send(to, 'Tentativa de cadastro com seu e-mail — Árvore da Amazônia', {
      paragraphs: ['Alguém tentou criar uma conta com este e-mail, mas ele já está cadastrado.', 'Se foi você, é só entrar. Esqueceu a senha? Use a opção "Esqueci minha senha" na tela de login.'],
      button: { label: 'Entrar na minha conta', url: `${config.appUrl}/login` },
      note: `${IGNORE} Sua conta continua segura.`,
    });
  },
  sendPasswordReset(to, url) {
    send(to, 'Redefinir sua senha — Árvore da Amazônia', {
      paragraphs: ['Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora e só pode ser usado uma vez.'],
      button: { label: 'Criar nova senha', url },
      note: `${IGNORE} Sua senha atual continua valendo.`,
    });
  },
  sendPasswordChanged(to) {
    send(to, 'Sua senha foi alterada — Árvore da Amazônia', {
      paragraphs: ['A senha da sua conta acabou de ser alterada e todas as sessões abertas foram encerradas.', 'Se não foi você, redefina a senha agora mesmo pela opção "Esqueci minha senha".'],
      button: { label: 'Ir para o login', url: `${config.appUrl}/login` },
    });
  },
};
