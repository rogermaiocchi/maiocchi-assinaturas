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
- cabeçalho: ícone vetorial Lucide `fingerprint-pattern` imediatamente antes de
  “Evidências da assinatura digital”, com a mesma geometria no editor e no PDF.
- credencial ICP-Brasil: fundo de segurança sem marca institucional, com dados
  da assinatura alinhados à esquerda; só aparece no modo ICP-Brasil.
- modalidade não ICP-Brasil: quadro neutro, sem logo oficial, medalhão PAdES ou
  texto que sugira certificação ICP-Brasil.
- `PAdES AD-RB`: medalhão técnico reto, em azul-cobalto com filetes dourados,
  integrado às rosetas de passaporte na extremidade direita.
- selo: SVG-fonte e PNG `4096x835`, proporção do campo PAdES `453,55x92` pontos.
- o campo da assinatura não recebe título externo; os rótulos redundantes de
  “Resumo visual da assinatura” foram removidos do editor e do renderer.
- QR e Code 128: amostras do contrato canônico `/v/:publicId` e
  `MAI|<publicId>|R1`.

Para reconstruir o fundo 4K e a amostra composta:

```bash
node tools/pades-visual-editor/scripts/build-security-seal.mjs
node tools/pades-visual-editor/scripts/build-verification-codes.mjs
```

O selo é uma representação visual. O PDF assinado, o `ByteRange`, o CMS e a
cadeia ICP-Brasil permanecem as fontes de validade da assinatura.
