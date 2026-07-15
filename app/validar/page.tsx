import type { Metadata } from "next";
import { ExternalLink, FileCheck2, Fingerprint, QrCode, SearchCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";
import { AuthenticityVerifier } from "./authenticity-verifier";

export const metadata: Metadata = { title: "Validar assinatura" };

export default function ValidationPage() {
  return <LegalPage title="Validar assinatura" lead="Confira a chave impressa, compare o PDF eletrônico original e valide a assinatura pelos canais adequados." currentPath="/validar/">
    <AuthenticityVerifier />
    <FlowMap eyebrow="Conferência" title="Do papel ao original eletrônico." description="A via impressa conduz ao registro; a conclusão jurídica continua vinculada ao PDF final e às evidências da modalidade utilizada." ariaLabel="Fluxo para validação de documento eletrônico" steps={[
      { title: "Ler a chave", description: "Use o QR Code ou o ID alfanumérico da folha impressa.", icon: QrCode },
      { title: "Comparar o hash", description: "Calcule localmente o SHA-256 do PDF recebido.", icon: Fingerprint },
      { title: "Validar quando elegível", description: "ICP-Brasil e GOV.BR reconhecido também podem ser conferidos no VALIDAR ITI.", icon: SearchCheck, href: "https://validar.iti.gov.br/", linkLabel: "Abrir ITI", tone: "yellow" },
      { title: "Preservar evidências", description: "Guarde o PDF original e o relatório de validação sem alterações.", icon: FileCheck2 },
    ]} />
    <h2>Documento eletrônico e via impressa</h2><p>O PDF final é o documento eletrônico original. A folha impressa é somente uma representação de consulta: ela contém o ID, o hash completo e o QR Code, mas não substitui as assinaturas nem a trilha de validação presentes no arquivo eletrônico. Nas assinaturas qualificadas, o original utiliza PAdES ICP-Brasil.</p>
    <h2>Hash depois da assinatura</h2><p>O SHA-256 desta chave é calculado sobre os bytes finais do PDF já assinado e validado. Ele fica no registro externo e na folha de autenticidade. Inserir esse hash no próprio PDF depois da assinatura alteraria o arquivo e quebraria a correspondência criptográfica.</p>
    <h2>Endereços padronizados</h2><p>A chave de qualquer documento registrado é conferida em <strong>assinatura.maiocchi.adv.br/validar</strong>. Quando a infraestrutura da assinatura também for aceita pelo serviço oficial, a folha e o registro apresentam <strong>validar.iti.gov.br</strong>.</p>
    <h2>Validador oficial do ITI</h2><p>O Validador do ITI verifica assinaturas qualificadas ICP-Brasil e assinaturas avançadas de infraestruturas oficialmente reconhecidas, como GOV.BR. Assinaturas simples não recebem esse destino. O arquivo é enviado ao serviço oficial conforme seus próprios termos.</p>
    <p><a className="button button--yellow" href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" size={18} /><span>Abrir Validador do ITI</span></a></p>
    <h2>Adobe Acrobat Reader</h2><p>Abra o PDF original e consulte o painel de assinaturas. Para documentos GOV.BR, siga a orientação oficial para importar a cadeia de certificados quando o Adobe ainda não reconhecer a autoridade.</p>
    <h2>O que conferir</h2><ul><li>nome do signatário e emissor do certificado;</li><li>resultado da integridade do documento;</li><li>validade, revogação e política informadas;</li><li>horário e carimbo de tempo, quando existentes;</li><li>alterações posteriores à assinatura.</li></ul>
    <h2>Resultado inválido ou indeterminado</h2><p>Não confie apenas na marca visual, no QR Code ou no resultado da comparação de hash. Preserve o arquivo recebido, não o edite e encaminhe o relatório pela <a href="/ajuda/">Central de ajuda</a>.</p>
    <h2>Fontes</h2><p>Consulte o <a href="https://validar.iti.gov.br/guia-desenvolvedor.html" target="_blank" rel="noreferrer">Guia do Desenvolvedor do VALIDAR</a>, o <a href="https://www.gov.br/iti/pt-br/assuntos/legislacao/documentos-principais/v9.1_IN2021_03_DOCICP15.03_compilada.pdf" target="_blank" rel="noreferrer">DOC-ICP-15.03 v9.1</a> e o <a href="https://validar.iti.gov.br/" target="_blank" rel="noreferrer">Validador do ITI</a>.</p>
  </LegalPage>;
}
