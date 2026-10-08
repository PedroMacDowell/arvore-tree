# 🌳 Árvore da Amazônia

Projeto educativo e gamificado de conscientização sobre a Amazônia. Cada pessoa cuida de uma sumaúma
virtual por 14 dias e, no caminho, completa missões de leitura e investigação sobre a floresta
(rios voadores, desmatamento, povos tradicionais, bioeconomia…).

## Como o jogo funciona

1. **Cadastro** — a pessoa preenche o formulário e recebe um link por e-mail; a conta só é criada ao
   confirmar. Ela começa com 1 semente e 10 moedas (20 se entrar com código de indicação).
2. **Plantar** — a semente vira a árvore do ciclo atual (solo em 60/100).
3. **Regar uma vez por dia** (calendário de São Paulo). Cada rega é 1 dia de cuidado; dias sem regar não
   tiram progresso, só pausam o crescimento. A árvore passa por 6 estágios:

   | Estágio | Semente | Broto | Muda | Jovem | Madura | Ancestral |
   |---|---|---|---|---|---|---|
   | A partir do dia | 0 | 3 | 5 | 8 | 11 | 14 |

4. **Cuidados** — cada rega gasta 20 de solo; abaixo de 20 é preciso **fertilizante** (+60 de solo,
   usável com solo ≤ 40). Nos dias 4, 8 e 12 aparecem **insetos**, que bloqueiam a rega até serem
   tratados com **proteção**.
5. **Missões** — 10 por estágio (60 no total). O nível N libera quando a árvore alcança o estágio N.
   Cada missão dá moedas (5 a 50), 1 fertilizante e 1 proteção.
6. **Árvore completa** (dia 14) — entra na "Minha floresta" e uma nova semente fica disponível.
7. **Recompensas** — conquistas simbólicas trocadas por moedas, liberadas por estágio. Por enquanto o
   resgate só fica registrado na conta; não há entrega fora do app (e-book, certificado, doação etc.).
8. **Indicação** — quem cria a conta com o código de alguém ganha +10 moedas; quem indicou ganha +25
   pelos seus 10 primeiros amigos. O bônus só sai quando o amigo confirma o e-mail.

As regras ficam em [backend/services/tree.js](backend/services/tree.js) (árvore),
[backend/services/missions.js](backend/services/missions.js) e
[backend/services/accounts.js](backend/services/accounts.js) (conta, bônus e indicação).

## Estrutura

```
arvore-tree/
├── package.json             # scripts: install, dev, build, start, test
├── scripts/dev.cjs          # sobe backend + frontend juntos
├── backend/                 # Node.js + Express 5 + SQLite (better-sqlite3)
│   ├── server.js            # app Express; em produção também serve frontend/dist
│   ├── config.js            # variáveis de ambiente, validadas ao iniciar
│   ├── routes.js            # todas as rotas da API
│   ├── db.js                # conexão e schema do banco
│   ├── tokens.js            # tokens secretos (só o hash vai para o banco)
│   ├── middleware/          # sessão, cabeçalhos de segurança/CSRF, limites de tentativas
│   ├── services/            # regras: accounts, tree, missions, rewards, mailer
│   ├── catalog/             # conteúdo editável: missions.js e rewards.js
│   └── test/                # testes de ponta a ponta da API (npm test)
└── frontend/                # React 19 + Vite + Framer Motion
    └── src/
        ├── api.js           # cliente fetch para /api
        ├── constants.js     # nomes dos estágios e rótulos de temas
        ├── context/         # sessão do jogador (AuthProvider, useAuth)
        ├── pages/           # início, login/cadastro, confirmar e-mail, senha, painel (/app)
        ├── components/      # abas do painel, árvore (TreeDisplay), modais, avisos
        └── styles/          # base, landing, auth, app
```

## API

Todas as rotas ficam em `/api`. As da árvore, missões e recompensas exigem o cookie de sessão.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/register` | Envia o link de confirmação (`username`, `email`, `password`, `referral_code` opcional) |
| POST | `/auth/resend-confirmation` | Envia um novo link de confirmação (`email`) |
| POST | `/auth/confirm-email` | Cria a conta e inicia a sessão (`token` do link) |
| POST | `/auth/login` | Inicia a sessão (`email`, `password`) |
| POST | `/auth/forgot-password` | Envia o link de nova senha (`email`) |
| POST | `/auth/reset-password` | Troca a senha, encerra as outras sessões e inicia uma nova (`token`, `password`) |
| POST | `/auth/logout` | Encerra a sessão |
| GET | `/auth/me` | Estado do jogador |
| POST | `/tree/plant` | Planta uma semente |
| POST | `/tree/water` | Rega (1×/dia) |
| POST | `/tree/care` | Usa insumo: `{ "item": "fertilizer" \| "protection" }` |
| PATCH | `/tree/name` | Renomeia a árvore (`name`, até 40 caracteres) |
| GET | `/tree/forest` | Árvores completas |
| GET | `/missions` | Níveis com as missões liberadas |
| POST | `/missions/:key/complete` | Conclui uma missão |
| GET | `/rewards` | Recompensas e quais já foram resgatadas |
| POST | `/rewards/:key/claim` | Resgata uma recompensa |
| GET | `/health` | Verificação de saúde (consulta o banco) |

Cadastro, reenvio e "esqueci a senha" sempre respondem igual, exista ou não conta com o e-mail.
Erros voltam como `{ "error": "mensagem para o jogador" }`.

## Banco de dados

SQLite em um único arquivo (`backend/arvore.db` por padrão, ou `DB_PATH`). As tabelas são criadas na
primeira execução:

| Tabela | Conteúdo |
|---|---|
| `users` | conta, inventário (sementes, moedas, fertilizante, proteção) e estado da árvore atual |
| `sessions` | hash dos tokens de sessão (7 dias) |
| `pending_registrations` | cadastros aguardando confirmação do e-mail (24 h) |
| `password_resets` | hash dos links de nova senha (1 h, uso único) |
| `mission_completions` | missões concluídas por jogador (`mission_key`) |
| `reward_claims` | recompensas resgatadas (`reward_key`) |
| `forest_trees` | árvores que completaram os 14 dias |

O texto das missões e recompensas **não** fica no banco: vem de `backend/catalog/`. Editar um texto
vale para todos na hora. Só nunca altere a `key` de um item existente (é o que o banco guarda).

## Rodar localmente

Requer **Node.js 22 ou mais recente** (exigência do better-sqlite3).

```bash
npm install     # instala backend e frontend
npm run dev     # backend em :3001 + frontend em http://localhost:5173
npm test        # compila o frontend e roda os testes da API
```

Em desenvolvimento o Vite repassa `/api` para o backend (mesma origem, sem CORS). Sem SMTP configurado,
os e-mails de confirmação e de senha **aparecem no terminal** do backend, com o link para abrir.
Configuração opcional: copie `backend/.env.example` para `backend/.env`.

## Deploy

O app roda como **um único serviço Node**: o backend serve a API e o frontend compilado. Como o banco é
um arquivo SQLite, o serviço precisa de um **disco persistente** (ex.: Render com Disk, Railway com
Volume, Fly.io com Volume ou uma VPS). Plataformas serverless sem disco (Vercel, Netlify) não servem.

1. **E-mail**: crie uma conta num provedor com SMTP (Brevo, Resend, Amazon SES, Mailgun…), verifique o
   seu domínio nele (registros SPF/DKIM no DNS, para os e-mails não caírem no spam) e anote host,
   porta, usuário e senha SMTP.
2. **Serviço**: crie um serviço Node apontando para este repositório, com um disco persistente.

   | Etapa | Comando |
   |---|---|
   | Instalação | `npm install` |
   | Build | `npm run build` |
   | Início | `npm start` |
   | Health check | `GET /api/health` |

3. **Variáveis de ambiente** (no painel do provedor — nunca no código):

   | Variável | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `APP_URL` | endereço público com https, ex.: `https://arvore.seudominio.com.br` |
   | `DB_PATH` | arquivo dentro do disco persistente, ex.: `/var/data/arvore.db` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | dados SMTP do provedor de e-mail |
   | `MAIL_FROM` | remetente do domínio verificado, ex.: `Árvore da Amazônia <nao-responda@seudominio.com.br>` |
   | `TRUST_PROXY` | opcional; padrão `1` (atrás do proxy do provedor). `0` se o Node ficar exposto direto |
   | `PORT` | normalmente definida pelo provedor |

Em produção o servidor **não sobe** se `APP_URL`, `SMTP_HOST` ou `MAIL_FROM` faltarem, ou se `APP_URL`
não usar https: o log do deploy mostra exatamente o que ajustar. A cada novo deploy o servidor recebe
`SIGTERM` e encerra limpo (termina as requisições e fecha o banco).

## Segurança

- **Contas**: o cadastro só vira conta após confirmar o e-mail. Cadastro, reenvio e "esqueci a senha" respondem
  igual (e no mesmo tempo) com ou sem conta, então ninguém descobre quais e-mails estão cadastrados. Se o
  e-mail já tem conta, o dono recebe um aviso.
- **Senhas**: só o hash bcrypt (custo 11) é guardado; 6 a 72 caracteres (limite do bcrypt). Trocar a senha
  encerra todas as sessões abertas e avisa o dono por e-mail.
- **Tokens** (sessão, confirmação, nova senha): 256 bits aleatórios; o banco guarda só o hash SHA-256. Links
  expiram (24 h / 1 h), valem uma vez e levam o token depois do `#`, que não vai para logs de servidor.
  Os links usam sempre `APP_URL`, nunca o cabeçalho `Host` da requisição.
- **Sessão**: cookie `HttpOnly`, `SameSite=Strict` e, em produção, `Secure` com prefixo `__Host-`. Expira em 7 dias.
- **CSRF**: além do `SameSite=Strict`, ações (POST/PATCH) vindas de outro site são recusadas (`Sec-Fetch-Site`/`Origin`).
- **Abuso**: login com até 10 erros por conta e 30 por IP a cada 15 min; até 5 e-mails por hora para um mesmo
  endereço; cadastros e links inválidos limitados por IP; 1000 requisições por minuto por IP no geral.
- **Cabeçalhos**: CSP só com recursos do próprio site (inclusive as fontes, sem Google Fonts), anti-iframe,
  `nosniff`, HSTS em produção e `no-store` nas respostas da API.
- **Entradas**: corpo limitado a 10 KB, SQL sempre parametrizado, nomes sem caracteres invisíveis e só com
  alfabeto latino (contra imitações), nomes de guardião únicos sem diferenciar maiúsculas.
- **Dependências**: `.npmrc` com `ignore-scripts=true` nos dois projetos (nenhum pacote roda código na instalação).
- **Repositório**: `.env`, bancos SQLite, `node_modules` e o build ficam fora do Git (`.gitignore`).
