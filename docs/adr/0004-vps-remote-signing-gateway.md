# ADR 0004 - Gateway de assinatura remota na VPS

- Status: aceito
- Data: 2026-07-14
- Decisores: Maiocchi Advogado

## Contexto

Um Prestador de Serviço de Confiança da ICP-Brasil e uma entidade credenciada,
auditada e supervisionada pelo ITI. Instalar software criptografico em uma VPS
privada nao atribui esse status ao servidor nem autoriza a custodia de chaves de
terceiros.

Ha duas fronteiras tecnicas diferentes:

1. certificado A3 em nuvem: a chave fica no PSC e o titular autoriza a operacao
   no ambiente do prestador;
2. certificado A3 em token USB: a chave fica no computador do titular e exige
   um componente local capaz de acessar o middleware PKCS#11, CryptoTokenKit ou
   repositório equivalente do sistema operacional.

## Decisao

A VPS opera como **Gateway de Assinatura Remota compativel com PSC**. Ela:

- congela o PDF e compoe a pagina de evidencias;
- cria e vincula uma sessao remota a um ticket opaco de uso unico;
- redireciona o titular ao PSC por HTTPS;
- recebe somente o identificador da sessao concluida;
- baixa, inspeciona e valida o PAdES final;
- verifica a politica permitida, cadeia, integridade e resultado de revogacao;
- cifra o artefato em repouso e registra SHA-256 e atestado ML-DSA-65;
- libera o PDF apenas depois de todos os gates.

O origin do redirecionamento do PSC integra allowlist HTTPS exata. O canal
DocuSeal-gateway usa listener exclusivo na rede `signature-internal`, nonce de
uso unico persistido e HMAC que vincula metodo, destino, corpo, status e resposta.
Para assinaturas simples e avancadas, um segundo ML-DSA-65 atesta o SHA-256 dos
bytes finais somente depois da serializacao; a verificacao publica falha fechado
se o attachment divergir desse atestado.

A chave privada, o PIN e a credencial de autorizacao do titular nunca ingressam
na VPS. O adapter inicial e REST PKI Core, mas o contrato do gateway admite
outros PSCs mediante adapter homologado e testes de conformidade equivalentes.

## Estado fail-closed

A modalidade qualificada fica indisponivel quando o adapter remoto nao possui
endpoint, credencial e contexto de seguranca completos. O DocuSeal consulta o
`/healthz` do gateway antes de exibir a acao e antes de criar o ticket.

O provider DSS local continua isolado para composicao, validacao e contingencia.
Assinatura com token fisico somente pode ser habilitada por feature flag e exige
bridge local instalada, assinada e autorizada no computador que contem o USB.
Nao existe fallback silencioso de assinatura qualificada para assinatura simples.

## Inteligencia artificial

Modelos generativos nao participam da selecao de certificado, coleta de PIN,
assinatura, validacao, politica criptografica ou decisao de validade. A VPS possui
4 vCPU x86_64 e 15 GiB de RAM; o modelo auxiliar compativel, se houver um caso de
suporte futuro, e `Qwen/Qwen3-4B-GGUF` no arquivo `Q4_K_M`, servido por
`mistral.rs` em Rust e isolado da PKI. Nenhum modelo e instalado sem caso de uso,
budget de latencia, avaliacao e controle de acesso aprovados.

## Consequencias

- Sem credenciais reais de PSC, o codigo pode ser publicado e testado, mas a
  assinatura qualificada remota permanece corretamente desabilitada.
- O token USB nao pode cumprir simultaneamente os requisitos de uso do hardware
  local e ausencia absoluta de componente local.
- O portal pode oferecer os dois caminhos sem confundi-los: nuvem sem instalacao
  e USB com bridge local explicitamente identificada.

## Fontes

- [ITI - Lista de PSCs credenciados](https://www.gov.br/iti/pt-br/assuntos/icp-brasil/lista-de-prestadores-de-servico-de-confianca-psc)
- [ITI - DOC-ICP-17.01](https://www.gov.br/iti/pt-br/assuntos/legislacao/instrucoes-normativas/IN_20_2020_DOC_17.01_assinada.pdf)
- [REST PKI Core - Signature sessions](https://docs.lacunasoftware.com/en-us/articles/rest-pki/core/integration/signature-sessions/index.html)
- [PJeOffice Pro - limite de dominios externos](https://docs.pje.jus.br/servicos-negociais/pjeoffice-pro/)
- [MDN - Native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
- [Web eID - native app e extensao](https://web-eid.eu/)
- [Qwen3-4B-GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF)
- [mistral.rs](https://github.com/EricLBuehler/mistral.rs)
