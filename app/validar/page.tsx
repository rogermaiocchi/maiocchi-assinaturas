import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Validar assinatura" };

export default function ValidationPage() {
  return <LegalPage title="Validar assinatura" lead="Valide o arquivo eletrônico original. Uma impressão ou captura de tela não conserva todas as evidências.">
    <h2>Validador oficial do ITI</h2><p>O Validador do ITI verifica assinaturas ICP-Brasil e assinaturas avançadas GOV.BR. O arquivo é enviado ao serviço oficial conforme seus próprios termos.</p>
    <p><a className="button button--yellow" href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer">Abrir Validador do ITI</a></p>
    <h2>Adobe Acrobat Reader</h2><p>Abra o PDF original e consulte o painel de assinaturas. Para documentos GOV.BR, siga a orientação oficial para importar a cadeia de certificados quando o Adobe ainda não reconhecer a autoridade.</p>
    <h2>O que conferir</h2><ul><li>nome do signatário e emissor do certificado;</li><li>resultado da integridade do documento;</li><li>validade, revogação e política informadas;</li><li>horário e carimbo de tempo, quando existentes;</li><li>alterações posteriores à assinatura.</li></ul>
    <h2>Resultado inválido ou indeterminado</h2><p>Não confie apenas na marca visual. Preserve o arquivo recebido, não o edite e envie o resultado da validação a <a href="mailto:roger@maiocchi.adv.br?subject=Validação%20de%20assinatura">roger@maiocchi.adv.br</a>.</p>
    <h2>Fontes</h2><p>Consulte o <a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer">Validador do ITI</a> e a <a href="https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/saiba-como-importar-os-certificados-do-gov-br-no-adobe-acrobat-reader" target="_blank" rel="noreferrer">orientação de certificados GOV.BR</a>.</p>
  </LegalPage>;
}
