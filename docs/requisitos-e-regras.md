# OFICINATECH — Requisitos e regras, baseline v1

**Estado:** decisões iniciais registradas para viabilizar o DER e o modelo lógico. São defaults de projeto, não validação formal do orientador/usuário da oficina; podem ser alterados antes do SQL.

## Perfis e acesso

- **Administrador:** gerencia usuários e cadastros; acesso administrativo ao sistema.
- **Atendente:** cadastra clientes e veículos, abre OS e acompanha serviços.
- **Mecânico:** consulta OS atribuídas, registra diagnóstico/serviços e atualiza o andamento permitido.
- Cada mecânico terá uma conta de usuário vinculada. A senha será armazenada com hash; permissões serão verificadas no servidor.

## Dados e validações iniciais

- Usuário: nome, e-mail único e senha são obrigatórios; perfil e situação ativo/inativo também.
- Cliente: nome obrigatório; documento (CPF ou CNPJ), telefone, e-mail e endereço opcionais. Documento único quando informado.
- Veículo: placa, marca e modelo obrigatórios; placa normalizada em maiúsculas e única. Chassi opcional e único quando informado. Ano e cor opcionais.
- Serviço: nome e preço não negativo obrigatórios; descrição opcional.
- Peça: código único, nome e preço não negativo obrigatórios; quantidade mínima de estoque não negativa.
- Preços usam duas casas decimais. Quantidade de peça é inteira; quantidade de serviço pode ser fracionária.
- Cadastros que participam de histórico são inativados/arquivados em vez de removidos fisicamente. OS concluídas ou canceladas não são apagadas.

## Ordem de serviço

- Uma OS é aberta para um cliente e um veículo; no momento da abertura, o cliente deve ser o proprietário atual do veículo.
- A OS guarda o cliente atendido como referência histórica. Uma futura troca do proprietário do veículo não modifica OS anteriores.
- A atribuição ao mecânico é opcional na abertura, mas, quando preenchida, deve referenciar um cadastro de mecânico ativo.
- Uma OS em aberto pode não ter itens. Para concluir, deve conter ao menos um serviço ou uma peça.
- O total é calculado pela soma de quantidade multiplicada pelo preço unitário registrado em cada linha. Descontos não fazem parte da versão inicial.
- Descrição e preço unitário dos itens são snapshots: alterações no catálogo não mudam OS já registradas.
- Alterações do status atual e inserção do respectivo histórico ocorrem na mesma transação.

## Status e transições

Códigos iniciais: `ABERTA`, `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO`, `AGUARDANDO_PECAS`, `EM_EXECUCAO`, `CONCLUIDA` e `CANCELADA`.

Transições permitidas no baseline:

- `ABERTA` -> `EM_DIAGNOSTICO` ou `CANCELADA`.
- `EM_DIAGNOSTICO` -> `AGUARDANDO_APROVACAO`, `AGUARDANDO_PECAS`, `EM_EXECUCAO` ou `CANCELADA`.
- `AGUARDANDO_APROVACAO` -> `AGUARDANDO_PECAS`, `EM_EXECUCAO` ou `CANCELADA`.
- `AGUARDANDO_PECAS` -> `EM_EXECUCAO` ou `CANCELADA`.
- `EM_EXECUCAO` -> `AGUARDANDO_PECAS`, `CONCLUIDA` ou `CANCELADA`.
- `CONCLUIDA` e `CANCELADA` são estados terminais na versão inicial.

A aplicação validará as transições e registrará status anterior, novo status, usuário e data. Mudanças posteriores no fluxo exigem atualizar requisitos, DER, modelo lógico e testes.

## Estoque

- O saldo é a soma das movimentações da peça; não há coluna de saldo duplicada no cadastro.
- Quantidade positiva representa entrada; quantidade negativa representa saída. Ajustes podem ser positivos ou negativos.
- Ao registrar uma peça como utilizada em OS, criar a linha da OS e a saída correspondente em uma transação; não permitir saldo negativo.
- Remoção de peça antes da conclusão e cancelamento de OS geram movimento compensatório, sem apagar movimentação efetivada.
- Movimentos registram peça, variação, motivo, usuário e data. Quando associados a um item de OS, a peça da movimentação deve ser a mesma peça do item.

## Escopo administrativo

A instalação inicial representa uma única oficina. Não será criada entidade de configuração da oficina neste baseline porque cadastro de dados da própria oficina não está descrito nos RF01–RF16. Se isso for requisito da banca/usuário, acrescentar o requisito antes da aprovação do modelo lógico.

## Revisão necessária

- [ ] Validar este baseline com o orientador e/ou usuários da oficina.
- [ ] Confirmar se status, transições, campos e política de estoque representam o processo real.
- [ ] Registrar alterações nos requisitos e propagar para DER, modelo lógico, SQL e testes.
