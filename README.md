# OFICINATECH

Sistema Web de Gerenciamento de Oficina Mecânica.

## Requisitos locais

- Node.js 20 ou superior.
- MySQL Server 8.0.16 ou superior para os endpoints que acessam o banco.

## Preparação

1. Crie o banco seguindo [database/README.md](database/README.md).
2. Copie `.env.example` para `.env` e configure as credenciais de um usuário MySQL próprio da aplicação. Não use a conta `root` em runtime.
3. Instale as dependências com `npm install`.

No ambiente local atual, `.env` usa a conta `root` informada para o bootstrap. Antes de publicar ou usar fora do desenvolvimento, substitua por um usuário MySQL exclusivo com privilégios mínimos.

## Executar

- Desenvolvimento com reinício automático: `npm run dev`.
- Execução normal: `npm start`.
- Testes de integração: `npm test` (inicia a API automaticamente em uma porta efêmera e a encerra ao final).
- Verificar schema e restrições do MySQL: `npm run db:verify` e `npm run db:test`.
- Migrar uma instalação existente para remoção lógica de itens OS: `npm run db:migrate:os-items`.
- Renomear rótulos antigos de mecânicos gerados por testes para nomes sintéticos de demonstração: `npm run db:rename-placeholder-mechanics`.
- Verificar login com usuário temporário: `npm run auth:verify`.
- Criar o primeiro administrador: `npm run admin:create -- "Nome" "email@oficina.com"` (a senha é digitada sem eco no terminal).
- Criar uma conta de atendente: `npm run usuario:create -- ATENDENTE "Nome" "email@oficina.com"`.
- Criar uma conta de mecânico: `npm run usuario:create -- MECANICO "Nome" "email@oficina.com" "Especialidade"` (a senha é digitada sem eco e o cadastro profissional é criado junto).

Com o servidor iniciado, acesse o dashboard em `http://localhost:3000`.
O formulário de acesso fica em `http://localhost:3000/login.html`. A API autentica com `POST /api/auth/login`, encerra o acesso com `POST /api/auth/logout` e retorna a conta atual em `GET /api/auth/me`.

A API inicia sem depender do banco. `GET /api/health` verifica o processo; `GET /api/health/database` tenta uma conexão e responde `503` se a configuração ou o MySQL estiver indisponível.

## Status da entrega e roteiro de demonstração

A implementação atual está em estágio funcional de demonstração local. Os módulos principais já estão validados em integração real com MySQL e a aplicação pode ser apresentada seguindo o roteiro em [docs/apresentacao-demo.md](docs/apresentacao-demo.md).

- Dashboard com métricas reais
- Login e autorização por perfil
- Cadastros de clientes, veículos, mecânicos, serviços e peças
- Estoque e movimentações
- Ordens de serviço com itens e histórico de status
- Suite de testes automatizados em execução local

## Observações finais

- O projeto foi pensado para uso em ambiente local de desenvolvimento.
- Os arquivos de ambiente ficam localmente fora do controle de versionamento.
- A criação de usuários administrativos é feita via comando seguro no terminal, sem expor a senha no console.

## Publicação (TiDB Cloud + Vercel)

O sistema roda localmente com MySQL 8 e também pode ser publicado com o banco no TiDB Cloud e a aplicação na Vercel.

### Banco no TiDB Cloud

1. Crie um cluster Serverless e copie host, usuário e senha (botão Connect).
2. Crie o arquivo `.env.tidb` na raiz (ele é ignorado pelo Git) com `DB_HOST`, `DB_PORT=4000`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` e `DB_SSL=true`.
3. Rode `npm run db:copy-cloud` para simular e `npm run db:copy-cloud -- --apply` para copiar tabelas, dados e a view do banco local. O banco local é apenas lido e o destino precisa estar vazio.

### Aplicação na Vercel

O arquivo `api/index.js` expõe a aplicação Express como função e o `vercel.json` encaminha `/api/*` para ela. A pasta `public/` é servida diretamente.

Variáveis de ambiente a cadastrar no projeto da Vercel:

| Variável | Obrigatória | Observação |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | sim | dados do TiDB Cloud |
| `DB_SSL` | sim | `true` |
| `JWT_SECRET` | sim | 32 caracteres ou mais |
| `DB_POOL_LIMIT` | não | padrão 3 na Vercel |
| `SESSION_MINUTES` | não | duração da sessão em minutos, padrão 480 |

### Testes

`npm test` recria e usa um banco separado, com o sufixo `_test`; o banco principal não é alterado.
