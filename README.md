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

## Arquitetura

- **Frontend**: React 19 + Vite, compilado para arquivos estáticos. Na Vercel é o serviço `frontend`.
- **API**: Express 5. Na Vercel é o serviço `backend` (entrada `backend/vercel.js`); localmente, servidor Node (`backend/server.js`).
- **Banco**: SQLite via libSQL — [Turso](https://turso.tech) em produção, arquivo local em desenvolvimento e nos testes.
- **E-mail**: SMTP (qualquer provedor), enviado depois da resposta da API.

```
arvore-tree/
├── vercel.json              # serviços da Vercel (backend e frontend), rotas públicas e cabeçalhos
├── package.json             # scripts: install, dev, build, start, test
├── scripts/dev.cjs          # sobe backend + frontend juntos
├── backend/
│   ├── app.js               # app Express (rotas, segurança, erros)
│   ├── server.js            # servidor Node local; também serve o frontend compilado
│   ├── vercel.js            # entrada do serviço backend na Vercel
│   ├── config.js            # variáveis de ambiente, validadas ao iniciar
│   ├── routes.js            # todas as rotas da API
│   ├── db.js                # conexão libSQL/Turso, esquema e transações
│   ├── tokens.js            # tokens secretos (só o hash vai para o banco)
│   ├── background.js        # tarefas depois da resposta (waitUntil na Vercel)
│   ├── middleware/          # sessão, cabeçalhos de segurança/CSRF, limites de tentativas
│   ├── services/            # regras: accounts, tree, missions, rewards, mailer
│   ├── catalog/             # conteúdo editável: missions.js e rewards.js
│   └── test/                # testes de ponta a ponta da API (npm test)
└── frontend/src/
    ├── api.js               # cliente fetch para /api
    ├── context/             # sessão do jogador (AuthProvider, useAuth)
    ├── pages/               # início, login/cadastro, confirmar e-mail, senha, painel (/app)
    ├── components/          # abas do painel, árvore (TreeDisplay), modais, avisos
    └── styles/              # base, landing, auth, app
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

As tabelas são criadas automaticamente na primeira requisição (em desenvolvimento, no arquivo
`backend/arvore.db`):

| Tabela | Conteúdo |
|---|---|
| `users` | conta, inventário (sementes, moedas, fertilizante, proteção) e estado da árvore atual |
| `sessions` | hash dos tokens de sessão (7 dias) |
| `pending_registrations` | cadastros aguardando confirmação do e-mail (24 h) |
| `password_resets` | hash dos links de nova senha (1 h, uso único) |
| `rate_limits` | contadores dos limites de tentativas |
| `mission_completions` | missões concluídas por jogador (`mission_key`) |
| `reward_claims` | recompensas resgatadas (`reward_key`) |
| `forest_trees` | árvores que completaram os 14 dias |

O texto das missões e recompensas **não** fica no banco: vem de `backend/catalog/`. Editar um texto
vale para todos no próximo deploy. Só nunca altere a `key` de um item existente (é o que o banco guarda).

## Rodar localmente

Requer **Node.js 22 ou mais recente**.

```bash
npm install     # instala backend e frontend
npm run dev     # API em :3001 + site em http://localhost:5173
npm test        # compila o frontend e roda os testes da API
```

Em desenvolvimento o Vite repassa `/api` para o backend (mesma origem, sem CORS) e o banco é o arquivo
`backend/arvore.db`. Sem SMTP configurado, os e-mails de confirmação e de senha **aparecem no terminal**
do backend, com o link para abrir. Configuração opcional: copie `backend/.env.example` para `backend/.env`.

## Deploy na Vercel

O projeto usa [Vercel Services](https://vercel.com/docs/services): um único projeto e um único domínio com
dois serviços, cada um compilado separadamente. O `vercel.json` já define tudo:

| Serviço | Pasta | O que é | Rota pública |
|---|---|---|---|
| `backend` | `backend/` | API Express (entrada `vercel.js`) | `/api/*` (recebe o caminho completo, ex.: `/api/auth/me`) |
| `frontend` | `frontend/` | site Vite estático; rotas como `/app` caem no `index.html` | todo o resto |

Não há chamadas internas entre serviços: o navegador chama `/api` pela rota pública, no mesmo domínio.
Para testar os dois juntos localmente como na Vercel, use `vercel dev`. Para o deploy faltam três coisas:

1. **Banco (Turso)** — em [turso.tech](https://turso.tech), crie uma conta e um banco (escolha a região
   mais próxima das funções da Vercel, que por padrão rodam em Washington, EUA). Copie a URL do banco
   (`libsql://…`), gere um token e cadastre na Vercel as variáveis `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
   As tabelas são criadas sozinhas na primeira requisição.
2. **E-mail (SMTP)** — crie uma conta num provedor (Brevo, Resend, Amazon SES, Mailgun…), verifique o seu
   domínio nele (registros SPF/DKIM no DNS, para os e-mails não caírem no spam) e cadastre na Vercel:

   | Variável | Valor |
   |---|---|
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | dados SMTP do provedor |
   | `MAIL_FROM` | remetente do domínio verificado, ex.: `Árvore da Amazônia <nao-responda@seudominio.com.br>` |
   | `APP_URL` | só se usar domínio próprio, ex.: `https://arvore.seudominio.com.br` |

3. **Projeto** — em [vercel.com/new](https://vercel.com/new), importe este repositório do GitHub e clique
   em Deploy. A cada `git push` na `main`, um novo deploy sai sozinho.

Confira em `https://SEU-PROJETO.vercel.app/api/health` (deve responder `{"ok":true}`). Se faltar alguma
variável, a API responde "Servidor em manutenção" e o log da função (Vercel → Logs) diz exatamente o que
falta.

**Prévias**: cada pull request ganha um endereço de prévia. Se as variáveis do Turso valerem também para
"Preview", as prévias usam o mesmo banco da produção; para isolar, crie um segundo banco no Turso e
cadastre-o só no ambiente Preview.

## Segurança

- **Contas**: o cadastro só vira conta após confirmar o e-mail. Cadastro, reenvio e "esqueci a senha" respondem
  igual (e no mesmo tempo, pois gravações e e-mails acontecem depois da resposta) com ou sem conta, então
  ninguém descobre quais e-mails estão cadastrados. Se o e-mail já tem conta, o dono recebe um aviso.
- **Senhas**: só o hash bcrypt (custo 11) é guardado; 6 a 72 caracteres (limite do bcrypt). Trocar a senha
  encerra todas as sessões abertas e avisa o dono por e-mail.
- **Tokens** (sessão, confirmação, nova senha): 256 bits aleatórios; o banco guarda só o hash SHA-256. Links
  expiram (24 h / 1 h), valem uma vez e levam o token depois do `#`, que não vai para logs de servidor.
  Os links usam sempre `APP_URL` (ou o domínio da Vercel), nunca o cabeçalho `Host` da requisição.
- **Sessão**: cookie `HttpOnly`, `SameSite=Strict` e, em produção, `Secure` com prefixo `__Host-`. Expira em 7 dias.
- **CSRF**: além do `SameSite=Strict`, ações (POST/PATCH) vindas de outro site são recusadas (`Sec-Fetch-Site`/`Origin`).
- **Concorrência**: ações que verificam e alteram o estado (regar, plantar, resgatar, concluir missão, confirmar
  e-mail) rodam em transações de escrita; dois cliques simultâneos não passam juntos pela verificação.
- **Abuso**: login com até 10 erros por conta e 30 por IP a cada 15 min; até 5 e-mails por hora para um mesmo
  endereço; cadastros e links inválidos limitados por IP (contadores no banco, valem para todas as instâncias);
  1000 requisições por minuto por IP no geral.
- **Cabeçalhos**: CSP só com recursos do próprio site (inclusive as fontes, sem Google Fonts), anti-iframe,
  `nosniff`, HSTS e `no-store` nas respostas da API — na API pelo Express e nas páginas pelo serviço `frontend` do `vercel.json`
  (um teste garante que os dois são iguais).
- **Entradas**: corpo limitado a 10 KB, SQL sempre parametrizado, nomes sem caracteres invisíveis e só com
  alfabeto latino (contra imitações), nomes de guardião únicos sem diferenciar maiúsculas.
- **Dependências**: `.npmrc` com `ignore-scripts=true` nos dois projetos (nenhum pacote roda código na instalação).
- **Repositório**: `.env`, bancos SQLite, `node_modules` e o build ficam fora do Git (`.gitignore`).
