# OFICINATECH — DER v1 (proposta)

**Estado:** proposta v1 alinhada ao baseline em `docs/requisitos-e-regras.md` e ao modelo lógico em `docs/modelo-logico.md`. Revisar/aprovar antes de gerar o SQL.

## Objetivo do modelo

Representar usuários e permissões, clientes e veículos, catálogo de serviços e peças, ordens de serviço, atribuição de mecânicos e histórico de estoque/status. Os nomes e tipos abaixo são conceituais; tipos MySQL, nulabilidade definitiva, índices e restrições serão especificados no modelo lógico.

## Diagrama

```mermaid
erDiagram
    PERFIS ||--o{ USUARIOS : "define"
    USUARIOS ||--o| MECANICOS : "possui cadastro profissional"
    CLIENTES ||--o{ VEICULOS : "e proprietario atual de"
    CLIENTES ||--o{ ORDENS_SERVICO : "e cliente atendido em"
    VEICULOS ||--o{ ORDENS_SERVICO : "e atendido em"
    MECANICOS o|--o{ ORDENS_SERVICO : "e responsavel por"
    STATUS_OS ||--o{ ORDENS_SERVICO : "classifica"
    USUARIOS ||--o{ ORDENS_SERVICO : "abre"
    ORDENS_SERVICO ||--o{ OS_SERVICOS : "contem"
    SERVICOS ||--o{ OS_SERVICOS : "e incluido em"
    ORDENS_SERVICO ||--o{ OS_PECAS : "consome"
    PECAS ||--o{ OS_PECAS : "e incluida em"
    PECAS ||--o{ MOVIMENTOS_ESTOQUE : "possui"
    OS_PECAS o|--o{ MOVIMENTOS_ESTOQUE : "origina"
    USUARIOS ||--o{ MOVIMENTOS_ESTOQUE : "registra"
    ORDENS_SERVICO ||--o{ HISTORICO_STATUS_OS : "possui historico"
    STATUS_OS o|--o{ HISTORICO_STATUS_OS : "e status anterior"
    STATUS_OS ||--o{ HISTORICO_STATUS_OS : "e status novo"
    USUARIOS ||--o{ HISTORICO_STATUS_OS : "altera"

    PERFIS {
        int id_perfil PK
        string nome UK
        string descricao
    }
    USUARIOS {
        int id_usuario PK
        int id_perfil FK
        string nome
        string email UK
        string senha_hash
        boolean ativo
        datetime criado_em
        datetime atualizado_em
    }
    CLIENTES {
        int id_cliente PK
        string nome
        string documento UK
        string telefone
        string email
        string endereco
        boolean ativo
        datetime criado_em
    }
    VEICULOS {
        int id_veiculo PK
        int id_cliente FK
        string placa UK
        string chassi UK
        string marca
        string modelo
        int ano
        string cor
        boolean ativo
        datetime criado_em
    }
    MECANICOS {
        int id_mecanico PK
        int id_usuario FK, UK
        string especialidade
        boolean ativo
    }
    SERVICOS {
        int id_servico PK
        string nome
        string descricao
        decimal preco_atual
        boolean ativo
    }
    PECAS {
        int id_peca PK
        string codigo UK
        string nome
        string descricao
        decimal preco_atual
        int estoque_minimo
        boolean ativo
    }
    STATUS_OS {
        int id_status_os PK
        string codigo UK
        string nome
    }
    ORDENS_SERVICO {
        int id_os PK
        int id_cliente FK
        int id_veiculo FK
        int id_mecanico FK
        int id_status_os FK
        int aberta_por FK
        datetime aberta_em
        datetime previsao_conclusao
        datetime concluida_em
        int quilometragem_entrada
        string diagnostico
        string observacoes
    }
    OS_SERVICOS {
        int id_os_servico PK
        int id_os FK
        int id_servico FK
        string descricao_snapshot
        decimal quantidade
        decimal valor_unitario
    }
    OS_PECAS {
        int id_os_peca PK
        int id_os FK
        int id_peca FK
        string descricao_snapshot
        int quantidade
        decimal valor_unitario
    }
    MOVIMENTOS_ESTOQUE {
        int id_movimento PK
        int id_peca FK
        int id_os_peca FK (opcional; FK composta com id_peca)
        int registrado_por FK
        int quantidade_delta
        string motivo
        datetime criado_em
        string observacao
    }
    HISTORICO_STATUS_OS {
        int id_historico_status PK
        int id_os FK
        int id_status_anterior FK
        int id_status_novo FK
        int alterado_por FK
        datetime alterado_em
        string observacao
    }
```

## Entidades e responsabilidades

- **PERFIS / USUARIOS:** credenciais e autorização. A senha deve ser armazenada somente como hash. Os perfis iniciais são administrador, atendente e mecânico.
- **CLIENTES / VEICULOS:** cadastro do cliente e seus veículos. `VEICULOS.id_cliente` representa o proprietário atual.
- **MECANICOS:** dados profissionais ligados a uma conta de usuário. A relação 1:1 permite que o mecânico use o sistema para consultar e atualizar OS atribuídas.
- **SERVICOS / PECAS:** catálogo da oficina. Os preços atuais não substituem os valores históricos gravados nos itens da OS.
- **STATUS_OS / ORDENS_SERVICO / HISTORICO_STATUS_OS:** status atual da OS e trilha das transições, com usuário e data da alteração.
- **OS_SERVICOS / OS_PECAS:** entidades associativas que resolvem os relacionamentos muitos-para-muitos e guardam descrição e preço praticados no momento da OS.
- **MOVIMENTOS_ESTOQUE:** livro de entradas e saídas. `quantidade_delta` é positiva para entrada e negativa para saída; o saldo pode ser obtido pela soma dos movimentos da peça. Uma saída ligada a `OS_PECAS` registra o consumo pela OS; ajustes e estornos podem não estar ligados a um item de OS.

## Cardinalidades principais

- Um cliente pode possuir zero ou vários veículos; cada veículo tem exatamente um proprietário atual (RN01–RN02).
- Um cliente e um veículo podem aparecer em várias OS ao longo do tempo. Cada OS se refere a exatamente um cliente atendido e um veículo (RN03).
- Um mecânico pode estar associado a zero ou várias OS; uma OS pode estar sem responsável durante a abertura ou ter um único mecânico responsável (RN06–RN07).
- Uma OS pode conter vários serviços e várias peças; cada linha de item pertence a uma OS e referencia um item do catálogo (RN04–RN05).
- Uma peça pode ter várias movimentações de estoque; cada movimentação pertence a uma peça e pode apontar para o item de OS que a originou (RN09).
- Cada OS tem um status atual. As alterações são registradas com status anterior/novo, responsável pela mudança e data (RN08).

## Regras de integridade e histórico propostas

1. Ao abrir uma OS, validar que o cliente selecionado é o proprietário atual do veículo. A OS conserva seu próprio `id_cliente`; se o veículo mudar de proprietário depois, as OS antigas continuam vinculadas ao cliente atendido na época.
2. No baseline v1, ao concluir uma OS exige-se ao menos um serviço ou uma peça. Uma OS aberta pode ainda não ter itens.
3. Calcular o total a partir de quantidade × valor unitário registrado em cada item de OS. Os valores unitários e descrições são snapshots e não mudam quando o catálogo for atualizado. Não armazenar total/subtotais redundantes neste primeiro modelo.
4. Registrar consumo de peça como movimento negativo e entrada como movimento positivo. Cancelamentos/estornos geram movimentos compensatórios; não apagar movimentos já efetivados. Não manter um saldo duplicado em `PECAS` inicialmente: calcular o saldo pela soma do livro de movimentos.
5. Alterar o status atual da OS e inserir o histórico correspondente na mesma transação. OS concluída não pode ser excluída (RN10); cadastros referenciados devem ser inativados ou arquivados, não apagados em cascata.
6. A atribuição do mecânico pode ser nula enquanto a OS não tiver responsável. A validação do perfil do usuário associado a `MECANICOS` deve impedir que conta de atendente/administrador seja usada como mecânico.

## Pontos para confirmar antes de aprovar

- [ ] Quais campos de cliente são obrigatórios? Documento será CPF, CNPJ ou ambos? Pode ficar ausente?
- [ ] Placa e chassi serão obrigatórios? Como tratar veículos antigos sem chassi/documentação disponível?
- [ ] O mecânico sempre terá login? Este rascunho assume que sim, pela necessidade de consultar e atualizar OS.
- [ ] Quais status existem e quais transições são permitidas? Sugestão inicial: aberta, em diagnóstico, aguardando aprovação, aguardando peças, em execução, concluída e cancelada.
- [ ] Uma OS pode ser concluída apenas com peças, sem serviço cadastrado? Este rascunho permite, exigindo ao menos um item entre serviços e peças.
- [ ] Peças podem ser fracionadas? Este rascunho usa quantidade inteira para peças e decimal para serviços.
- [ ] Haverá desconto? Como será autorizado e registrado? O primeiro desenho não inclui descontos.
- [ ] Como tratar devolução de peça, cancelamento após consumo e ajustes manuais? Este rascunho usa movimentos compensatórios auditáveis.
- [ ] A oficina terá dados próprios cadastrados (nome, CNPJ, endereço e contato)? A descrição cita gerenciamento de informações da oficina, mas isso ainda não aparece nos RF01–RF16. Se confirmado, incluir entidade e requisito antes do modelo lógico.
- [ ] Confirmar política de exclusão/arquivamento para clientes, veículos, usuários, mecânicos e catálogo.

## Cobertura inicial

- **RN01–RN02:** `CLIENTES` 1:N `VEICULOS`.
- **RN03:** OS tem FKs para cliente atendido e veículo; a correspondência com o proprietário atual é validada ao abrir a OS.
- **RN04–RN05:** `OS_SERVICOS` e `OS_PECAS` resolvem as associações N:N.
- **RN06–RN07:** `MECANICOS` 1:N `ORDENS_SERVICO`, atribuição opcional na OS.
- **RN08:** status atual obrigatório e histórico de transições.
- **RN09:** livro de movimentos de estoque, vinculado ao item da OS quando aplicável.
- **RN10:** preservar OS concluídas; exclusão física não permitida.
- **RN11:** total obtido dos itens e seus preços unitários históricos.
- **RF01–RF16:** cobertos conceitualmente por usuários/perfis, cadastros, OS/itens, histórico, busca e dashboard; consultas e operações serão detalhadas nas fases seguintes.

## Próxima atividade

Executar e testar `database/schema.sql` em um banco MySQL limpo. Validar o baseline com orientador/usuários e propagar eventuais ajustes para DER, modelo lógico e SQL. Tipos MySQL e restrições detalhadas estão especificados em `docs/modelo-logico.md`.
