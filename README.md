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
- Testes: `npm test`.
- Verificar schema e restrições do MySQL: `npm run db:verify` e `npm run db:test`.
- Verificar login com usuário temporário: `npm run auth:verify`.
- Criar o primeiro administrador: `npm run admin:create -- "Nome" "email@oficina.com"` (a senha é digitada sem eco no terminal).

Com o servidor iniciado, acesse o dashboard em `http://localhost:3000`.
O formulário de acesso fica em `http://localhost:3000/login.html`. A API autentica com `POST /api/auth/login`, encerra o acesso com `POST /api/auth/logout` e retorna a conta atual em `GET /api/auth/me`.

A API inicia sem depender do banco. `GET /api/health` verifica o processo; `GET /api/health/database` tenta uma conexão e responde `503` se a configuração ou o MySQL estiver indisponível.
