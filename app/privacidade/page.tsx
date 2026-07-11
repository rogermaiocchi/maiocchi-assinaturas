import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacidade" };

export default function PrivacyPage() {
  return <LegalPage title="Privacidade" lead="Como tratamos dados pessoais durante o envio e a assinatura de documentos.">
    <h2>Finalidade</h2><p>Os dados fornecidos no portal são tratados para identificar participantes, preparar, enviar, acompanhar e comprovar processos de assinatura, bem como cumprir obrigações legais e exercer direitos.</p>
    <h2>Dados tratados</h2><p>Podem ser tratados dados de identificação e contato, conteúdo dos documentos, informações técnicas de acesso e registros relacionados às ações realizadas durante o processo.</p>
    <h2>Compartilhamento e operadores</h2><p>O tratamento pode envolver fornecedores de infraestrutura, comunicação e assinatura estritamente necessários ao funcionamento do serviço, sujeitos a controles de acesso e deveres de confidencialidade.</p>
    <h2>Retenção e segurança</h2><p>Os registros são mantidos pelo período necessário às finalidades informadas, às obrigações legais e ao exercício regular de direitos. São adotadas medidas técnicas e administrativas compatíveis com o risco.</p>
    <h2>Seus direitos</h2><p>Solicitações relacionadas a acesso, correção, informação ou outros direitos previstos na legislação podem ser encaminhadas para <a href="mailto:admin@maiocchi.adv.br">admin@maiocchi.adv.br</a>.</p>
  </LegalPage>;
}
