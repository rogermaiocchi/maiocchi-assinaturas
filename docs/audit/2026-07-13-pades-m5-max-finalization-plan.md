# Plano de finalização PAdES no MacBook Pro M5 Max

Data: 13/07/2026
Escopo: layout final da folha de evidências, agente PAdES local, token ICP-Brasil A3, VPS, validação pública e rastreabilidade da release.

## Objetivo verificável

Entregar o fluxo de assinatura qualificada sem as duas inscrições redundantes
nem ícone no cabeçalho, com chave privada operada por token externo, credencial
ICP-Brasil confirmada pelo provider, PDF aprovado pelo VALIDAR ITI, release
reproduzível e código publicado no GitHub.

"Concluído" significa que todos os critérios desta página possuem evidência
objetiva. Saúde de serviço, narrativa de agente ou aparência isolada não
substituem teste criptográfico.

## Ambiente-alvo validado

| Componente | Perfil |
| --- | --- |
| Computador | MacBook Pro `Mac17,6` |
| SoC | Apple M5 Max, 18 CPU cores e 40 GPU cores |
| Memória | 128 GB unificada |
| Arquitetura | `arm64` |
| Sistema | macOS 27.0, SIP ativo |
| Token testado | ICP-Brasil A3 por CryptoTokenKit |
| Stack nativa | Swift 6, Security.framework, CryptoTokenKit, launchd, codesign, plutil e Unified Logging |

A GPU e a Neural Engine não participam da operação PAdES: a chave privada e a
operação RSA permanecem no token. O perfil M5 Max prioriza binário `arm64`, APIs
nativas, isolamento em loopback e cerimônia serial para evitar contenção do A3.

## Tasks e microtasks

### T0 - Congelar o resultado visual

- [x] Remover estritamente “Resumo visual da assinatura”.
- [x] Remover estritamente “Resumo visual da assinatura · confira pelo QR ou código”.
- [x] Preservar geometria, sinais físicos e conteúdo restante.
- [x] Remover o ícone Lucide de “Evidências da assinatura digital”.
- [x] Reservar a marca ICP-Brasil ao selo qualificado e omiti-la no modelo neutro.
- [x] Remover o registro lateral da última página e enriquecê-lo nas originais.
- [x] Aplicar a linha dourada superior em todas as páginas.
- [x] Validar primeira e última páginas do PDF em imagem.

Aceite: as duas frases têm zero ocorrências no texto extraído e a página final
mantém os demais blocos sem corte ou sobreposição.

### T1 - Auditoria independente

- [x] Executar auditoria com `gpt-5.6-sol` via Codex OAuth.
- [x] Separar validade do PDF de hardening operacional.
- [x] Registrar o parecer sem segredos no diretório privado de auditoria.
- [x] Calcular SHA-256 da síntese: `bd9578c33aa948fb141975462276de76bc0c7171ca39d0d0e19a20ab292cadd6`.

Resultado: PDF válido; gate token-backed e publicação do commit foram os dois
itens exigidos antes de declarar zero pendências operacionais.

### T2 - Tornar a classificação local fail-closed

- [x] Confirmar no token real a presença de `kSecAttrTokenID` sem expor seu valor.
- [x] Confirmar chave privada RSA, `kSecAttrCanSign` e suporte a RSA-SHA256.
- [x] Criar política pura e testável para atributos de `SecKey`.
- [x] Exigir store externo, chave privada, RSA, capacidade de assinatura e no mínimo 2048 bits.
- [x] Excluir Secure Enclave e qualquer identidade RSA apenas em software.
- [x] Expor ao navegador somente descritores aprovados como token-backed.
- [x] Classificar localmente como `external-token-unverified`, sem alegar ICP-Brasil.
- [x] Delegar cadeia ICP-Brasil e política AD-RB ao provider antes da assinatura.
- [x] Adicionar teste positivo e testes negativos para cada condição.

Aceite: sem evidência positiva de `kSecAttrTokenID`, a identidade não é listada;
sem validação do provider, a credencial externa não é tratada como ICP-Brasil.

### T3 - Aplicar o perfil nativo do M5 Max

- [x] Compilar release explicitamente para `arm64`.
- [x] Usar `Security.framework` e CryptoTokenKit sem middleware criptográfico adicional.
- [x] Registrar apenas eventos não sensíveis no Unified Logging.
- [x] Manter bind exclusivo em `127.0.0.1:35100` e origens autorizadas.
- [x] Executar como LaunchAgent interativo, com reinício governado e `umask 077`.
- [x] Criar preflight nativo para arquitetura, assinatura, PID do launchd, listener, binário e token.
- [x] Verificar que PIN, ticket, certificado e chave não ingressam nos logs.

Aceite: preflight estrito aprovado no M5 Max e binário instalado identificado
como Mach-O 64-bit `arm64` com assinatura de código válida.

### T4 - Regressão e instalação

- [x] Resolver dependências Swift já fixadas em `Package.resolved`.
- [x] Executar `swift test` e build release.
- [x] Executar a suíte geral, lint e `git diff --check`.
- [x] Reinstalar o agente pelo script versionado.
- [x] Confirmar status, versão, provider, política e descritor token-backed.
- [x] Confirmar que PID do launchd, listener loopback e binário instalado coincidem.

Aceite: todos os comandos encerram com código zero e nenhuma identidade em
software aparece na rota de certificados.

### T5 - Ensaio criptográfico ponta a ponta

- [ ] Emitir ticket novo e de uso único para o PDF de homologação.
- [ ] Assinar com o token ICP-Brasil conectado.
- [ ] Validar `ByteRange`, cobertura integral, CMS e SHA-256 do arquivo final.
- [ ] Confirmar prova ML-DSA-65 no verificador Maiocchi.
- [ ] Submeter o mesmo arquivo ao VALIDAR ITI.
- [ ] Preservar PDF, relatório e hashes fora do Git.

Aceite: `pdfsig` retorna assinatura válida, o verificador público retorna
`proofVerified=true` e o VALIDAR ITI retorna “Assinatura aprovada.” sem alerta.

### T6 - Baseline, produção e GitHub

- [ ] Registrar hashes, versões, imagem da VPS e resultado ITI em baseline versionada.
- [ ] Confirmar `pki-bridge` saudável e HTTPS público.
- [ ] Verificar novamente a ausência das duas frases no código e no PDF.
- [ ] Commitar apenas arquivos do escopo, preservando mudanças preexistentes.
- [ ] Enviar `main` ao repositório GitHub configurado como `origin`.
- [ ] Confirmar que `origin/main` contém o commit final.

Aceite: baseline e implementação pertencem ao mesmo histórico publicado; o
working tree pode conter somente arquivos preexistentes fora deste escopo.

## Matriz de encerramento

| Gate | Evidência exigida |
| --- | --- |
| Visual | screenshots e extração textual do PDF final |
| A3 | `kSecAttrTokenID` presente e política fail-closed aprovada |
| PAdES | `pdfsig`, cobertura integral e relatório ITI |
| Pós-quântico | manifesto ML-DSA-65 verificado, sem confusão com ICP-Brasil |
| MacBook | preflight nativo, Mach-O `arm64`, codesign e launchd |
| VPS | health público e imagem imutável identificada |
| Fonte | commit final presente em `origin/main` |

## Fontes técnicas primárias

- [Apple - SecKeyCopyAttributes](https://developer.apple.com/documentation/security/1643699-seckeycopyattributes)
- [Apple - kSecAttrTokenID](https://developer.apple.com/documentation/security/ksecattrtokenid)
- [Apple - kSecAttrCanSign](https://developer.apple.com/documentation/security/ksecattrcansign)
- [Apple - ativos criptográficos em smart card](https://developer.apple.com/documentation/cryptotokenkit/using-cryptographic-assets-stored-on-a-smart-card)

O SDK local confirma que `SecKeyCopyAttributes` pode retornar
`kSecAttrTokenID`, `kSecAttrKeyClass`, `kSecAttrKeyType`,
`kSecAttrKeySizeInBits` e `kSecAttrCanSign`. A presença de `kSecAttrTokenID`
indica store externo; sua ausência classifica a chave como Keychain normal.
