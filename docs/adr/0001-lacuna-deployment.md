# ADR 0001 - Produto Lacuna e modelo de implantação

- Status: bloqueado por contratação
- Data: 2026-07-11
- Decisores: Maiocchi Advogado

## Contexto

O portal precisa acrescentar assinaturas PAdES com certificados ICP-Brasil ao fluxo documental do DocuSeal. `PkiSuiteSamples` demonstra REST PKI, REST PKI Core, Web PKI, Amplia, CloudHub e PKI Express, mas não é uma dependência de produção e não oferece licença de código inequívoca no repositório.

O portal processa documentos jurídicos. Enviar o PDF integral a um SaaS acrescentaria operador, transferência, retenção e dependência externa ao tratamento. A VPS possui 4 CPUs, 15 GiB de memória e espaço disponível suficiente para uma implantação adicional, mas capacidade técnica não substitui direito de uso nem suporte do fabricante.

## Decisão

Adotar **REST PKI Core on-premises + Web PKI**, mediante contrato e licença emitidos para os domínios do Maiocchi Advogado.

O `pki-bridge` será um serviço independente e consumirá a API oficial. O código será escrito a partir da documentação e do contrato de API. Nenhum arquivo de `PkiSuiteSamples` será copiado sem autorização expressa.

O primeiro perfil de produção será definido com a Lacuna. A meta é PAdES com validação ICP-Brasil, revogação e carimbo de tempo/LTV quando contemplados pela política contratada. A interface não prometerá nível PAdES antes de o perfil ser comprovado em um PDF real.

## Alternativas rejeitadas

### REST PKI em nuvem

Reduz operação, mas transfere o PDF a terceiro e depende de acordo de tratamento, localização, retenção e transferência internacional. Pode ser reconsiderado se a proposta on-premises for inviável e os requisitos jurídicos forem satisfeitos.

### Incorporar os exemplos Node.js

Rejeitado. O projeto contém material de demonstração, dependências antigas, credenciais de teste e licença de código não identificada.

### Implementar criptografia PDF manualmente

Rejeitado. Política ICP-Brasil, revogação, cadeia, PAdES e LTV exigem implementação especializada e continuamente atualizada.

### Usar o módulo mTLS existente

Rejeitado para assinatura de documentos. Autenticação TLS de cliente comprova uma sessão; não cria assinatura PAdES no PDF.

## Gate de promoção

G02 somente será concluída quando existirem, em canal seguro:

1. contrato/licença aplicável a REST PKI Core e Web PKI;
2. domínios de produção e homologação autorizados;
3. política de assinatura e timestamp definida;
4. SLA, suporte e procedimento de atualização;
5. acordo de tratamento ou declaração de ausência de processamento externo;
6. credenciais instaladas fora do repositório;
7. autorização escrita para qualquer código de exemplo reutilizado.

Até esse gate, o provider de produção permanece fail-closed.
