# Arquitetura e decisões

[English](ARCHITECTURE.md)

Estado: serviço local funcional, preparação operacional em andamento.

Fluxo: CSV normalizado → autenticação/limite de entrada ou CLI local → validação
estrita → importações SQLite imutáveis → conciliação → relatórios → JSON/CSV.

1. **Snapshots explícitos:** cada execução seleciona três importações. O operador
   alinha a janela de liquidação; não há seleção automática por data.
2. **Valores inteiros exatos:** bruto e reembolso são comparados separadamente
   para que erros não se anulem no líquido. Moedas nunca são somadas entre si.
3. **SQLite e SQL nativo:** piloto local sem servidor externo. `BEGIN IMMEDIATE`
   serializa gravações, chaves únicas garantem idempotência e WAL permite
   leitores durante gravação. Escala em múltiplos hosts exige outra estratégia,
   como PostgreSQL e planejamento de capacidade medido.
4. **Atomicidade e imutabilidade:** validação antes da transação. Gatilhos
   impedem atualização/exclusão por SQL normal; o administrador pode removê-los.
   A trilha não é inviolável nem equivale a certificação de auditoria.
5. **Regras versionadas:** fingerprint inclui versão e IDs dos inputs. Relatórios
   guardam hashes SHA-256 das fontes, horários, IDs, referências e resultados.
   CSV bruto não é retido; o responsável pela fonte deve arquivá-lo.
6. **Trabalho limitado:** 10.000 registros/importação e 2 MiB por corpo HTTP.
   Operações de banco executam em threads. Snapshots JSON simplificam
   reprodução, mas limitam consultas analíticas.
7. **Operador confiável:** comparação da chave em tempo constante. Sem usuários
   ou isolamento de organizações. A CLI depende do controle de acesso local.

Valor proposto, ainda não medido: concentrar a investigação nas divergências.
A [documentação Stripe](https://docs.stripe.com/reports/payout-reconciliation)
descreve o fluxo de repasses/lotes (acesso 2026-10-20; data de publicação não
informada). O esquema do ClearLedger é próprio, sem integração direta.

Testes cobrem concorrência, repetição, conflito, validação, rollback, reinício,
HTTP e CLI. Não há alegação de SLA, implantação, economia ou auditoria formal.
