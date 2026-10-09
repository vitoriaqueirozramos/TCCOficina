# Banco de dados local

## Requisitos

- MySQL Server 8.0.16 ou superior.
- MySQL Workbench ou cliente `mysql`.

## Criar o banco pelo MySQL Workbench

1. Abra uma conexão local no MySQL Workbench.
2. Abra `database/schema.sql` em uma nova aba SQL.
3. Execute o script completo pelo botão de execução.
4. Atualize a lista de schemas e confirme o banco `oficinatech`.
5. Confira as 13 tabelas, a view `vw_saldo_estoque`, os 3 perfis e os 7 status iniciais.

O script cria o schema `oficinatech`; execute em uma instância de desenvolvimento limpa. Ele não é idempotente para tabelas: não o execute novamente sobre uma instalação existente. Para retestar do zero, use uma instância descartável sem o schema, preservando qualquer banco que contenha dados úteis.

## Verificações após a execução

Com `.env` configurado, execute `npm run db:verify` para conferir tabelas, view, perfis, status, FKs e restrições `CHECK`. Também é possível executar estas consultas no Workbench:
Com `.env` configurado, execute `npm run db:verify` para conferir tabelas, view, perfis, status, FKs e restrições `CHECK`. Execute `npm run db:test` para testar violações reais de `UNIQUE`, FK e `CHECK`; o teste usa uma transação e termina com rollback. Também é possível executar estas consultas no Workbench:

```sql
SELECT COUNT(*) AS total_tabelas
FROM information_schema.tables
WHERE table_schema = 'oficinatech'
  AND table_type = 'BASE TABLE';

SELECT COUNT(*) AS total_perfis FROM oficinatech.perfis;
SELECT COUNT(*) AS total_status FROM oficinatech.status_os;
SHOW FULL TABLES IN oficinatech;
```

Resultados esperados: 13 tabelas, 3 perfis, 7 status, e `vw_saldo_estoque` listada como view. Depois, testar as FKs e `CHECK`s com registros de desenvolvimento descartáveis.

## Credenciais

O script não cria usuários MySQL nem contém senhas. Use credenciais locais do servidor e não as registre no repositório. A configuração da conexão da aplicação será documentada quando a estrutura Node.js for criada.
