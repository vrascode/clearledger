# Arquitetura e decisões

[English](ARCHITECTURE.md)

## Dashboard e internacionalização — 2026-10-22

O motor de conciliação, o esquema SQLite e os contratos FastAPI foram preservados.
`frontend/` usa Next.js 16.4.2 com App Router, React 19.3.1 e TypeScript estrito.
Versões fixadas e `package-lock.json` versionado. Tailwind 4 fornece tokens;
componentes shadcn/ui usam Radix. A fonte Geist é servida localmente. Lucide,
Recharts, TanStack Table 8, TanStack Query, React Hook Form e Zod atendem ícones,
gráficos, tabelas, estado remoto e formulários. TanStack Table permanece na API
v8 validada; a v9 alterou os imports.

O navegador chama um proxy BFF Next.js da mesma origem; o servidor injeta
`X-API-Key` ao chamar o FastAPI existente. O proxy permite somente rotas aceitas
e endereços HTTP locais, rejeita redirecionamentos e mutações entre origens,
limita o CSV em streaming a 2 MiB e aplica timeout de 30 segundos. Não há liberação
CORS. Credenciais de sessão ficam na memória do servidor, com cookie opaco
HttpOnly/SameSite de oito horas; a configuração do ambiente é a alternativa.
O modo de exemplo usa os CSVs e endpoints reais. Somente relatórios cujos três
hashes correspondem aos arquivos recebem o aviso de dados sintéticos.

`next-intl` 4 fornece ICU e chaves tipadas, sem URLs por idioma nem middleware de
redirecionamento. O servidor resolve cookie ou `Accept-Language` para o HTML
inicial. O provider do cliente muda idioma e cookie imediatamente, preservando
formulários e cache de consultas. Os dois dicionários são enviados para dispensar
requisições na troca. Validações guardam códigos; erros da API são mapeados para
descritores; notificações usam o idioma ativo ao renderizar. Erros desconhecidos
recebem uma explicação traduzida e segura. TypeScript verifica o formato comum;
os testes comparam chaves, parâmetros ICU e renderizam todas as mensagens.

Valores são formatados a partir das unidades mínimas inteiras com partes BigInt
e `Intl`; JPY usa zero casas decimais. Não há câmbio, soma entre moedas ou alteração
de registros e exportações. Datas são localizadas e usam UTC explícito. Listas de
metadados são carregadas em páginas de 100; filtros, ordenação e paginação do
relatório ocorrem no navegador. Históricos grandes exigirão filtros no servidor
e avaliação de capacidade.

Referências técnicas, acessadas em 2026-10-22:
[Next.js](https://nextjs.org/docs/app/getting-started/installation),
[shadcn/ui e Tailwind 4](https://ui.shadcn.com/docs/tailwind-v4),
[configuração next-intl](https://next-intl.dev/docs/usage/configuration) e
[tipagem next-intl](https://next-intl.dev/docs/workflows/typescript).
Cookies sem URLs localizadas são uma decisão de produto para uso local.

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
