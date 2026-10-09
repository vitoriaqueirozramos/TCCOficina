-- OFICINATECH: schema inicial MySQL 8.0.16+
-- Gerado a partir de docs/modelo-logico.md (baseline v1).
-- Execute em uma instância/banco limpo. Não é um mecanismo de migração.

CREATE DATABASE IF NOT EXISTS oficinatech
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE oficinatech;

CREATE TABLE perfis (
  id_perfil INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(30) NOT NULL,
  descricao VARCHAR(150) NULL,
  PRIMARY KEY (id_perfil),
  CONSTRAINT uq_perfis_nome UNIQUE (nome)
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id_usuario INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_perfil INT UNSIGNED NOT NULL,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario),
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT fk_usuarios_perfis
    FOREIGN KEY (id_perfil) REFERENCES perfis (id_perfil)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE clientes (
  id_cliente INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  documento VARCHAR(20) NULL,
  telefone VARCHAR(20) NULL,
  email VARCHAR(254) NULL,
  endereco VARCHAR(255) NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_cliente),
  CONSTRAINT uq_clientes_documento UNIQUE (documento)
) ENGINE=InnoDB;

CREATE TABLE veiculos (
  id_veiculo INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cliente INT UNSIGNED NOT NULL,
  placa VARCHAR(10) NOT NULL,
  chassi VARCHAR(30) NULL,
  marca VARCHAR(60) NOT NULL,
  modelo VARCHAR(80) NOT NULL,
  ano SMALLINT UNSIGNED NULL,
  cor VARCHAR(40) NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_veiculo),
  CONSTRAINT uq_veiculos_placa UNIQUE (placa),
  CONSTRAINT uq_veiculos_chassi UNIQUE (chassi),
  KEY ix_veiculos_cliente (id_cliente),
  CONSTRAINT fk_veiculos_clientes
    FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE mecanicos (
  id_mecanico INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario INT UNSIGNED NOT NULL,
  especialidade VARCHAR(100) NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_mecanico),
  CONSTRAINT uq_mecanicos_usuario UNIQUE (id_usuario),
  CONSTRAINT fk_mecanicos_usuarios
    FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE servicos (
  id_servico INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  preco_atual DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_servico),
  CONSTRAINT chk_servicos_preco CHECK (preco_atual >= 0)
) ENGINE=InnoDB;

CREATE TABLE pecas (
  id_peca INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  preco_atual DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  estoque_minimo INT UNSIGNED NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_peca),
  CONSTRAINT uq_pecas_codigo UNIQUE (codigo),
  CONSTRAINT chk_pecas_preco CHECK (preco_atual >= 0)
) ENGINE=InnoDB;

CREATE TABLE status_os (
  id_status_os INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(32) NOT NULL,
  nome VARCHAR(50) NOT NULL,
  PRIMARY KEY (id_status_os),
  CONSTRAINT uq_status_os_codigo UNIQUE (codigo),
  CONSTRAINT uq_status_os_nome UNIQUE (nome)
) ENGINE=InnoDB;

CREATE TABLE ordens_servico (
  id_os INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cliente INT UNSIGNED NOT NULL,
  id_veiculo INT UNSIGNED NOT NULL,
  id_mecanico INT UNSIGNED NULL,
  id_status_os INT UNSIGNED NOT NULL,
  aberta_por INT UNSIGNED NOT NULL,
  aberta_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previsao_conclusao DATETIME NULL,
  concluida_em DATETIME NULL,
  quilometragem_entrada INT UNSIGNED NULL,
  diagnostico TEXT NULL,
  observacoes TEXT NULL,
  PRIMARY KEY (id_os),
  KEY ix_os_cliente_data (id_cliente, aberta_em),
  KEY ix_os_veiculo_data (id_veiculo, aberta_em),
  KEY ix_os_status_data (id_status_os, aberta_em),
  KEY ix_os_mecanico_status (id_mecanico, id_status_os),
  KEY ix_os_aberta_por (aberta_por),
  CONSTRAINT fk_os_clientes
    FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_os_veiculos
    FOREIGN KEY (id_veiculo) REFERENCES veiculos (id_veiculo)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_os_mecanicos
    FOREIGN KEY (id_mecanico) REFERENCES mecanicos (id_mecanico)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_os_status
    FOREIGN KEY (id_status_os) REFERENCES status_os (id_status_os)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_os_usuarios_abertura
    FOREIGN KEY (aberta_por) REFERENCES usuarios (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE os_servicos (
  id_os_servico INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_os INT UNSIGNED NOT NULL,
  id_servico INT UNSIGNED NOT NULL,
  descricao_snapshot VARCHAR(150) NOT NULL,
  quantidade DECIMAL(10,2) NOT NULL,
  valor_unitario DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id_os_servico),
  KEY ix_os_servicos_os (id_os),
  KEY ix_os_servicos_servico (id_servico),
  CONSTRAINT chk_os_servicos_quantidade CHECK (quantidade > 0),
  CONSTRAINT chk_os_servicos_valor CHECK (valor_unitario >= 0),
  CONSTRAINT fk_os_servicos_os
    FOREIGN KEY (id_os) REFERENCES ordens_servico (id_os)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_os_servicos_catalogo
    FOREIGN KEY (id_servico) REFERENCES servicos (id_servico)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE os_pecas (
  id_os_peca INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_os INT UNSIGNED NOT NULL,
  id_peca INT UNSIGNED NOT NULL,
  descricao_snapshot VARCHAR(150) NOT NULL,
  quantidade INT UNSIGNED NOT NULL,
  valor_unitario DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id_os_peca),
  CONSTRAINT uq_os_pecas_item_peca UNIQUE (id_os_peca, id_peca),
  KEY ix_os_pecas_os (id_os),
  KEY ix_os_pecas_peca (id_peca),
  CONSTRAINT chk_os_pecas_quantidade CHECK (quantidade > 0),
  CONSTRAINT chk_os_pecas_valor CHECK (valor_unitario >= 0),
  CONSTRAINT fk_os_pecas_os
    FOREIGN KEY (id_os) REFERENCES ordens_servico (id_os)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_os_pecas_catalogo
    FOREIGN KEY (id_peca) REFERENCES pecas (id_peca)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE movimentos_estoque (
  id_movimento INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_peca INT UNSIGNED NOT NULL,
  id_os_peca INT UNSIGNED NULL,
  registrado_por INT UNSIGNED NOT NULL,
  quantidade_delta INT NOT NULL,
  motivo VARCHAR(20) NOT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao VARCHAR(255) NULL,
  PRIMARY KEY (id_movimento),
  KEY ix_movimentos_peca_data (id_peca, criado_em),
  KEY ix_movimentos_item_os (id_os_peca),
  KEY ix_movimentos_usuario (registrado_por),
  CONSTRAINT chk_movimentos_delta CHECK (quantidade_delta <> 0),
  CONSTRAINT chk_movimentos_motivo CHECK (
    (motivo = 'ENTRADA' AND quantidade_delta > 0 AND id_os_peca IS NULL)
    OR (motivo = 'CONSUMO_OS' AND quantidade_delta < 0 AND id_os_peca IS NOT NULL)
    OR (motivo = 'AJUSTE' AND quantidade_delta <> 0)
    OR (motivo = 'ESTORNO' AND id_os_peca IS NOT NULL AND quantidade_delta <> 0)
  ),
  CONSTRAINT fk_movimentos_pecas
    FOREIGN KEY (id_peca) REFERENCES pecas (id_peca)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_movimentos_os_pecas
    FOREIGN KEY (id_os_peca, id_peca)
    REFERENCES os_pecas (id_os_peca, id_peca)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_movimentos_usuarios
    FOREIGN KEY (registrado_por) REFERENCES usuarios (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE historico_status_os (
  id_historico_status INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_os INT UNSIGNED NOT NULL,
  id_status_anterior INT UNSIGNED NULL,
  id_status_novo INT UNSIGNED NOT NULL,
  alterado_por INT UNSIGNED NOT NULL,
  alterado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacao VARCHAR(255) NULL,
  PRIMARY KEY (id_historico_status),
  KEY ix_historico_status_os_data (id_os, alterado_em),
  KEY ix_historico_status_anterior (id_status_anterior),
  KEY ix_historico_status_novo (id_status_novo),
  KEY ix_historico_status_usuario (alterado_por),
  CONSTRAINT fk_historico_status_os
    FOREIGN KEY (id_os) REFERENCES ordens_servico (id_os)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_historico_status_anterior
    FOREIGN KEY (id_status_anterior) REFERENCES status_os (id_status_os)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_historico_status_novo
    FOREIGN KEY (id_status_novo) REFERENCES status_os (id_status_os)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_historico_status_usuarios
    FOREIGN KEY (alterado_por) REFERENCES usuarios (id_usuario)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT IGNORE INTO perfis (nome, descricao) VALUES
  ('ADMINISTRADOR', 'Gerencia usuários e configurações administrativas'),
  ('ATENDENTE', 'Gerencia clientes, veículos e ordens de serviço'),
  ('MECANICO', 'Consulta e atualiza ordens de serviço atribuídas');

INSERT IGNORE INTO status_os (codigo, nome) VALUES
  ('ABERTA', 'Aberta'),
  ('EM_DIAGNOSTICO', 'Em diagnóstico'),
  ('AGUARDANDO_APROVACAO', 'Aguardando aprovação'),
  ('AGUARDANDO_PECAS', 'Aguardando peças'),
  ('EM_EXECUCAO', 'Em execução'),
  ('CONCLUIDA', 'Concluída'),
  ('CANCELADA', 'Cancelada');

CREATE OR REPLACE VIEW vw_saldo_estoque AS
SELECT
  p.id_peca,
  p.codigo,
  p.nome,
  p.estoque_minimo,
  p.ativo,
  COALESCE(SUM(m.quantidade_delta), 0) AS saldo_atual
FROM pecas AS p
LEFT JOIN movimentos_estoque AS m ON m.id_peca = p.id_peca
GROUP BY p.id_peca, p.codigo, p.nome, p.estoque_minimo, p.ativo;
