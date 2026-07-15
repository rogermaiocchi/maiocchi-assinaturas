# Hero institucional full-bleed v1.14.10

Data: 2026-07-15
Escopo: primeiro viewport de `assinatura.maiocchi.adv.br`

## Fonte visual rastreada

- [V] A implementação interna de referência foi lida em `src/components/layout/PageHero.tsx` do projeto Next institucional.
- [V] O padrão de referência combina imagem com `cover`, altura mínima de um viewport, overlays localizados e fade inferior contínuo para o fundo da página.
- [V] O acervo institucional da VPS contém 78 imagens utilizáveis, incluindo originais de 8280 x 4608 e 6144 x 10920.
- [V] Para a home foi escolhida a fotografia horizontal real do escritório, em 2752 x 1536, por preservar identificação institucional e permitir enquadramento responsivo sem ampliar um derivado pequeno.
- [V] O ativo otimizado `public/hero-home-maiocchi.webp` tem 214782 bytes e SHA-256 `e07d2df2d79e1852079df53b18f38cfccb86a22b0195e0d8ec55e657d9de5ae7`.

## Contrato implementado

- Imagem em elemento semântico de mídia com preenchimento total, `object-fit: cover`, prioridade de carregamento e `sizes="100vw"`.
- Altura mínima de um viewport, sem limite superior que recorte telas altas.
- Overlay escuro localizado para contraste do conteúdo e fade inferior de 220 a 340 px até o fundo `--paper`.
- Primeiro viewport mantém título, formulário de acesso, atalhos e sinais de confiança.
- A imagem não depende de `background-image`; extensões de contraste como Dark Reader não conseguem suprimi-la.
- Breakpoints de desktop, iPad e iPhone preservam o ponto focal e não alteram o fluxo funcional.

## Validação local

- [V] `npm run build`: 13 rotas estáticas geradas.
- [V] `npm run lint`: sem ocorrências.
- [V] `npm test`: 105 testes, 98 aprovados, 7 skips condicionais e 0 falhas.
- [V] Desktop 1440 x 900: hero 1425 x 900, conteúdo encerrado em y=788, sem overflow horizontal.
- [V] iPad 834 x 1194: hero 819 x 1194, conteúdo encerrado em y=1082, sem overflow horizontal.
- [V] iPhone 390 x 844: hero 375 x 844, conteúdo encerrado em y=792, sem overflow horizontal.
- [V] Nos três viewports a imagem permaneceu em `cover`, o conteúdo ficou dentro do hero e o console não registrou erros.

## Publicação

- Registro de backup, revisão de imagem e validação externa serão acrescentados depois da implantação.

## Rollback

- Restaurar a imagem anterior do serviço `portal` ou o backup imediatamente anterior à implantação.
- Não há migração de dados, alteração de endpoint nem mudança no contrato de autenticação.
