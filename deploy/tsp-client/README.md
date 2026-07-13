# Credencial cliente da ACT

Este diretório é somente o ponto de montagem do mTLS usado por uma Autoridade de
Carimbo do Tempo ICP-Brasil. Nenhuma credencial integra o repositório.

Quando `PADES_TSP_MODE=act-mtls`, instalar na VPS:

- `client.p12`, modo `0600`, fora do Git;
- senha em `PADES_TSP_KEYSTORE_PASSWORD`, pelo mecanismo de secrets da VPS;
- URL e, quando exigido pela ACT, OID da política em variáveis de ambiente.

Com o modo padrão `disabled`, o diretório permanece vazio.
