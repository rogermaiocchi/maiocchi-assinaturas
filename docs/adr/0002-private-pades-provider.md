# ADR 0002 - Provider PAdES privado com A3

- Status: aceito
- Data: 2026-07-12
- Decisores: Maiocchi Advogado

## Contexto

O Web PKI/REST PKI exigia licença, security context e homologação de fornecedor. O MacBook expõe o A3 pelo CryptoTokenKit, mas o OpenSC não reconhece esse token. O navegador não acessa chaves privadas de smart card diretamente.

## Decisão

Adotar um provider privado com duas partes:

1. `pades-provider`: Java 21 e DSS 6.4 da Comissão Europeia, isolado na rede Docker interna. Prepara DTBS, conclui PAdES, valida cadeia, integridade, política e revogação.
2. `maiocchi-pades-agent`: Swift e `Security.framework`, escutando apenas em `127.0.0.1:35100`. Lista identidades CryptoTokenKit e executa RSA-SHA256 no A3 após confirmação local.

O perfil inicial é PAdES AD-RB v1.3, OID `2.16.76.1.7.1.11.1.3`, com artefato e digest publicados pelo ITI. O motor não inicia sem política e raízes ICP-Brasil verificadas.

O navegador recebe um ticket de 256 bits no fragmento da URL. O banco preserva somente SHA-256 do ticket. Cada ticket é de uso único e vinculado ao PDF congelado, certificado, DTBS, sessão DSS e prazo.

## Segurança

- PIN e chave privada nunca saem do CryptoTokenKit.
- O agente aceita somente Host loopback e origens explícitas.
- O provider não possui rota pública nem acesso a segredos do token.
- A busca CRL/OCSP bloqueia destinos locais/privados, redirects, esquemas e portas não autorizados.
- PDF, certificado, DTBS, assinatura e resultado são vinculados por SHA-256 e transições atômicas.
- Qualquer falha de política, cadeia, revogação ou integridade impede a entrega do PDF.

## Consequências

O escritório assume manutenção, revisão de segurança, assinatura/notarização do agente e atualização das políticas/raízes. O DSS é LGPL 2.1; o código próprio permanece separado. Distribuição para outros Macs exige Developer ID e notarização Apple.

## Fontes

- [DSS: criação em três passos e PAdES](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/doc/dss-documentation.html)
- [Apple: SecKeyCreateSignature](https://developer.apple.com/documentation/security/seckeycreatesignature(_:_:_:_:))
- [ITI: política AD-RB](https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb)
- [ITI: repositório AC-Raiz](https://www.gov.br/iti/pt-br/assuntos/repositorio/repositorio-ac-raiz)
