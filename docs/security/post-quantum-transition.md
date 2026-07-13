# Transição criptográfica pós-quântica

## Escopo honesto

A transição é híbrida. O portal não rotula a assinatura PAdES ICP-Brasil como pós-quântica: os certificados e políticas hoje verificáveis continuam usando os algoritmos autorizados pelo ITI. Substituí-los unilateralmente por ML-DSA tornaria o documento incompatível com a cadeia, a política e os validadores oficiais.

O controle pós-quântico protege transporte e confidencialidade em repouso enquanto mantém o PAdES juridicamente interoperável. O ITI criou em 26 de junho de 2026 um grupo técnico para planejar a migração da ICP-Brasil e descreveu uma transição híbrida; isso é planejamento regulatório, não homologação de PAdES ML-DSA.

## Controles ativos

| Camada | Controle | Estado |
| --- | --- | --- |
| Borda pública | TLS 1.3 com grupo híbrido X25519MLKEM768 | Ativo por Traefik 3.7.5 / Go 1.25.11 |
| Cifras TLS | AES-256-GCM ou ChaCha20-Poly1305 | Ativo conforme negociação TLS 1.3 |
| Artefatos | AES-256-GCM, nonce aleatório de 96 bits e storage key como AAD | Ativo e obrigatório no PKI Bridge |
| Integridade | SHA-256 do PDF final e storage por conteúdo | Ativo; não é alegado como assinatura PQ |
| Assinatura jurídica | PAdES ICP-Brasil, política AD-RB/AD-RT | Clássica por requisito regulatório |
| Atestados internos | Ed25519/JWS | Clássicos, preservados para compatibilidade |

AES-256 oferece margem de 128 bits contra busca quântica idealizada. ML-KEM protege o segredo de sessão contra o cenário “capturar agora, decifrar depois”, desde que o cliente também negocie o grupo híbrido.

## Crypto-agility

1. O PAdES e o atestado interno são artefatos separados.
2. IDs de chave e keyrings permitem rotação sem reescrever o PDF final.
3. Uma futura prova ML-DSA será sidecar adicional, vinculada ao hash do PDF e ao atestado clássico.
4. A prova ML-DSA só poderá ser exigida após suporte estável do runtime, política de custódia, validadores independentes e compatibilidade com a ICP-Brasil.
5. O sistema não remove provas clássicas durante a janela híbrida.

## Limites atuais

- RSA/ECDSA dos certificados ICP-Brasil e Ed25519 não resistem a um computador quântico criptograficamente relevante.
- O banco PostgreSQL mantém metadados operacionais no volume da VPS; os PDFs e evidências são cifrados na camada de aplicação.
- Segredos de serviço permanecem em arquivos montados com acesso restrito; não existe KMS pós-quântico homologado configurado na Hostinger.
- Um cliente TLS antigo pode negociar TLS 1.3 clássico; isso deve ser observado e, após cobertura suficiente, convertido em política mais restritiva.

## Critério de evolução

A fase ML-DSA entra somente quando houver: norma ITI aplicável, formato de prova definido, duas implementações independentes, rotação e recuperação de chaves ensaiadas, teste de interoperabilidade e relatório externo. Até lá, “pós-quântico” significa proteção híbrida de transporte e cifragem simétrica forte, nunca uma alegação falsa sobre a assinatura ICP-Brasil.

## Fontes rastreáveis

- [NIST FIPS 203, 204 e 205](https://www.nist.gov/news-events/news/2024/08/announcing-approval-three-federal-information-processing-standards-fips)
- [Go 1.24: X25519MLKEM768 no padrão TLS](https://go.dev/doc/go1.24)
- [ITI: grupo de trabalho para transição pós-quântica](https://www.gov.br/iti/pt-br/assuntos/noticias/indice-de-noticias/icp-brasil-se-prepara-para-a-era-pos-quantica-com-novo-grupo-de-trabalho-do-iti)
