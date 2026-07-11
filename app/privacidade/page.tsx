import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacidade" };

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidade" lead="Como o Maiocchi Advogado trata dados pessoais durante a preparação e a assinatura de documentos.">
    <p className="legal-meta">Versão de 11 de julho de 2026.</p>
    <h2>1. Controlador e contato</h2><p>O tratamento é realizado no contexto da atividade profissional do Maiocchi Advogado, sob responsabilidade de Roger Maiocchi, OAB/DF 31.249. Solicitações de titulares e comunicações de privacidade devem ser enviadas a <a href="mailto:roger@maiocchi.adv.br">roger@maiocchi.adv.br</a>.</p>
    <h2>2. Alcance</h2><p>Esta política abrange o portal público, o ambiente DocuSeal, convites, preenchimento, assinaturas, validação, suporte e registros técnicos associados. Sites oficiais ou serviços externos acessados por link possuem políticas próprias.</p>
    <h2>3. Dados tratados</h2><p>Podem ser tratados nome, contato, função, dados de identificação presentes no documento, conteúdo documental, campos preenchidos, assinatura desenhada, certificado público, resultado de validação, IP, navegador, data, horário, eventos e comunicações de suporte.</p>
    <h2>4. Dados de maior risco</h2><p>Documentos jurídicos podem conter dados sensíveis, financeiros, de crianças, informações processuais ou conteúdo protegido por segredo profissional. O acesso é limitado ao fluxo e às pessoas autorizadas.</p>
    <h2>5. Finalidades</h2><p>Os dados são usados para preparar o documento, identificar participantes, entregar acesso, coletar manifestação de vontade, produzir evidências, validar assinaturas, disponibilizar a cópia final, prevenir abuso, atender solicitações e cumprir deveres legais e profissionais.</p>
    <h2>6. Bases legais</h2><p>Conforme o contexto, o tratamento pode decorrer de execução de contrato ou procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos e legítimo interesse avaliado. Consentimento será solicitado apenas quando for a base adequada, de forma específica e revogável.</p>
    <h2>7. Compartilhamento</h2><p>Dados podem ser processados por fornecedores necessários de infraestrutura e e-mail. Componentes de assinatura digital somente recebem dados nos limites do serviço contratado. Não vendemos dados nem os usamos para publicidade comportamental.</p>
    <h2>8. Transferência internacional</h2><p>A infraestrutura principal permanece na VPS contratada. Eventual processamento estrangeiro por fornecedor somente será adotado após avaliação, garantia contratual e atualização desta política.</p>
    <h2>9. Retenção</h2><p>Documentos, evidências e relatórios são mantidos pelo período necessário ao serviço, à obrigação legal, à preservação do segredo profissional e ao exercício de direitos. Sessões temporárias e registros operacionais seguem prazos menores. A eliminação considera também cópias de segurança e impedimentos legais.</p>
    <h2>10. Segurança</h2><p>São empregados HTTPS, controles de acesso, isolamento de serviços, trilha de eventos, backups, limitação de requisições e atualização de componentes. Nenhum sistema elimina todo risco; incidentes devem ser comunicados imediatamente pelo canal informado.</p>
    <h2>11. Certificados digitais</h2><p>Chave privada, arquivo A1, PIN e senha não devem ingressar no portal. A operação criptográfica do certificado permanece no dispositivo ou serviço controlado pelo titular. O sistema pode tratar apenas dados públicos do certificado e o resultado da validação.</p>
    <h2>12. Direitos do titular</h2><p>O titular pode solicitar confirmação, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio, eliminação quando cabível, portabilidade nos termos regulamentares, oposição e revisão de decisão automatizada, se houver. A identidade do requerente poderá ser verificada antes da resposta.</p>
    <h2>13. Incidentes</h2><p>Incidentes são avaliados quanto à natureza dos dados, alcance e risco. Quando a legislação exigir, serão comunicados à ANPD e aos titulares, com as medidas de contenção e mitigação aplicáveis.</p>
    <h2>14. Atualizações</h2><p>Esta política será revista quando o fluxo, os fornecedores ou a legislação mudarem. A versão vigente permanecerá disponível nesta página.</p>
    <h2>15. Fontes legais</h2><p>Consulte a <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm" target="_blank" rel="noreferrer">Lei Geral de Proteção de Dados Pessoais</a> e as orientações da <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noreferrer">Autoridade Nacional de Proteção de Dados</a>.</p>
  </LegalPage>;
}
