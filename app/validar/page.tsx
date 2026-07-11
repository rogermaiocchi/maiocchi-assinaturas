import type { Metadata } from "next";
import { BadgeCheck, ExternalLink, FileCheck2, FileLock2, SearchCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Validar assinatura" };

export default function ValidationPage() {
  return <LegalPage title="Validar assinatura" lead="Valide o arquivo eletrônico original. Uma impressão ou captura de tela não conserva todas as evidências." currentPath="/validar/">
    <FlowMap eyebrow="Conferência" title="Valide antes de confiar." description="A marca visível no PDF é apenas um sinal gráfico. A conclusão depende das evidências eletrônicas do arquivo." ariaLabel="Fluxo para validação de assinatura eletrônica" steps={[
      { title: "Preservar o original", description: "Não edite nem imprima para PDF o arquivo recebido.", icon: FileLock2 },
      { title: "Abrir o validador", description: "Envie o original ao serviço oficial do ITI.", icon: SearchCheck, href: "https://validar.iti.gov.br/", linkLabel: "Abrir ITI" },
      { title: "Ler o resultado", description: "Confira signatário, integridade, cadeia e horário.", icon: BadgeCheck, tone: "yellow" },
      { title: "Guardar evidências", description: "Preserve o PDF e o relatório junto ao processo.", icon: FileCheck2 },
    ]} />
    <h2>Validador oficial do ITI</h2><p>O Validador do ITI verifica assinaturas ICP-Brasil e assinaturas avançadas GOV.BR. O arquivo é enviado ao serviço oficial conforme seus próprios termos.</p>
    <p><a className="button button--yellow" href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={18} /><span>Abrir Validador do ITI</span></a></p>
    <h2>Adobe Acrobat Reader</h2><p>Abra o PDF original e consulte o painel de assinaturas. Para documentos GOV.BR, siga a orientação oficial para importar a cadeia de certificados quando o Adobe ainda não reconhecer a autoridade.</p>
    <h2>O que conferir</h2><ul><li>nome do signatário e emissor do certificado;</li><li>resultado da integridade do documento;</li><li>validade, revogação e política informadas;</li><li>horário e carimbo de tempo, quando existentes;</li><li>alterações posteriores à assinatura.</li></ul>
    <h2>Resultado inválido ou indeterminado</h2><p>Não confie apenas na marca visual. Preserve o arquivo recebido, não o edite e envie o resultado da validação a <a href="mailto:roger@maiocchi.adv.br?subject=Validação%20de%20assinatura">roger@maiocchi.adv.br</a>.</p>
    <h2>Fontes</h2><p>Consulte o <a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer">Validador do ITI</a> e a <a href="https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/saiba-como-importar-os-certificados-do-gov-br-no-adobe-acrobat-reader" target="_blank" rel="noreferrer">orientação de certificados GOV.BR</a>.</p>
  </LegalPage>;
}
