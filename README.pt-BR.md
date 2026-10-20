# ClearLedger

[English](README.md)

**Em desenvolvimento.** Serviço funcional de conciliação de três fontes para
operações financeiras: valores esperados dos pedidos, transações de pagamento
e depósitos bancários. Indica exceções para investigação; não movimenta dinheiro.

Entregue: CSV atômico, idempotência e conflitos, cobranças divididas, reembolsos
e reversão de taxas, totais por moeda, relatórios SQLite imutáveis, FastAPI
autenticado, CLI, exportação JSON/CSV e exemplos sintéticos. **64 testes passaram
localmente em Python 3.12.10 / Windows.**

Pendente: teste com servidor real, auditoria de dependências, capturas de execução
e preparação operacional. Sem implantação em produção ou validação comercial.

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
[entregas](COMMITS.pt-BR.md) e [rascunho de post](POST.pt-BR.md).
SQLite atende um piloto em host único, com gravações serializadas. Uma chave
acessa todo o banco; sem isolamento entre organizações. Produção exige TLS,
política de acesso, rotação de segredos, limites de requisição, criptografia,
backups testados, monitoramento e testes de capacidade.

Testes locais não implicam CI remoto ou implantação. Desenvolvimento com
assistência de IA e commits incrementais reais.
