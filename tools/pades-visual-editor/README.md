# Laboratório visual PAdES

Cópia de trabalho interativa da folha de evidências. A ferramenta não altera a
baseline criptográfica aprovada pelo VALIDAR ITI.

## Executar

```bash
./node_modules/.bin/vite tools/pades-visual-editor --host 127.0.0.1 --port 4179
```

Abra `http://127.0.0.1:4179/`. Cada bloco pode ser movido pela etiqueta amarela,
redimensionado pelo canto inferior direito e refinado por coordenadas no painel.
Os textos sublinhados são editáveis. O botão de download exporta as coordenadas
e a modalidade em JSON. O editor importa a geometria canônica do renderer, por
isso a composição visual corresponde ao PDF preparado para assinatura.

## Ativos

- folha A4: margens de 3 cm no topo e à esquerda, e 2 cm na base e à direita.
- cabeçalho: “Evidências da assinatura digital” alinhado à esquerda, sem ícone,
  e “Modalidade · ICP-Brasil” no lado oposto quando a infraestrutura validada
  for ICP-Brasil.
- credencial ICP-Brasil: fundo de segurança sem marca institucional, com dados
  da assinatura alinhados à esquerda e marca oficial ICP-Brasil à direita; só
  aparece no modo ICP-Brasil.
- modalidade não ICP-Brasil: quadro neutro com a marca tipográfica PAdES no
  lugar da marca ICP-Brasil, sem OID ou texto que sugira certificação
  ICP-Brasil. GOV.BR reconhecido mantém o link oficial do ITI; assinatura
  simples não o exibe.
- `PAdES AD-RB`: identificação textual vinculada aos dados assinados, sem
  medalhão autodeclaratório; a marca oficial exibida decorre da infraestrutura
  confirmada pelo certificado.
- selo: SVG-fonte e PNG `4096x835`, proporção do campo PAdES `453,55x92` pontos.
- o campo da assinatura não recebe título externo; os rótulos redundantes de
  “Resumo visual da assinatura” foram removidos do editor e do renderer.
- QR e Code 128: amostras do contrato canônico `/validar?codigo=:publicId` e
  `MAI|<publicId>|R1`. O payload do Code 128 permanece codificado nas barras,
  sem repetição textual acima delas.
- todas as páginas: linha dourada superior de `3 pt`;
- páginas originais: faixa lateral direita sem divisor, com a marca `m.`
  centralizada e uma única inscrição vertical contínua, sem quebra:
  `ASSINATURA.MAIOCCHI.ADV.BR - DOCUMENTO <número> - HASH <SHA-256> - CÓDIGO <PQC-MLDSA65> - VERIFICAÇÃO <ID público> - PÁG <atual> DE <total>`.
  A folha final não recebe essa faixa.
- validação: o quadro `VALIDAR O ORIGINAL` exibe o endereço do portal e,
  somente nos modos ICP-Brasil e GOV.BR reconhecido, o link clicável
  `validar.iti.gov.br` na linha seguinte.
- folha final: não exibe o rótulo isolado `VALIDAR`, payload textual do Code
  128, repetição do código no quadro de validação nem numeração de página. Todo
  o grid fica dentro das margens de 3 cm no topo/esquerda e 2 cm na base/direita.
- base legal ICP-Brasil: `MP 2.200-2/2001, art. 10, § 1º · L 14.063/2020,
  art. 4º, III.`, sem prefixo autodeclaratório.

Para reconstruir o fundo 4K e a amostra composta:

```bash
node tools/pades-visual-editor/scripts/build-security-seal.mjs
node tools/pades-visual-editor/scripts/build-verification-codes.mjs
```

O selo é uma representação visual. O PDF assinado, o `ByteRange`, o CMS e a
cadeia ICP-Brasil permanecem as fontes de validade da assinatura.
