# Confiança ICP-Brasil para autenticação mTLS

O arquivo `icp-client-roots.crt` contém exclusivamente as âncoras gerais ICP-Brasil v5 e v12. Ele não contém ACs intermediárias.

Proveniência validada em 10 de julho de 2026:

- fonte oficial: `https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip`;
- SHA-512 publicado: `d26638955d930a18782683b665ac92447285eb0a4b54eb0665409faafcdab55ed846d9818e98a0c13848fc50538f81f1d0799c71afca40f34d0890ef01885e3d`;
- fonte do hash: `https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/hashsha512.txt`;
- SHA-256 do bundle PEM local: `b3900496ee48a5a9894f78ef14a21ffa0d8753a1825bc0ae084b984100559c5b`.

O bundle sozinho não autoriza ativar o login. A produção também exige handshake real com o A3, propósito `clientAuth`, validação de revogação e testes de falha fechada.

## Provider PAdES privado

O provider monta os certificados DER `ICP-Brasilv*.crt` individualmente em `/run/icp-trust`. Somente raízes vigentes de assinatura são tratadas como confiáveis; certificados de AC intermediária não pertencem a esta pasta.

Arquivos obtidos diretamente do [Repositório AC-Raiz do ITI](https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz) em 12 de julho de 2026:

| Arquivo | SHA-256 |
|---|---|
| `ICP-Brasilv4.crt` | `857ff3bf31628979e479c5bc0bdf3e706bcc7bafb7ddf0c1134fc21f1cfab141` |
| `ICP-Brasilv5.crt` | `5bd85f219695dabe6cf3d4bd713d9bd8e41b2323194022acf1acd658daef148a` |
| `ICP-Brasilv6.crt` | `a91e45782e58755dffc6621cb05c2342db74398ffc6e930b0b3a23325a3bfdfd` |
| `ICP-Brasilv7.crt` | `4fe1d8599fc00f0b61b12391c98d97af36bcada115bd894f8755e01e212bc4be` |
| `ICP-Brasilv12.crt` | `ce6c66c73e41b12881ea8a9b8cb7efef9a482ea012c3cd3b843667e37a7a145c` |
| `ICP-Brasilv13.crt` | `da54711b5816a2487903c62de28402dca2eea21ccc4e977f1d2645486d84d30c` |

Antes da implantação, `openssl x509` deve confirmar `subject = issuer` em cada arquivo. A atualização exige nova conferência na fonte do ITI, revisão dos hashes e ensaio de regressão com certificado real.

O provider carrega somente os nomes declarados em `ICP_TRUST_ROOTS`. A raiz v7 é preservada para rastreabilidade, mas fica fora da lista operacional porque DSS/JCA 6.4 não reconhece seu algoritmo OID `1.3.6.1.4.1.44588.2.1`; incluí-la faria o startup falhar fechado.
