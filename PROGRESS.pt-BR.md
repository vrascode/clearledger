# Checkpoint do ClearLedger

[English](PROGRESS.md)

Data: **2026-10-20**. Estado: **em desenvolvimento**, repositório privado
https://github.com/vrascode/clearledger. Sem implantação ou aprovação para produção.

## Entregue e verificado

- CSV estrito de pedidos, transações e depósitos, com importações atômicas,
  snapshots imutáveis, hashes, idempotência e conflitos de conteúdo.
- Cobranças divididas, reembolsos, reversão de taxas, diferenças de pedidos e
  repasses, valores inteiros e totais separados por moeda.
- API FastAPI autenticada, limites de entrada, erros seguros, IDs de requisição,
  paginação, exportações JSON/CSV e CLI.
- Exemplo sintético: 6 pedidos, 3 repasses e 5 exceções.
- Documentação bilíngue, arquitetura, segurança, commits e rascunho de post.
  O post não foi enviado a redes sociais.

## Evidência

Windows, Python 3.12.10. Comandos executados na pasta do projeto:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --basetemp .tmp/pytest-service --tb=short
.\.venv\Scripts\python.exe -m ruff check clearledger tests
.\.venv\Scripts\python.exe -m pip check
```

**64 testes aprovados**, lint aprovado e dependências instaladas consistentes.
Permanece um aviso de descontinuação Starlette/httpx. Testes cobrem concorrência,
rollback, reinício, validação, autenticação, limites e processos reais da CLI.

Publicação inicial verificada: PRIVATE, branch `main`, código, testes, exemplos,
documentação e lockfiles presentes. Extração preservou arquivos, autores, datas
e mensagens. Revisão automática do estado/histórico e inspeção manual não
detectaram credenciais reais; há somente chave explicitamente fictícia de teste.

## Retomada exata

Fonte de desenvolvimento: `C:\ProjetosNovo\projects\01-clearledger`. Leia
`AGENTS.md`, `PORTFOLIO_PROGRESS.md` e confira o Git do workspace antes de alterar.
Não desenvolva no clone usado para publicação.

1. Concluir **P01.2**: script de teste com Uvicorn em loopback, chave gerada e
   banco temporário dentro do workspace. Testar acesso sem chave, três imports,
   criação/repetição da execução, cinco exceções e exportação CSV; encerrar o
   processo. Os testes HTTP atuais usam cliente ASGI interno, não servidor real.
2. Concluir **P01.3**: auditoria de dependências, avaliação do aviso Starlette,
   captura útil da aplicação em execução quando viável e documentação de
   backup/restauração e limites. Não declarar essas verificações concluídas.
3. Executar testes pertinentes e lint, revisar segredos/arquivos, atualizar
   progresso e criar commit real com Conventional Commits.
4. Seguir `docs/PUBLISHING.md` do workspace: extrair histórico, atualizar clone
   apenas por fast-forward, verificar conta/visibilidade, push normal e comparar
   SHA remoto. Próximos pushes privados estão autorizados.
5. Após os critérios do ClearLedger, iniciar outbox e workers do Projeto 02.
   Projetos 02–05 ainda não têm código.

Dependências, bancos, caches, venv e clones temporários ficam locais e ignorados.
Produção exige TLS, acesso, limites, rotação de chave, backups testados,
monitoramento e capacidade. Não há alegação de prontidão para produção.
