import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Assinatura GOV.BR" };

export default function GovBrSignaturePage() {
  return <LegalPage title="Assinatura GOV.BR" lead="O GOV.BR oferece assinatura avançada em serviço oficial, fora da infraestrutura do escritório.">
    <h2>Quem pode usar</h2><p>Pessoas com conta GOV.BR nível prata ou ouro podem usar o Portal de Assinaturas GOV.BR. O certificado avançado é emitido e armazenado na infraestrutura do ITI.</p>
    <h2>Como assinar</h2>
    <ol className="ordered-guide">
      <li>Baixe o documento disponibilizado pelo Maiocchi Advogado.</li>
      <li>Acesse o <a href="https://assinador.iti.br/assinatura/index.xhtml" target="_blank" rel="noreferrer">Portal de Assinatura Eletrônica GOV.BR</a>.</li>
      <li>Entre com sua conta, envie o arquivo e posicione a assinatura.</li>
      <li>Conclua a autorização no aplicativo GOV.BR.</li>
      <li>Baixe o arquivo assinado. Não use “imprimir para PDF”.</li>
      <li>Envie ao escritório somente pelo canal indicado no processo.</li>
    </ol>
    <h2>Integração com sistemas</h2><p>A API GOV.BR é destinada a órgãos e entes públicos. O Maiocchi Advogado não apresenta este portal como integração direta com a API governamental; ele oferece orientação e conferência do documento assinado externamente.</p>
    <h2>Conferência</h2><p>Use o <a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer">Validador do ITI</a>. No Adobe Reader, pode ser necessário importar a cadeia oficial de certificados GOV.BR para exibir confiança.</p>
    <h2>Fontes oficiais</h2>
    <ul className="source-list">
      <li><a href="https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica" target="_blank" rel="noreferrer">Governo Digital: assinatura eletrônica</a></li>
      <li><a href="https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/saiba-como-importar-os-certificados-do-gov-br-no-adobe-acrobat-reader" target="_blank" rel="noreferrer">Importar certificados GOV.BR no Adobe Reader</a></li>
      <li><a href="https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/assinatura-eletronica-para-orgaos" target="_blank" rel="noreferrer">Integração GOV.BR para órgãos públicos</a></li>
    </ul>
  </LegalPage>;
}
