# ClearLedger

[English](README.md)

Dashboard em inglês e português do Brasil para conciliação de três fontes em
operações financeiras: valores esperados dos pedidos, transações de pagamento
e depósitos bancários. Indica exceções para investigação; não movimenta dinheiro.

Entregue: CSV atômico, idempotência e conflitos, cobranças divididas, reembolsos
e reversão de taxas, totais por moeda, relatórios SQLite imutáveis, FastAPI
autenticado, CLI, exportação JSON/CSV e exemplos sintéticos. A interface Next.js
inclui visão geral, conciliação, importações CSV, execuções, relatórios e conexão
local, com temas claro e escuro.

Este continua sendo um protótipo em um único host. Sem implantação em produção
ou validação comercial. Consulte os [resultados e limites](PROGRESS.pt-BR.md).
Os demais projetos do portfólio não fazem parte deste repositório.

## Executar o dashboard

Requisitos: Python 3.12+, Node.js 22+ e npm. Instale as dependências Python com
os comandos da seção de instalação abaixo. Depois, a partir da raiz do projeto:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run build
npm.cmd run start:local
```

Abra **http://127.0.0.1:3000**. O inicializador executa o FastAPI na porta 8000
e o Next.js na 3000, gera uma chave compartilhada na memória dos processos e
mantém o banco em `.runtime/clearledger.sqlite3`. Portas ocupadas são recusadas.
Ctrl+C encerra os dois serviços. Os logs ficam em `.runtime/`; a chave nunca é
impressa. Use `npm.cmd run dev:local` durante o desenvolvimento da interface.
Em Linux/macOS, use `npm` no lugar de `npm.cmd`.

Escolha **Explorar dados de exemplo** para importar os CSVs sintéticos existentes
pela API real e executar a conciliação. Repetir a ação reutiliza as importações
e o relatório imutáveis. O aviso **Dados de exemplo** se baseia nos hashes das
três fontes. Para usar seus arquivos, importe os CSVs e selecione um conjunto de
cada tipo em **Execuções de conciliação**. Filtros, ordenação, paginação, detalhes
e exportações usam os relatórios persistidos.

Para executar os serviços separadamente, configure `CLEARLEDGER_API_URL` e
`CLEARLEDGER_API_KEY` no ambiente do servidor Next.js, conforme o
[arquivo de exemplo](frontend/.env.example), e use a mesma chave no FastAPI.
`npm.cmd run dev` ou `npm.cmd run start` executam somente o Next.js.
A tela Configurações verifica um endereço local e uma chave para uma sessão de
oito horas. A chave fica na memória do servidor; o navegador recebe um cookie
HttpOnly opaco. Restaurar a sessão volta à configuração do ambiente, sem excluir
dados. `CLEARLEDGER_EXAMPLES_DIR` permite indicar a pasta dos CSVs de exemplo.
Nunca use `NEXT_PUBLIC_` para credenciais.

## Idiomas e apresentação financeira

O seletor com ícone de globo no cabeçalho de todas as páginas alterna
instantaneamente entre **English (US)** (`en-US`) e **Português (Brasil)**
(`pt-BR`). Ele funciona pelo teclado e indica o idioma ativo. A preferência é
salva por um ano no cookie `clearledger-locale`, separado da autenticação.
Ao reabrir, ela é restaurada. Sem preferência válida, o servidor negocia
`Accept-Language`, aceitando variantes regionais do inglês e português; idiomas
não aceitos usam inglês. HTML inicial e cliente recebem o mesmo idioma para
evitar erros de hidratação. A troca preserva rota, filtros e formulários, sem
recarregar a página nem buscar os dados financeiros novamente.

Datas, contagens, percentuais e valores seguem o idioma selecionado. Os horários
usam explicitamente **UTC** nos dois idiomas, mantendo referências de auditoria
consistentes. BRL 125050 unidades mínimas aparece como `R$1,250.50` em inglês e
`R$ 1.250,50` em português; JPY não usa casas decimais. A formatação preserva
todos os centavos com partes BigInt. **Nunca há conversão de moeda.**
Pagamentos esperados são bruto dos pedidos menos reembolsos esperados; processados
são cobranças menos reembolsos realizados. A liquidação líquida também desconta
taxas. O percentual de conciliação conta registros conciliados; verificações
concluídas não significam divergências resolvidas.

Manutenção das traduções:

- Edite os dicionários [em inglês](frontend/messages/en-US.json) e
  [em português](frontend/messages/pt-BR.json) com as mesmas chaves, parâmetros
  e plurais ICU. Não monte frases concatenando fragmentos traduzidos.
- Use `useI18n()` de `frontend/src/i18n/provider.tsx`. A extensão `AppConfig`
  do `next-intl` fornece chaves tipadas. Os testes verificam estrutura dos
  dicionários, parâmetros ICU, todas as mensagens e textos fixos em JSX e rótulos
  acessíveis.
- Use os formatadores compartilhados de moeda, data, números e percentuais.
  Preserve campos da API, cabeçalhos CSV, rotas, IDs, registros e exportações.
- Para novos diagnósticos da API, adicione o mapeamento em
  `frontend/src/i18n/errors.ts`. Erros desconhecidos recebem uma explicação
  traduzida e segura. Validações e notificações guardam descritores para que
  mensagens já visíveis também acompanhem a troca de idioma.

## Verificação da interface

Execute em `frontend/`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Resolve-Path ..) '.cache\ms-playwright'
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd audit --omit=dev
```

Os testes de navegador usam o build de produção e um processo Uvicorn real nas
portas 13000/18000, com chave gerada e banco novo em `.tmp/`. O executor encerra
os próprios processos e não simula respostas da API. Capturas reais nos dois
idiomas, em desktop, celular, tablet e tema escuro ficam em
`.runtime/screenshots/`. As evidências geradas são ignoradas pelo Git.
Veja os resultados exatos e limites da auditoria em
[PROGRESS.pt-BR.md](PROGRESS.pt-BR.md). `CLEARLEDGER_PYTHON` permite substituir
o interpretador do ambiente virtual usado pelos inicializadores e testes.

## Instalação e execução

Execute na pasta do projeto: `C:\ProjetosNovo\projects\01-clearledger` no
workspace, ou a raiz do clone independente.

```powershell
python -m venv .venv
New-Item -ItemType Directory -Force -Path .tmp,.cache | Out-Null
$env:TEMP = Join-Path (Get-Location) '.tmp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path (Get-Location) '.cache\pip'
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.lock
.\.venv\Scripts\python.exe -m clearledger demo
```

O exemplo persiste em `.runtime/clearledger.sqlite3`: 6 resultados de pedidos,
3 repasses e **5 exceções** (pagamento ausente, valor bruto incorreto, pedido
desconhecido, depósito ausente e valor de repasse divergente). Repetir retorna o
mesmo relatório. Dados totalmente sintéticos. Linux/macOS usam `.venv/bin/python`
e `mkdir -p .tmp .cache`; apenas Windows foi validado até agora.
Para instalar somente execução, use `requirements.lock`.

## API

```powershell
$env:CLEARLEDGER_API_KEY = & .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
.\.venv\Scripts\python.exe -m uvicorn clearledger.api:from_env --factory --host 127.0.0.1 --port 8000
```

Abra `http://127.0.0.1:8000/docs` e informe a chave em **Authorize**.
Mantenha a chave privada, fora do Git. `CLEARLEDGER_DB` altera o caminho do banco.

| Método | Rota | Finalidade |
| --- | --- | --- |
| POST | `/v1/imports/{orders,transactions,deposits}?batch_key=source-v1` | CSV UTF-8 bruto, `Content-Type: text/csv` |
| GET | `/v1/imports?limit=50&offset=0` | Metadados e hashes |
| POST | `/v1/runs` | Informar `orders_import_id`, `transactions_import_id`, `deposits_import_id` |
| GET | `/v1/runs` | Resumos das execuções |
| GET | `/v1/runs/{id}` | Relatório completo |
| GET | `/v1/runs/{id}/export?format=csv` | Exportar CSV ou JSON |
| GET | `/healthz`, `/readyz` | Saúde e disponibilidade do banco |

Rotas `/v1` exigem `X-API-Key`. Criação retorna 201; repetição idêntica, 200;
conflito de conteúdo, 409; entrada inválida, 422; tipo incompatível, 415;
corpo muito grande, 413; registro ausente, 404; banco indisponível, 503.
Saúde e esquema da API são públicos, sem dados de negócio.

## CLI e testes

```powershell
.\.venv\Scripts\python.exe -m clearledger import orders examples/orders.csv --batch-key finance-v1
.\.venv\Scripts\python.exe -m clearledger run --orders ORDERS_IMPORT_ID --transactions TRANSACTIONS_IMPORT_ID --deposits DEPOSITS_IMPORT_ID
.\.venv\Scripts\python.exe -m clearledger show RUN_ID
.\.venv\Scripts\python.exe -m clearledger export RUN_ID --format csv --output .tmp/report.csv
.\.venv\Scripts\python.exe -m pytest -q --basetemp .tmp/pytest --tb=short
.\.venv\Scripts\python.exe -m ruff check clearledger tests
.\.venv\Scripts\python.exe -m pip check
```

Substitua IDs pelos valores retornados. `--db CAMINHO` vem antes do subcomando.
Exportar não sobrescreve arquivos. `run` e `demo` aceitam `--fail-on-exceptions`,
retornando código 3 quando há divergências; falhas retornam 1, sintaxe inválida 2.
A CLI pressupõe acesso local autorizado ao banco; não usa a chave da API.

Os testes cobrem validação, rollback, imutabilidade, conflitos, concorrência,
reinício, moedas, reembolsos, autenticação, limites de corpo e processos da CLI.
A combinação atual emite um aviso de descontinuação do cliente de testes
Starlette. Os testes passam; a revisão de compatibilidade continua pendente.

## Contrato CSV e limitações

Use os cabeçalhos exatos dos [exemplos](examples). IDs de 1–80 caracteres ASCII
começam com letra/número e aceitam `_ . : -`. Moedas: BRL, USD, EUR, GBP e JPY.
Valores são inteiros na **menor unidade monetária**, limitados a
100.000.000.000 em módulo. Até 2 MiB e 10.000 registros por arquivo.
IDs duplicados no mesmo arquivo invalidam toda a importação.

Cobranças: bruto positivo e taxa entre zero e bruto. Reembolsos: bruto negativo;
taxa positiva representa custo e negativa representa reversão, limitada ao
módulo do reembolso. Reembolso esperado fica entre zero e bruto esperado.
Líquido do repasse: `soma(bruto - taxa)`. Depósitos negativos representam débitos.
Parcelas agregam por identificador exato de pedido/repasse.

Importações são snapshots imutáveis. Correções exigem nova chave e execução.
Bytes idênticos com a mesma chave são idempotentes; finais de linha diferentes
alteram o hash. Cabeçalho sem registros representa ausência de observações,
mas três entradas vazias não geram execução.

O operador fornece janelas completas e alinhadas. Não há correspondência por
data, câmbio, tolerância, aproximação, adaptador Stripe, disputas, taxas avulsas
ou correção automática. Dados incompletos podem gerar exceções por diferença de
prazo. Moedas distintas no mesmo repasse nunca são somadas.

Consulte [arquitetura](ARCHITECTURE.pt-BR.md), [segurança](SECURITY.pt-BR.md),
[entregas](COMMITS.pt-BR.md), [checkpoint e retomada](PROGRESS.pt-BR.md)
e [rascunho de post](POST.pt-BR.md).
SQLite atende um piloto em host único, com gravações serializadas. Uma chave
acessa todo o banco; sem isolamento entre organizações. Produção exige TLS,
política de acesso, rotação de segredos, limites de requisição, criptografia,
backups testados, monitoramento e testes de capacidade.

Testes locais não implicam CI remoto ou implantação. Desenvolvimento com
assistência de IA e commits incrementais reais.
