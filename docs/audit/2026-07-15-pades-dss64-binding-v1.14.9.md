# Correção da vinculação PAdES/DSS 6.4

Data: 15/07/2026

Versões: portal `1.14.9`, bridge `1.3.26`, provider `1.2.6`

## Incidente reproduzido

O agente A3 concluiu a operação criptográfica, mas o bridge respondeu
`signed_document_mismatch` com a mensagem `Signed PDF changed the prepared
document pages, catalog, or form fields`.

O PDF real foi recomposto pelo provider Java/DSS 6.4 e a rejeição foi
reproduzida fora do navegador. A revisão assinada preservava integralmente o PDF
preparado como prefixo e acrescentava somente:

1. campo, widget, aparência e dicionário da assinatura;
2. atualização da última página para anexar o widget;
3. `/Extensions /ADBE`, `BaseVersion /1.7`, `ExtensionLevel 8`;
4. um `OutputIntent` sRGB com perfil ICC gerado pelo Java.

Referências de destinos em `/Names`, `/Outlines` e anotações alcançavam a última
página por outro caminho. A comparação recursiva incorporava nesses hashes a
alteração permitida do widget e produzia um falso positivo.

## Correção

- Novas apresentações já contêm a extensão ADBE e o `OutputIntent` antes do
  DTBS; o DSS não precisa alterar o catálogo ao concluir.
- A identidade e a ordem das referências de página integram o fingerprint, mas
  cada referência de página encerra a recursão; o conteúdo da página continua
  verificado separadamente.
- Tickets antigos aceitam somente o delta DSS documentado. O perfil ICC é
  validado por estrutura e pelo SHA-256
  `87e382b9336e6a0417a4d860173109ab319a029cf2972e19833a3327c65bd7e4`.
- Permanecem rejeitados perfil ICC diferente, condição diversa de `sRGB`, chave
  adicional no `OutputIntent`, extensão em outro nível, página alterada,
  catálogo arbitrário, XFA, ação ativa e cobertura incompleta.

## Evidências executadas

- `[V]` A saída DSS que reproduzia o incidente passou em
  `assertSignedPdfBoundToPresentation` após a correção.
- `[V]` Uma apresentação nova foi gerada a partir do PDF de regressão, assinada
  pelo teste Java/DSS e aceita pelo bridge; o DSS não registrou inclusão de novo
  perfil de cor.
- `[V]` O perfil Java 21 da imagem `pades-provider:1.2.6` na VPS possui `6.876`
  bytes e o mesmo SHA-256 congelado.
- `[V]` `npm run lint`: zero erro.
- `[V]` `npm run test:pki`: `87` testes, `80` aprovados, `7` ignorados por
  dependências externas ou capacidade criptográfica ausente, zero falha.
- `[V]` `npm test`: build Next.js e `105` testes, `98` aprovados, `7`
  ignorados, zero falha.
- `[V]` `mvn test` no provider: zero falha.

## Auditoria adversarial

A tentativa de usar o identificador solicitado `gpt-5.6-sol` falhou no backend
OAuth antes da análise e não foi contabilizada como aprovação. O fallback
suportado `gpt-5.5` revisou o diff em modo somente leitura e confirmou a
validação fechada das mutações semânticas. Foram tratados os dois apontamentos:

1. o perfil `srgb.icc` integra explicitamente o conjunto versionado e a imagem;
2. a expansão do perfil ICC passou a limitar a entrada comprimida a `64 KiB` e
   a saída do próprio `zlib` a `1 MiB`, com regressão para carga expansiva.

## Validação em produção

- `[V]` Backup anterior à implantação: `20260715T193441Z`.
- `[V]` Commit implantado: `b1dae8a50a34c76e645b9c8c61191aad8d13eab1`.
- `[V]` Portal `1.14.9`, bridge `1.3.26` e provider `1.2.6` permaneceram
  saudáveis; o health check declarou o provider e a assinatura A3 local como
  `ready`.
- `[V]` Uma assinatura A3 real foi concluída pelo agente do MacBook no ticket
  `MAI-2026-2HW5-MY1C-NA5W-P097`; a interface retornou `PAdES concluído e
  validado`, sem reproduzir `signed_document_mismatch`.
- `[V]` O registro imutável permaneceu em `completed` e gravou, em ordem, os
  eventos `ticket_created`, `evidence_embedded`, `signature_prepared` e
  `signature_completed`, todos com resultado `success`.
- `[V]` SHA-256 do PDF-fonte:
  `2bae891e279dd30a261801ce94a3f17cb0f5236119403b202ca484c87ff88feb`.
- `[V]` SHA-256 da apresentação congelada:
  `d5373af9b4fb0bbde2205752822cf5ee834841d494e01b1925840e57c3ab277f`.
- `[V]` SHA-256 do PDF assinado, idêntico no download, banco e verificador
  público: `298941d5d544097ff19a846f81e546825d0721d1c73d4acfee5b22488519c9a3`.
- `[V]` O DSS registrou integridade criptográfica e confiança como verdadeiras,
  indicação `TOTAL_PASSED`, política `2.16.76.1.7.1.11.1.3` e um signatário.
- `[V]` O `pdfsig` confirmou `ETSI.CAdES.detached`, SHA-256, cobertura integral
  e `Signature is Valid`.
- `[V]` O endpoint público retornou `documentStatus: active`,
  `proofVerified: true`, perfil `AD-RB`, `docMdp: valid` e atestado final
  ML-DSA-65.
- `[V]` As duas páginas foram renderizadas a `150 dpi`: a página original
  preservou conteúdo e recebeu somente a linha superior e a inscrição lateral;
  a página de evidências permaneceu legível, sem corte ou sobreposição.

## Fontes rastreáveis

- [Release DSS 6.4](https://github.com/esig/dss/releases/tag/6.4)
- [Inclusão do perfil sRGB no DSS 6.4](https://github.com/esig/dss/blob/6.4/dss-pades-pdfbox/src/main/java/eu/europa/esig/dss/pdf/pdfbox/visible/AbstractPdfBoxSignatureDrawer.java)
- [Teste ADBE 1.7/8 do DSS 6.4](https://github.com/esig/dss/blob/6.4/dss-pades/src/test/java/eu/europa/esig/dss/pades/signature/extension/PAdESLevelB17PdfDeveloperExtensionTest.java)
