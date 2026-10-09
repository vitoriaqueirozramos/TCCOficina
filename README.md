# OFICINATECH

Sistema Web de Gerenciamento de Oficina Mecânica.

## Requisitos locais

- Node.js 20 ou superior.
- MySQL Server 8.0.16 ou superior para os endpoints que acessam o banco.

## Preparação

1. Crie o banco seguindo [database/README.md](database/README.md).
2. Copie `.env.example` para `.env` e configure as credenciais de um usuário MySQL próprio da aplicação. Não use a conta `root` em runtime.
3. Instale as dependências com `npm install`.

## Executar

- Desenvolvimento com reinício automático: `npm run dev`.
- Execução normal: `npm start`.
- Testes: `npm test`.

Com o servidor iniciado, acesse o dashboard em `http://localhost:3000`.

A API inicia sem depender do banco. `GET /api/health` verifica o processo; `GET /api/health/database` tenta uma conexão e responde `503` se a configuração ou o MySQL estiver indisponível.
