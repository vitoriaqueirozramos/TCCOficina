# Apresentação e roteiro de demonstração

## Visão geral do projeto

O OFICINATECH é uma aplicação local para gestão de oficina mecânica com foco em:

- clientes e veículos
- mecânicos e equipe
- serviços e peças
- estoque e movimentações
- ordens de serviço com histórico de status
- dashboard operacional
- autenticação por perfil

## Fluxo de demonstração recomendado

1. Acessar a tela de login em http://localhost:3000/login.html
2. Realizar login com um usuário administrador
3. Abrir o dashboard e validar os indicadores reais de estoque e ordens
4. Criar ou selecionar um cliente e veículo
5. Abrir uma ordem de serviço e associar serviços e peças
6. Atualizar o status da OS e verificar o histórico de transições
7. Acessar a tela de estoque para checar movimentações
8. Validar a consistência do sistema com o dashboard e registros do banco

## Credenciais e operação

- A aplicação usa autenticação via cookie HTTP-only com JWT
- Os perfis implementados são: ADMINISTRADOR, ATENDENTE e MECANICO
- Para criar um administrador novo, execute:

  npm run admin:create -- "Nome do Administrador" "admin@oficina.com"

A senha é solicitada sem eco no terminal e é armazenada com hash seguro.

## Checklist de apresentação

- problema e solução
- requisitos atendidos
- arquitetura simplificada
- fluxo principal da oficina
- evidência de testes automatizados
- limitações e próximos passos

## Evidência de validação

A suíte de testes integra a API com MySQL e foi executada com sucesso:

- comando: npm test
- resultado: 31 testes passaram, 0 falharam

## Limitações conhecidas

- o ambiente é local e não foi planejado para produção
- autenticação e banco seguem modelo de desenvolvimento local
- a solução prioriza funcionalidade e validação real em vez de uma interface comercial sofisticada
