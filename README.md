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
- Testes de integração: `npm test` (inicia a API automaticamente na porta 3000 e a encerra ao final).
- Verificar schema e restrições do MySQL: `npm run db:verify` e `npm run db:test`.
- Migrar uma instalação existente para remoção lógica de itens OS: `npm run db:migrate:os-items`.
- Verificar login com usuário temporário: `npm run auth:verify`.
- Criar o primeiro administrador: `npm run admin:create -- "Nome" "email@oficina.com"` (a senha é digitada sem eco no terminal).

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
