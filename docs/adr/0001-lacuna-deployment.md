# ADR 0001 - Produto Lacuna e modelo de implantação

- Status: superado pelo ADR 0002
- Data: 2026-07-11
- Decisores: Maiocchi Advogado

## Contexto

O portal precisa acrescentar assinaturas PAdES com certificados ICP-Brasil ao fluxo documental do DocuSeal. `PkiSuiteSamples` demonstra REST PKI, REST PKI Core, Web PKI, Amplia, CloudHub e PKI Express, mas não é uma dependência de produção e não oferece licença de código inequívoca no repositório.

O portal processa documentos jurídicos. Enviar o PDF integral a um SaaS acrescentaria operador, transferência, retenção e dependência externa ao tratamento. A VPS possui 4 CPUs, 15 GiB de memória e espaço disponível suficiente para uma implantação adicional, mas capacidade técnica não substitui direito de uso nem suporte do fabricante.

Pesquisa comparativa: [provider PAdES no navegador](../architecture/pades-browser-provider-research.md).

Em 12 de julho de 2026, a implementação privada descrita no [ADR 0002](0002-private-pades-provider.md) removeu a dependência de licença Web PKI/REST PKI. Este ADR permanece como registro da decisão anterior e da análise do produto Lacuna.

## Decisão

Adotar **REST PKI Core on-premises + Web PKI**, mediante contrato e licença emitidos para os domínios do Maiocchi Advogado.

O `pki-bridge` será um serviço independente e consumirá a API oficial. O código será escrito a partir da documentação e do contrato de API. Nenhum arquivo de `PkiSuiteSamples` será copiado sem autorização expressa.

As chamadas serão feitas com `fetch` nativo do Node 22. O cliente oficial `restpki-core-client@1.0.2` não será usado enquanto mantiver a dependência descontinuada `request`: a auditoria de 11 de julho de 2026 encontrou seis vulnerabilidades transitivas, duas críticas. Os endpoints e modelos usados pelo bridge derivam do OpenAPI oficial 4.3.1.

O primeiro perfil de produção será definido com a Lacuna. A meta é PAdES com validação ICP-Brasil, revogação e carimbo de tempo/LTV quando contemplados pela política contratada. A interface não prometerá nível PAdES antes de o perfil ser comprovado em um PDF real.

## Alternativas rejeitadas

### REST PKI em nuvem

Reduz operação, mas transfere o PDF a terceiro e depende de acordo de tratamento, localização, retenção e transferência internacional. Pode ser reconsiderado se a proposta on-premises for inviável e os requisitos jurídicos forem satisfeitos.

### Incorporar os exemplos Node.js

Rejeitado. O projeto contém material de demonstração, dependências antigas, credenciais de teste e licença de código não identificada.

### Usar o cliente Node gerado sem revisão

Rejeitado no estado auditado. Embora o pacote exponha os métodos necessários, sua árvore de produção inclui vulnerabilidades críticas. Uma futura versão pode ser reconsiderada após `npm audit`, revisão do changelog e teste de compatibilidade.

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
