# Revisão PJeOffice, ICP-Brasil e Certisign

- Data: 2026-07-12
- Escopo: provider PAdES privado com certificado A3 no macOS
- Método: fontes oficiais rastreáveis, mesa de agentes isolados e auditoria adversarial

## Evidência confirmada

1. PJeOffice Pro é um assinador local do ecossistema PJe. A documentação informa limitação atual de uso externo a domínios institucionais; o portal Maiocchi não deve integrá-lo nem alegar compatibilidade.
2. A interface PJe especifica a apresentação de signatário, data, CN do certificado e emissor. Esses quatro elementos foram adotados como referência de UX do portal.
3. A página do ITI lista DOC-ICP-15.01, DOC-ICP-15.02 e DOC-ICP-15.03 como referências em vigor, com alterações de 2025 para a política. A política e as raízes devem permanecer fixadas por artefato e hash no deploy.
4. A Certisign condiciona o uso A3 em macOS à mídia e ao software criptográfico correspondente. Compatibilidade deve ser provada por tupla de ambiente, não inferida por marca do certificado.

## Mesa e auditoria

A mesa registrou respostas independentes de xAI e Z.AI, com substituição local para duas vozes que excederam o tempo limite. A auditoria Qwen foi solicitada com override `qwen3.7-max`; ela indicou controles úteis de supply chain, compatibilidade, evidência e observabilidade, mas também trouxe afirmações não comprovadas sobre PSC, PKCS#11, TCC e admissibilidade judicial. Essas afirmações foram classificadas como hipóteses, não requisitos normativos.

## Decisão

Adotar padrões de separação navegador/agente, confirmação explícita e apresentação de metadados. Rejeitar qualquer cópia ou integração de PJeOffice. Manter o provider independente, com DSS no servidor e CryptoTokenKit no MacBook, e elevar progressivamente a maturidade por quatro gates verificáveis:

1. matriz de compatibilidade por mídia/driver/macOS;
2. distribuição Apple assinada, hardened runtime e notarização antes de terceiros;
3. procedimento versionado de OCSP/CRL, carimbo do tempo e retenção de evidências;
4. SBOM, inventário de dependências e trilha de atualizações do agente e do provider.

## Fontes

- [PJeOffice Pro](https://docs.pje.jus.br/servicos-negociais/pjeoffice-pro/)
- [PJe - regras de interface de assinatura](https://docs.pje.jus.br/configura%C3%A7%C3%B5es-do-pje/Regras%20de%20interface/)
- [ITI - instruções normativas](https://www.gov.br/iti/pt-br/assuntos/legislacao/instrucoes-normativas/instrucoes-normativas)
- [Certisign - drivers A3](https://suporte.certisign.com.br/duvidas-suporte/certificado-a3-drivers?cod_rev=102497)
