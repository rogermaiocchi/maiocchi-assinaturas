# ADR 0003 - PJeOffice como referência de estrutura, não como integração

- Status: aceito
- Data: 2026-07-12
- Decisores: Maiocchi Advogado

## Contexto

O provider privado utiliza um agente macOS para operar um certificado A3 e um serviço DSS para preparar, concluir e validar PAdES. O PJeOffice Pro demonstra, no domínio judicial, a separação entre aplicação web e assinador instalado. A documentação pública do PJe informa, porém, que o uso do PJeOffice Pro por aplicações externas está limitado a domínios institucionais `*.jus.br`, `*.mp.br`, `*.gov.br` e `*.def.br`.

## Decisão

Usar PJeOffice somente como referência de princípios de interação:

1. operação criptográfica no dispositivo do titular;
2. aplicação web sem acesso à chave privada ou ao PIN;
3. confirmação explícita e seleção de certificado;
4. visualização objetiva de signatário, data, certificado e emissor.

O portal mantém seu próprio agente Swift/CryptoTokenKit, seu protocolo de ticket de uso único e seu provider DSS. Não chama, empacota, replica protocolo, replica whitelist ou declara compatibilidade com PJeOffice.

## Consequências

O comportamento de navegador e agente é controlado pelo escritório e deve ser testado independentemente. A restrição de domínios do PJeOffice não é removida, contornada nem usada como prova de conformidade do portal. A conformidade PAdES continua vinculada às políticas e aos validadores da ICP-Brasil.

## Fontes

- [PJeOffice Pro](https://docs.pje.jus.br/servicos-negociais/pjeoffice-pro/)
- [Regras de interface PJe - assinaturas do documento](https://docs.pje.jus.br/configura%C3%A7%C3%B5es-do-pje/Regras%20de%20interface/)
- [ITI - Instruções normativas](https://www.gov.br/iti/pt-br/assuntos/legislacao/instrucoes-normativas/instrucoes-normativas)
