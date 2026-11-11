-- OFICINATECH: migração 002 — catálogo de peças, duração de serviços e saídas de estoque.
-- Aplicar com `npm run db:migrate:estoque` (o script confere cada passo antes de executar).
-- Não remove nem altera dados existentes: apenas acrescenta colunas, uma opção ao CHECK e colunas à view.

ALTER TABLE pecas
  ADD COLUMN categoria VARCHAR(40) NOT NULL DEFAULT 'Geral' AFTER descricao,
  ADD COLUMN unidade VARCHAR(10) NOT NULL DEFAULT 'UN' AFTER categoria,
  ADD COLUMN preco_custo DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER unidade,
  ADD CONSTRAINT chk_pecas_custo CHECK (preco_custo >= 0);

ALTER TABLE servicos
  ADD COLUMN duracao_minutos SMALLINT UNSIGNED NULL AFTER preco_atual;

-- `motivo` continua sendo o tipo do movimento; `justificativa` guarda o motivo informado pelo usuário.
ALTER TABLE movimentos_estoque
  ADD COLUMN justificativa VARCHAR(60) NULL AFTER motivo;

ALTER TABLE movimentos_estoque
  DROP CHECK chk_movimentos_motivo;

ALTER TABLE movimentos_estoque
  ADD CONSTRAINT chk_movimentos_motivo CHECK (
    (motivo = 'ENTRADA' AND quantidade_delta > 0 AND id_os_peca IS NULL)
    OR (motivo = 'SAIDA' AND quantidade_delta < 0 AND id_os_peca IS NULL)
    OR (motivo = 'CONSUMO_OS' AND quantidade_delta < 0 AND id_os_peca IS NOT NULL)
    OR (motivo = 'AJUSTE' AND quantidade_delta <> 0)
    OR (motivo = 'ESTORNO' AND id_os_peca IS NOT NULL AND quantidade_delta <> 0)
  );

CREATE OR REPLACE SQL SECURITY INVOKER VIEW vw_saldo_estoque AS
SELECT
  p.id_peca,
  p.codigo,
  p.nome,
  p.estoque_minimo,
  p.ativo,
  COALESCE(SUM(m.quantidade_delta), 0) AS saldo_atual,
  p.categoria,
  p.unidade,
  p.preco_custo,
  p.preco_atual,
  CASE
    WHEN COALESCE(SUM(m.quantidade_delta), 0) <= 0 THEN 'SEM_ESTOQUE'
    WHEN COALESCE(SUM(m.quantidade_delta), 0) < p.estoque_minimo THEN 'BAIXO'
    ELSE 'DISPONIVEL'
  END AS situacao
FROM pecas AS p
LEFT JOIN movimentos_estoque AS m ON m.id_peca = p.id_peca
GROUP BY p.id_peca, p.codigo, p.nome, p.estoque_minimo, p.ativo,
         p.categoria, p.unidade, p.preco_custo, p.preco_atual;
