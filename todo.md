# OFICINATECH — Plano do Projeto

Sistema Web de Gerenciamento de Oficina Mecânica

> Objetivo: centralizar o gerenciamento de clientes, veículos, mecânicos, serviços, peças e ordens de serviço para pequenas e médias oficinas.
>
> Problema de pesquisa: como um sistema web pode auxiliar na organização e no gerenciamento das informações e serviços de uma oficina mecânica?

## Como usar este checklist

- Marque uma tarefa como concluída somente depois de revisar seu entregável.
- Não avance para a implementação antes de validar o modelo de dados e as regras de negócio.
- Mantenha DER, modelo lógico, SQL e código sincronizados. Uma alteração em uma dessas partes exige revisar as demais.
- Registre decisões e mudanças relevantes na documentação do projeto.

## Escopo aprovado

### Incluído

- [ ] Autenticação e controle de acesso por perfil.
- [ ] Cadastro, consulta, edição e exclusão de clientes.
- [ ] Cadastro e gerenciamento dos veículos vinculados aos clientes.
- [ ] Cadastro e gerenciamento de mecânicos.
- [ ] Cadastro e gerenciamento de serviços oferecidos.
- [ ] Cadastro de peças e controle básico de estoque.
- [ ] Criação e acompanhamento de ordens de serviço (OS).
- [ ] Associação de serviços, peças e mecânico responsável à OS.
- [ ] Atualização do status e consulta ao histórico dos veículos.
- [ ] Pesquisa, filtros e dashboard administrativo.
- [ ] Testes das principais funcionalidades e documentação do TCC.

### Fora do escopo inicial

- [ ] Não implementar aplicativo mobile.
- [ ] Não implementar pagamento online ou emissão de nota fiscal.
- [ ] Não integrar com WhatsApp, sistemas governamentais ou fornecedores.
- [ ] Não implementar rastreamento GPS nem inteligência artificial.

## Fase 1 — Requisitos e decisões

- [x] Revisar os requisitos funcionais RF01–RF16 e não funcionais RNF01–RNF07.
- [x] Revisar as regras de negócio RN01–RN11 e esclarecer ambiguidades para o baseline v1.
- [x] Definir os perfis e permissões iniciais: administrador, atendente/administrativo e mecânico.
- [x] Definir os status possíveis de uma OS e transições iniciais.
- [x] Definir campos obrigatórios, formatos, validações e política inicial de exclusão/arquivamento.
- [x] Definir cálculo do valor dos itens e total da OS; sem descontos no baseline v1.
- [x] Definir comportamento inicial do estoque ao adicionar, remover, cancelar ou concluir itens.
- [x] Registrar as decisões em `docs/requisitos-e-regras.md` (baseline revisável).

**Concluída quando:** requisitos, perfis, status e regras financeiras/estoque estiverem escritos e sem conflitos.

## Fase 2 — DER (próximo passo)

- [x] Identificar entidades e responsabilidades a partir dos requisitos e regras.
- [x] Levantar atributos e identificar dados obrigatórios, opcionais e únicos (baseline v1).
- [x] Definir PKs, FKs, cardinalidades e associações N:N (baseline v1).
- [x] Representar cliente/veículo, mecânico/OS e histórico de status/estoque.
- [x] Revisar a cobertura conceitual das regras RN01–RN11 e requisitos RF01–RF16.
- [x] Registrar o DER de trabalho em `docs/der-oficinatech.md`.
- [ ] Validar o DER com orientador/usuários e registrar eventuais ajustes no baseline.

**Concluída quando:** toda entidade, atributo e relacionamento estiver justificado por requisito ou regra, com cardinalidades revisadas.

## Fase 3 — Modelo lógico e normalização

- [x] Converter o DER de trabalho em tabelas relacionais (proposta v1).
- [x] Definir nomes, tipos, nulabilidade, valores padrão e restrições iniciais.
- [x] Documentar a análise de normalização até 3FN.
- [x] Conferir tabelas associativas, chaves, unicidade e integridade referencial.
- [x] Fazer revisão cruzada inicial dos requisitos de dados.
- [x] Salvar a proposta em `docs/modelo-logico.md`.
- [x] Autorizar geração do SQL a partir do baseline v1 (usuário autorizou; validação externa continua pendente).

**Concluída quando:** tabelas e restrições estiverem documentadas e coerentes com o DER e as regras de negócio.

## Fase 4 — Banco de dados MySQL

- [x] Definir MySQL 8.0.16+ e convenções de nomes e charset.
- [x] Confirmar MySQL Server 8.0.46 instalado e serviço `MySQL80` ativo na porta 3306.
- [x] Escrever o script inicial de criação em `database/schema.sql`.
- [x] Implementar PKs, FKs, `UNIQUE`, `NOT NULL`, `CHECK` e índices iniciais.
- [x] Inserir dados de referência idempotentes para perfis e status da OS.
- [ ] Criar dados de teste não sensíveis para desenvolvimento.
- [x] Executar o script em banco limpo e validar criação: 13 tabelas, uma view, 3 perfis, 7 status.
- [x] Testar restrições UNIQUE, FK e CHECK com `scripts/test-database-constraints.js`; rollback confirmado.
- [x] Testar restrições UNIQUE, FK e CHECK com `scripts/check-database-constraints.js`; rollback confirmado.
- [x] Documentar execução local inicial e cuidados com credenciais em `database/README.md`.
- [ ] Conferir equivalência entre SQL, DER e modelo lógico após execução.
- [x] Conferir a estrutura implantada contra o modelo: 13 tabelas, 19 FKs e 8 CHECKs.

**Concluída quando:** o banco pode ser recriado do zero pelo script e as restrições principais foram verificadas.

## Fase 5 — Estrutura Node.js e Express

- [x] Definir metadados, dependências e scripts no `package.json` (Node.js 20+).
- [x] Criar estrutura inicial para configuração, rotas e testes.
- [x] Configurar Express, rotas de saúde, 404 e tratamento centralizado de erros.
- [x] Configurar pool MySQL preguiçoso por variáveis de ambiente e `.env.example` sem credenciais reais.
- [x] Criar `.env` local com credenciais MySQL; arquivo ignorado pelo Git e não compartilhar.
- [ ] Criar usuário MySQL exclusivo com privilégios mínimos para a aplicação; o `.env` local usa `root` somente no ambiente de desenvolvimento.
- [x] Instalar dependências com `npm install` (77 pacotes; auditoria sem vulnerabilidades reportadas).
- [ ] Definir padrão de validação de entrada e consultas parametrizadas.
- [ ] Configurar logs úteis para desenvolvimento sem registrar senhas ou dados sensíveis.
- [x] Configurar logs de inicialização e erros sem expor a configuração do banco.
- [x] Criar instruções de instalação e execução no `README.md`.
- [ ] Executar `npm test` e validar a rota de saúde quando Node estiver disponível.
- [x] Executar `npm test` (9 testes passaram) e validar `GET /api/health` e `GET /` localmente.
- [x] Validar conexão da API com MySQL em `GET /api/health/database` (`connected`).

**Concluída quando:** aplicação inicia localmente, conecta ao MySQL e segue uma estrutura consistente documentada.

## Fase 6 — Interface e experiência

- [x] Definir a navegação inicial do dashboard; telas de cada fluxo continuam pendentes.
- [ ] Criar protótipos das telas essenciais e validar os fluxos antes de implementá-los.
- [x] Implementar o shell inicial em HTML semântico, CSS responsivo e JavaScript em `public/`.
- [x] Decidir não usar Bootstrap no shell inicial; manter HTML/CSS/JS sem framework de interface.
- [x] Exibir estados vazios e estado real da API/MySQL no dashboard inicial.
- [ ] Criar padrões de formulários, tabelas, estados vazios, carregamento e mensagens de erro/sucesso.
- [x] Aplicar acessibilidade básica no shell: landmarks, rótulos, foco visível, live status e movimento reduzido.
- [ ] Testar a interface em navegadores modernos e em larguras de tela comuns.
- [x] Validar o dashboard no Chromium em 1440 px e 390 px, sem overflow horizontal.
- [ ] Testar em outros navegadores modernos.

**Concluída quando:** fluxos principais podem ser percorridos sem inconsistência visual ou bloqueios de uso.

## Fase 7 — Autenticação e autorização

- [x] Implementar RF01: tela de login, endpoints de login/logout e consulta da conta autenticada.
- [x] Armazenar senha com bcrypt; comando de criação do primeiro administrador não ecoa a senha.
- [x] Implementar token JWT curto em cookie HttpOnly/SameSite e middleware de autorização por perfil.
- [ ] Aplicar autenticação e perfil às rotas de negócio conforme cada módulo for criado.
- [x] Validar entrada, limitar tentativas e revalidar no banco se a conta permanece ativa.
- [x] Testar acesso anônimo, perfil permitido/negado, senha incorreta/correta e conta inativada.
- [ ] Criar o primeiro administrador com `npm run admin:create -- "Nome" "email@oficina.com"`.
- [ ] Criar o primeiro administrador com `npm run admin:create -- "Nome" "email@oficina.com"`.
- [ ] Configurar `JWT_SECRET` persistente e aleatório nos ambientes de produção.

**Concluída quando:** autenticação e permissões foram verificadas no servidor para os fluxos e perfis definidos.

## Fase 8 — Cadastros básicos

- [ ] Implementar clientes (RF02–RF03): criar, listar, consultar, editar, excluir/arquivar e pesquisar.
- [ ] Implementar veículos (RF04–RF05): criar, listar, consultar, editar e vincular ao proprietário.
- [ ] Implementar mecânicos (RF06): criar, listar, consultar, editar e ativar/inativar conforme decisão.
- [ ] Implementar serviços (RF07): criar, listar, consultar e editar valores e descrições.
- [ ] Implementar peças (RF08): criar, listar, consultar e editar dados e preço.
- [ ] Implementar pesquisa, filtros, paginação (se necessária) e validação dos formulários.
- [ ] Testar relacionamentos e impedir exclusões que violem a integridade ou o histórico.

**Concluída quando:** operações permitidas funcionam ponta a ponta e os dados permanecem consistentes no MySQL.

## Fase 9 — Estoque

- [ ] Implementar consulta e atualização da quantidade em estoque (RF09).
- [ ] Definir e registrar entradas, saídas e ajustes de estoque.
- [ ] Validar quantidade disponível antes de consumir peças em uma OS.
- [ ] Evitar estoque negativo e inconsistência em operações simultâneas.
- [ ] Definir como cancelamentos e alterações de OS revertem ou ajustam o consumo.
- [ ] Testar movimentações e conferir saldo após cada cenário.

**Concluída quando:** o saldo pode ser explicado pelas movimentações e nenhum fluxo permitido deixa o estoque inconsistente.

## Fase 10 — Ordens de serviço e histórico

- [ ] Implementar criação e consulta de OS (RF10), vinculando cliente e veículo.
- [ ] Implementar inclusão, edição e remoção de serviços da OS (RF11).
- [ ] Implementar inclusão, edição e remoção de peças da OS (RF11), com validação de estoque.
- [ ] Atribuir um mecânico responsável por OS (RF12).
- [ ] Implementar status e transições permitidas (RF13).
- [ ] Calcular e persistir/exibir os valores conforme a regra aprovada (RN11).
- [ ] Atualizar estoque de forma consistente quando peças forem utilizadas (RN09).
- [ ] Impedir exclusão de OS concluída e preservar seu histórico (RN10).
- [ ] Implementar histórico por veículo (RF14), incluindo serviços e peças utilizados.
- [ ] Testar OS sem itens, com múltiplos itens, cancelada, concluída e com alteração de estoque.

**Concluída quando:** fluxo completo de abertura a conclusão preserva dados, valores, atribuição e estoque corretamente.

## Fase 11 — Dashboard

- [ ] Definir indicadores úteis e viáveis para a oficina, evitando métricas sem requisito.
- [ ] Implementar resumo administrativo (RF16) com dados reais do banco.
- [ ] Garantir que filtros e indicadores respeitem permissões e período selecionado, se aplicável.
- [ ] Conferir totais do dashboard com consultas e registros de teste.

**Concluída quando:** indicadores apresentados correspondem aos dados e podem ser conferidos.

## Fase 12 — Testes e qualidade

- [ ] Criar testes das regras de negócio críticas e dos cálculos da OS.
- [ ] Testar autenticação, autorização, validação e tratamento de erros.
- [ ] Testar CRUDs e relacionamentos dos cadastros.
- [ ] Testar estoque, concorrência relevante, cancelamento e conclusão de OS.
- [ ] Testar pesquisa, filtros, histórico e dashboard.
- [ ] Executar testes de integração com banco de desenvolvimento.
- [ ] Fazer teste manual dos principais fluxos por perfil.
- [ ] Corrigir defeitos e repetir os testes afetados.

**Concluída quando:** os fluxos críticos têm evidência de teste e não há defeitos bloqueadores conhecidos.

## Fase 13 — Segurança, documentação e entrega

- [ ] Revisar armazenamento de senhas, permissões, validações e consultas SQL parametrizadas.
- [ ] Remover segredos do código e confirmar que arquivos locais de ambiente não são versionados.
- [ ] Escrever instruções de instalação, configuração e execução no `README.md`.
- [ ] Documentar arquitetura, banco, requisitos, regras e principais fluxos.
- [ ] Atualizar DER, modelo lógico e SQL após mudanças feitas durante a implementação.
- [ ] Preparar dados e roteiro para demonstração sem usar dados pessoais reais.
- [ ] Registrar limitações e funcionalidades que ficaram fora do escopo.
- [ ] Revisar ortografia, referências e formatação da documentação do TCC conforme as orientações da instituição.
- [ ] Preparar apresentação: problema, justificativa, objetivos, método, solução, demonstração, testes e conclusão.
- [ ] Fazer ensaio da apresentação e validar o ambiente de demonstração.

**Concluída quando:** outra pessoa consegue instalar/entender o projeto e a apresentação demonstra os objetivos e os testes realizados.

## Requisitos de referência

- **RF01:** login.
- **RF02–RF03:** cadastro, edição e exclusão de clientes.
- **RF04–RF05:** cadastro de veículos e vínculo com proprietário.
- **RF06:** cadastro de mecânicos.
- **RF07:** cadastro de serviços.
- **RF08–RF09:** cadastro de peças e controle de estoque.
- **RF10–RF13:** criação, composição, atribuição e atualização de OS.
- **RF14:** histórico do veículo.
- **RF15:** pesquisa de registros.
- **RF16:** dashboard.
- **RNF01–RNF07:** interface intuitiva, banco relacional, senhas seguras, controle de acesso, mensagens claras, navegadores modernos e código organizado.

## Regras de negócio de referência

- **RN01–RN02:** cliente pode ter vários veículos; cada veículo pertence a um cliente.
- **RN03:** OS associada a cliente e veículo.
- **RN04–RN05:** OS pode conter serviços e peças.
- **RN06–RN07:** mecânico pode responder por várias OS; cada OS tem no máximo um responsável por vez.
- **RN08:** toda OS tem status.
- **RN09:** uso de peça atualiza estoque.
- **RN10:** OS concluída não pode ser excluída.
- **RN11:** total considera serviços e peças utilizados.
