ALTER TABLE os_servicos
  ADD COLUMN removida_em DATETIME NULL;

ALTER TABLE os_pecas
  ADD COLUMN removida_em DATETIME NULL;
