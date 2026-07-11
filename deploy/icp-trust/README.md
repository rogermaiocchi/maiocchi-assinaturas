# Confiança ICP-Brasil para autenticação mTLS

O arquivo `icp-client-roots.crt` contém exclusivamente as âncoras gerais ICP-Brasil v5 e v12. Ele não contém ACs intermediárias.

Proveniência validada em 10 de julho de 2026:

- fonte oficial: `https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip`;
- SHA-512 publicado: `d26638955d930a18782683b665ac92447285eb0a4b54eb0665409faafcdab55ed846d9818e98a0c13848fc50538f81f1d0799c71afca40f34d0890ef01885e3d`;
- fonte do hash: `https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/hashsha512.txt`;
- SHA-256 do bundle PEM local: `b3900496ee48a5a9894f78ef14a21ffa0d8753a1825bc0ae084b984100559c5b`.

O bundle sozinho não autoriza ativar o login. A produção também exige handshake real com o A3, propósito `clientAuth`, validação de revogação e testes de falha fechada.
