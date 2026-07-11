import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return <LegalPage title="Termos de uso" lead="Condições essenciais para utilização do portal de assinaturas.">
    <h2>Uso do acesso</h2><p>Links e códigos são pessoais. O usuário deve impedir o acesso por terceiros e comunicar ao escritório qualquer suspeita de uso indevido.</p>
    <h2>Conferência do documento</h2><p>Antes de assinar, o usuário deve ler integralmente o documento e confirmar se seus dados e declarações estão corretos. Em caso de dúvida, deve interromper o fluxo e contatar o responsável.</p>
    <h2>Modalidades de assinatura</h2><p>O portal pode oferecer assinatura eletrônica com evidências do processo e assinatura digital baseada em certificado ICP-Brasil. A modalidade aplicável é informada no próprio fluxo.</p>
    <h2>Disponibilidade</h2><p>Podem ocorrer interrupções para manutenção, atualização ou eventos fora do controle razoável do escritório. Incidentes devem ser comunicados pelo canal de atendimento.</p>
    <h2>Contato</h2><p>Dúvidas sobre estes termos podem ser encaminhadas para <a href="mailto:admin@maiocchi.adv.br">admin@maiocchi.adv.br</a>.</p>
  </LegalPage>;
}
