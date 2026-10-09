# OFICINATECH — Modelo lógico v1

**Estado:** baseline v1 usado para gerar `database/schema.sql` com autorização do usuário. Revisão externa e teste em MySQL continuam pendentes.

## Convenções

- Banco-alvo: MySQL 8.0.16 ou superior, InnoDB e `utf8mb4`.
- Chaves: `INT UNSIGNED AUTO_INCREMENT`.
- Datas armazenadas como `DATETIME`; valores monetários como `DECIMAL(10,2)`.
- Campos booleanos como `BOOLEAN` (`TINYINT(1)` no MySQL).
- Exclusão de entidades com histórico: inativação lógica. FKs históricas não usam exclusão em cascata.
- `NN` significa `NOT NULL`; `UQ` significa `UNIQUE`; `AI` significa `AUTO_INCREMENT`.
- A sintaxe abaixo é uma especificação lógica, não um script pronto para executar.

## Relações

### `perfis`

- `id_perfil INT UNSIGNED` — PK, AI, NN.
- `nome VARCHAR(30)` — NN, UQ.
- `descricao VARCHAR(150)` — NULL.

### `usuarios`

- `id_usuario INT UNSIGNED` — PK, AI, NN.
- `id_perfil INT UNSIGNED` — FK -> `perfis.id_perfil`, NN.
- `nome VARCHAR(120)` — NN.
- `email VARCHAR(254)` — NN, UQ.
- `senha_hash VARCHAR(255)` — NN.
- `ativo BOOLEAN` — NN, DEFAULT TRUE.
- `criado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP.
- `atualizado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP; atualizar em alterações.
- `atualizado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP, atualizar automaticamente em alterações.

### `clientes`

- `id_cliente INT UNSIGNED` — PK, AI, NN.
- `nome VARCHAR(120)` — NN.
- `documento VARCHAR(20)` — NULL, UQ; único quando informado.
- `telefone VARCHAR(20)` — NULL.
- `email VARCHAR(254)` — NULL.
- `endereco VARCHAR(255)` — NULL.
- `ativo BOOLEAN` — NN, DEFAULT TRUE.
- `criado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP.

### `veiculos`

- `id_veiculo INT UNSIGNED` — PK, AI, NN.
- `id_cliente INT UNSIGNED` — FK -> `clientes.id_cliente`, NN.
- `placa VARCHAR(10)` — NN, UQ; salvar normalizada em maiúsculas.
- `chassi VARCHAR(30)` — NULL, UQ.
- `marca VARCHAR(60)` — NN.
- `modelo VARCHAR(80)` — NN.
- `ano SMALLINT UNSIGNED` — NULL.
- `cor VARCHAR(40)` — NULL.
- `ativo BOOLEAN` — NN, DEFAULT TRUE.
- `criado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP.

### `mecanicos`

- `id_mecanico INT UNSIGNED` — PK, AI, NN.
- `id_usuario INT UNSIGNED` — FK -> `usuarios.id_usuario`, NN, UQ.
- `especialidade VARCHAR(100)` — NULL.
- `ativo BOOLEAN` — NN, DEFAULT TRUE.

### `servicos`

- `id_servico INT UNSIGNED` — PK, AI, NN.
- `nome VARCHAR(120)` — NN.
- `descricao TEXT` — NULL.
- `preco_atual DECIMAL(10,2)` — NN, DEFAULT 0, CHECK `>= 0`.
- `ativo BOOLEAN` — NN, DEFAULT TRUE.

### `pecas`

- `id_peca INT UNSIGNED` — PK, AI, NN.
- `codigo VARCHAR(40)` — NN, UQ.
- `nome VARCHAR(120)` — NN.
- `descricao TEXT` — NULL.
- `preco_atual DECIMAL(10,2)` — NN, DEFAULT 0, CHECK `>= 0`.
- `estoque_minimo INT UNSIGNED` — NN, DEFAULT 0.
- `ativo BOOLEAN` — NN, DEFAULT TRUE.

Não armazenar saldo atual nesta tabela. Consultar o saldo pela soma de `movimentos_estoque.quantidade_delta` para a peça.

### `status_os`

- `id_status_os INT UNSIGNED` — PK, AI, NN.
- `codigo VARCHAR(32)` — NN, UQ.
- `nome VARCHAR(50)` — NN, UQ.

Carga inicial de referência: `ABERTA`, `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO`, `AGUARDANDO_PECAS`, `EM_EXECUCAO`, `CONCLUIDA`, `CANCELADA`.

### `ordens_servico`

- `id_os INT UNSIGNED` — PK, AI, NN.
- `id_cliente INT UNSIGNED` — FK -> `clientes.id_cliente`, NN.
- `id_veiculo INT UNSIGNED` — FK -> `veiculos.id_veiculo`, NN.
- `id_mecanico INT UNSIGNED` — FK -> `mecanicos.id_mecanico`, NULL até atribuição.
- `id_status_os INT UNSIGNED` — FK -> `status_os.id_status_os`, NN.
- `aberta_por INT UNSIGNED` — FK -> `usuarios.id_usuario`, NN.
- `aberta_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP.
- `previsao_conclusao DATETIME` — NULL.
- `concluida_em DATETIME` — NULL.
- `quilometragem_entrada INT UNSIGNED` — NULL.
- `diagnostico TEXT` — NULL.
- `observacoes TEXT` — NULL.

Índices: `(id_cliente, aberta_em)`, `(id_veiculo, aberta_em)`, `(id_status_os, aberta_em)` e `(id_mecanico, id_status_os)`. Validar no serviço de aplicação que, na abertura, o cliente selecionado é o proprietário atual do veículo. A FK cliente/veículo é separada para preservar o cliente histórico da OS quando o proprietário mudar.

### `os_servicos`

- `id_os_servico INT UNSIGNED` — PK, AI, NN.
- `id_os INT UNSIGNED` — FK -> `ordens_servico.id_os`, NN.
- `id_servico INT UNSIGNED` — FK -> `servicos.id_servico`, NN.
- `descricao_snapshot VARCHAR(150)` — NN.
- `quantidade DECIMAL(10,2)` — NN, CHECK `> 0`.
- `valor_unitario DECIMAL(10,2)` — NN, CHECK `>= 0`.

Índice: `(id_os)`. Snapshot mantém descrição e preço praticados na data da OS.

### `os_pecas`

- `id_os_peca INT UNSIGNED` — PK, AI, NN.
- `id_os INT UNSIGNED` — FK -> `ordens_servico.id_os`, NN.
- `id_peca INT UNSIGNED` — FK -> `pecas.id_peca`, NN.
- `descricao_snapshot VARCHAR(150)` — NN.
- `quantidade INT UNSIGNED` — NN, CHECK `> 0`.
- `valor_unitario DECIMAL(10,2)` — NN, CHECK `>= 0`.
- Chave candidata adicional `UQ (id_os_peca, id_peca)` para permitir FK composta de consistência em `movimentos_estoque`.

Índice: `(id_os)`. A linha representa peça utilizada, não reserva futura.

### `movimentos_estoque`

- `id_movimento INT UNSIGNED` — PK, AI, NN.
- `id_peca INT UNSIGNED` — FK -> `pecas.id_peca`, NN.
- `id_os_peca INT UNSIGNED` — NULL; parte de FK composta -> `os_pecas(id_os_peca, id_peca)`.
- `registrado_por INT UNSIGNED` — FK -> `usuarios.id_usuario`, NN.
- `quantidade_delta INT` — NN, CHECK `<> 0`; positivo para entrada, negativo para saída.
- `motivo VARCHAR(20)` — NN, CHECK entre `ENTRADA`, `CONSUMO_OS`, `AJUSTE`, `ESTORNO`.
- `criado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP.
- `observacao VARCHAR(255)` — NULL.

Índices: `(id_peca, criado_em)` e `(id_os_peca)`. Aplicar também a consistência entre motivo, sinal e vínculo com OS em transação na aplicação; `CONSUMO_OS` e seu estorno devem apontar para o item utilizado. A FK composta impede que o movimento vincule um item de OS a uma peça diferente.

### `historico_status_os`

- `id_historico_status INT UNSIGNED` — PK, AI, NN.
- `id_os INT UNSIGNED` — FK -> `ordens_servico.id_os`, NN.
- `id_status_anterior INT UNSIGNED` — FK -> `status_os.id_status_os`, NULL no registro inicial.
- `id_status_novo INT UNSIGNED` — FK -> `status_os.id_status_os`, NN.
- `alterado_por INT UNSIGNED` — FK -> `usuarios.id_usuario`, NN.
- `alterado_em DATETIME` — NN, DEFAULT CURRENT_TIMESTAMP.
- `observacao VARCHAR(255)` — NULL.

Índice: `(id_os, alterado_em)`. Registrar status inicial na criação da OS; manter status atual em `ordens_servico` e atualizar histórico na mesma transação.

## Resumo das relações e cardinalidades

- `perfis` 1:N `usuarios`; `usuarios` 1:0..1 `mecanicos`.
- `clientes` 1:N `veiculos` e `clientes` 1:N `ordens_servico` históricas.
- `veiculos` 1:N `ordens_servico`; cada OS tem um cliente e veículo.
- `mecanicos` 1:N `ordens_servico`; a OS pode ter zero ou um mecânico.
- `status_os` 1:N `ordens_servico` e 1:N `historico_status_os` (anterior opcional, novo obrigatório).
- `ordens_servico` N:N `servicos` por `os_servicos`; N:N `pecas` por `os_pecas`.
- `pecas` 1:N `movimentos_estoque`; item de OS pode originar vários movimentos compensatórios.

## Normalização até 3FN

- **1FN:** cada coluna armazena um valor; serviços e peças da OS ficam em linhas próprias, não em listas ou colunas repetidas.
- **2FN:** tabelas associativas guardam atributos do vínculo (quantidade, preço e descrição daquele item); não há atributos dependentes apenas de parte de uma chave composta. Foram escolhidas PKs substitutas para facilitar referências e auditoria.
- **3FN:** dados do perfil, cliente, veículo, mecânico, serviço, peça e status ficam em suas tabelas próprias. Nome de perfil/status e dados atuais do catálogo não são repetidos nas entidades que os referenciam. Saldo de estoque e total da OS não são persistidos porque são derivados de movimentos e itens.
- **Snapshots são intencionais:** descrição e preço em `os_servicos`/`os_pecas` registram o valor histórico praticado, não uma cópia acidental de atributo atual do catálogo.

## Restrições que exigem transação/aplicação

- Validar que o cliente é o proprietário do veículo ao abrir OS.
- Validar transições permitidas de status, autorização do perfil e bloqueio de alterações em OS terminal.
- Exigir pelo menos um item (serviço ou peça) para concluir OS.
- Inserir item da OS e movimento de estoque atomicamente; não permitir saldo negativo.
- Ao cancelar ou desfazer consumo, adicionar movimento compensatório, sem excluir movimentos anteriores.
- Calcular total como soma de `quantidade * valor_unitario` nos itens de serviço e peça.

## Próximas revisões

- [ ] Confirmar o baseline com orientador/usuários da oficina.
- [ ] Conferir compatibilidade das FKs e regras com o DER após a revisão.
- [ ] Gerar e testar o SQL somente depois da aprovação do modelo.
- [x] Gerar a primeira versão do SQL em `database/schema.sql` a partir deste baseline.
- [ ] Revisar e testar o script em uma instância MySQL limpa.
- [ ] Validar o baseline com orientador/usuários e propagar ajustes para DER, modelo lógico e SQL.
