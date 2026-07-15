# Baseline do padrão simplificado de e-mail v1.14.8

Data: 15/07/2026

## Contrato visual e textual

Todos os e-mails transacionais usam o layout central do DocuSeal Maiocchi e
seguem esta ordem visível:

1. `Prezado(a),`
2. conteúdo específico da mensagem;
3. `Respeitosamente,`;
4. **Roger Maiocchi**;
5. aviso de mensagem automática com o mini-logo `m.`.

- [V] A linha amarela superior e a marca isolada que a acompanhava foram
  removidas.
- [V] O fechamento não contém mais a palavra `Advogado`.
- [V] O SVG de robô foi removido; o aviso automático usa o mini-logo textual
  `m.` com ponto amarelo.
- [V] O conteúdo funcional próprio de cada mensagem, os links institucionais
  e o aviso automático foram preservados.
- [V] O texto alternativo inicia pela saudação e conserva o mesmo fechamento
  e aviso da versão HTML.
- [V] `From`, `Reply-To` e o destinatário institucional usam exclusivamente
  `roger@maiocchi.adv.br`.
- [V] Não há link de código-fonte nem anexo automático.

## Implementação reproduzível

| Componente | Versão | Revisão |
|---|---|---|
| Portal | `1.14.8` | `04fdcb1488665ff75c0c96fce1d9ff032bdc4696` |
| DocuSeal Maiocchi | `3.0.1-maiocchi.14` | `04fdcb1488665ff75c0c96fce1d9ff032bdc4696` |

- [V] O patch incremental está em
  `patches/docuseal/0008-simplified-email-standard.patch`.
- [V] O arquivo-fonte correspondente está em
  `compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz`, contém 1.123
  arquivos sem atributos Apple/PAX e possui SHA-256
  `e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c`.
- [V] O mesmo hash foi obtido no MacBook e na cópia da VPS.

## Testes

- [V] A suíte Ruby específica executou sete exemplos e zero falha.
- [V] O workspace executou 103 testes: 96 aprovações, sete skips
  condicionais e zero falha; ESLint aprovado.
- [V] Os testes verificam contagem e ordem dos elementos, alternativa textual,
  cabeçalhos canônicos, ausência de duplicação nos templates e bloqueio de
  anexos automáticos.
- [V] Uma mensagem SMTP de configuração foi construída dentro do container de
  produção, sem entrega. O resultado confirmou uma saudação, uma assinatura,
  um aviso, um mini-logo, contrato textual verdadeiro e ausência da linha
  amarela, SVG de robô e assinatura antiga.

## Produção

| Serviço | Imagem | ID |
|---|---|---|
| Portal | `maiocchi/assinatura-portal:1.14.8` | `sha256:a9114bcfcde8d74114223ea4eed15fb6e63551eb78ae9ebe3752677ebdd74b38` |
| DocuSeal | `maiocchi/docuseal:3.0.1-maiocchi.14` | `sha256:8bc79198b840ba42b1b2122775edf506e8ddf46c1595c09cf498f92ba86955d7` |
| PKI bridge | `maiocchi/pki-bridge:1.3.25` | inalterada |
| PAdES provider | `maiocchi/pades-provider:1.2.6` | inalterada |

- [V] As quatro imagens estão em execução e saudáveis.
- [V] `/`, `/validar/` e `/up` respondem HTTP `200` pelo domínio público.
- [V] Portal e DocuSeal apresentaram zero ocorrência de erro nos logs do
  intervalo posterior à implantação.
- [V] O backup cifrado anterior ao deploy, ID `20260715T183841Z`, terminou com
  código `0` em 15/07/2026 às 18:39:12 UTC.

## Cadeia de suprimentos

- [V] Syft `1.46.0` gerou SBOM CycloneDX das imagens amd64 exatas atualizadas.
- [V] Grype `0.115.0` preserva 24 correspondências brutas nas quatro imagens:
  duas altas, 21 médias e uma baixa, sem achado novo em relação à release
  anterior.
- [V] A declaração `compliance/vex/release-1.14.8.openvex.json` contém
  exatamente os 13 pares produto/CVE distintos dos relatórios: zero ausência
  e zero excedente; `vexctl 0.4.4` a analisou sem erro.
- [V] O VEX não altera nem suprime os relatórios brutos e deverá ser reavaliado
  quando dependências ou caminhos de execução mudarem.

## Estado

[V] O padrão simplificado está versionado, testado, implantado e renderizado
na produção. Nenhuma mensagem real foi enviada durante a validação.
