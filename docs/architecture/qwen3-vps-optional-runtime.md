# Runtime Qwen3 opcional na VPS

Data da verificacao: 2026-07-15

## Decisao

Modelos generativos ficam fora do caminho de assinatura, PIN, selecao de
certificado, validacao PAdES e decisao de validade. Essas funcoes permanecem
deterministicas, fail-closed e auditaveis.

Se houver futuramente uma funcao auxiliar aprovada, como busca semantica na
ajuda ou classificacao de chamados sem acesso a documentos, o perfil adequado
para a VPS atual e:

- modelo: `Qwen/Qwen3-4B-GGUF`;
- arquivo: `Qwen3-4B-Q4_K_M.gguf`;
- tamanho: `2497280256` bytes;
- SHA-256 publicado no Hugging Face:
  `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`;
- revisao do repositorio consultada:
  `bc640142c66e1fdd12af0bd68f40445458f3869b`;
- licenca: Apache-2.0;
- servidor: `mistral.rs` `v0.9.0`, em Rust, com bind somente na rede interna.

A configuracao foi escolhida para 4 vCPU x86_64 e 15 GiB de RAM, sem GPU. A
quantizacao Q4_K_M preserva margem para portal, DocuSeal, bancos e servicos PKI.
O arquivo nao foi baixado porque nenhum caso de uso auxiliar foi aprovado. A
API do Hugging Face confirmou o artefato, a revisao, a licenca, o tamanho e o
SHA-256 acima; baixar o mesmo arquivo sem consumidor real aumentaria uso de
disco, memoria e superficie de ataque sem melhorar a assinatura.

A resposta relevante da API, sem campos volateis ou template de chat, foi
persistida em `compliance/research/qwen3-4b-q4-k-m-hf-api.json` e integra o
manifesto de integridade da release.

## Gate de ativacao

Antes de baixar ou iniciar o runtime, todos os itens devem estar satisfeitos:

1. caso de uso documentado sem participacao na decisao criptografica;
2. conjunto de avaliacao e criterio objetivo de qualidade;
3. limite de CPU, RAM, concorrencia e tempo de resposta;
4. endpoint sem exposicao publica e autenticacao entre servicos;
5. payload sem PIN, senha, chave privada, PDF integral ou credencial;
6. download fixado pela revisao e conferido pelo SHA-256 acima;
7. rollback que remova container, volume e rota sem afetar o portal.

## Fontes rastreaveis

- [API do modelo no Hugging Face](https://huggingface.co/api/models/Qwen/Qwen3-4B-GGUF?blobs=true)
- [Qwen3-4B-GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF)
- [mistral.rs](https://github.com/EricLBuehler/mistral.rs)
