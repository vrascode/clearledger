# Limites de segurança

[English](SECURITY.md)

- Sem credenciais embutidas. Inicialização exige chave ASCII imprimível, sem
  espaços, de 32–256 caracteres. Gere aleatoriamente; tamanho não garante entropia.
- Rotas de negócio exigem `X-API-Key`, comparada em tempo constante. A chave
  autoriza acesso a todo o banco.
- Comandos documentados usam loopback. Compartilhamento exige TLS, limites de
  requisição, timeouts e controle de identidade apropriado.
- CSV estrito rejeita identificadores com fórmulas, valores inválidos, moedas
  desconhecidas, IDs duplicados e registros malformados. SQL parametrizado.
- Corpos HTTP são limitados mesmo em streaming ou com tamanho subdeclarado.
  Compressão é rejeitada. Erros não repetem registros enviados.
- Respostas desabilitam cache. CSV exporta identificadores validados, estados
  fixos e números; não exporta fórmulas de texto livre.
- A CLI usa acesso local ao banco, sem autenticação da API. Proteja banco,
  backups e fontes com controles do sistema e criptografia. O projeto não
  altera ACLs nem implementa criptografia em repouso.
- Gatilhos de imutabilidade não impedem alterações pelo administrador.
- Bancos locais, `.env`, chaves privadas, caches e dependências ficam fora do
  Git. Revise também o histórico antes de publicar.

Pendente: auditoria de dependências, restauração de backup, timeouts na borda,
limites de requisição, rotação de chave, autorização por privilégio mínimo e
revisão independente. Não envie cartões ou dados pessoais reais: apenas IDs de
negócio e valores são necessários.
