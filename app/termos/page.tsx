import type { Metadata } from "next";
import { BadgeCheck, Eye, FileSignature, UserCheck } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return <LegalPage title="Termos de uso" lead="Condições para acessar, conferir e assinar documentos no portal do Maiocchi Advogado." currentPath="/termos/">
    <p className="legal-meta">Versão de 12 de julho de 2026.</p>
    <FlowMap eyebrow="Uso responsável" title="Acesso pessoal. Decisão consciente. Evidência preservada." description="O uso do portal pressupõe conferência do conteúdo e interrupção imediata diante de dúvida, erro ou acesso indevido." ariaLabel="Fluxo de responsabilidades para uso do portal" steps={[
      { title: "Acessar pessoalmente", description: "Use apenas o link individual destinado a você.", icon: UserCheck },
      { title: "Conferir por inteiro", description: "Revise texto, dados, anexos e modalidade antes de agir.", icon: Eye },
      { title: "Manifestar vontade", description: "Assine somente se o conteúdo estiver correto e compreendido.", icon: FileSignature, tone: "yellow" },
      { title: "Preservar a cópia", description: "Guarde o arquivo eletrônico final e suas evidências.", icon: BadgeCheck },
    ]} />
    <h2>1. Responsável pelo portal</h2><p>O portal é mantido pelo Maiocchi Advogado, sob responsabilidade de Roger Maiocchi, advogado inscrito na OAB/DF sob o nº 31.249. O canal de atendimento é <a href="mailto:roger@maiocchi.adv.br">roger@maiocchi.adv.br</a>.</p>
    <h2>2. Finalidade</h2><p>O serviço permite preparar, disponibilizar, preencher, acompanhar e assinar documentos relacionados à atividade profissional do escritório. O portal não é um serviço público nem representa o GOV.BR, o ITI, a ICP-Brasil, a Lacuna Software ou o DocuSeal.</p>
    <h2>3. Uso do acesso</h2><p>Links e códigos são pessoais. O usuário deve impedir o acesso por terceiros, não reutilizar credenciais de outra pessoa e comunicar imediatamente qualquer suspeita de uso indevido.</p>
    <h2>4. Conferência e manifestação de vontade</h2><p>Antes de concluir, o usuário deve ler integralmente o documento e conferir dados, anexos e declarações. Informação incorreta, dúvida ou ausência de vontade exige a interrupção do fluxo e contato com o advogado responsável.</p>
    <h2>5. Modalidades de assinatura</h2><p>O fluxo identifica a modalidade empregada. Assinatura simples, assinatura avançada GOV.BR e assinatura qualificada ICP-Brasil têm requisitos e evidências diferentes. A modalidade não deve ser inferida apenas pela aparência da marca no PDF. Consulte a página <a href="/assinaturas-eletronicas/">Assinaturas eletrônicas</a>.</p>
    <h2>6. Certificados e credenciais</h2><p>A chave privada, o PIN e a senha do certificado pertencem ao titular. Eles não devem ser enviados ao escritório. O usuário responde pela guarda de seu dispositivo e deve solicitar revogação à autoridade competente se houver comprometimento.</p>
    <h2>7. Revisões e cancelamento</h2><p>Alteração de conteúdo depois do início de uma assinatura digital exige nova revisão e nova coleta de assinaturas. O escritório pode cancelar links expirados, duplicados, comprometidos ou relacionados a documento substituído.</p>
    <h2>8. Evidências e cópia final</h2><p>O sistema pode registrar datas, horários, eventos técnicos, hashes, confirmações e relatórios de validação. A cópia final disponibilizada deve ser preservada em formato eletrônico; imprimir para PDF pode remover ou invalidar assinaturas digitais.</p>
    <h2>9. Chave e via impressa</h2><p>O ID, o hash e o QR Code permitem localizar e comparar o registro eletrônico. A folha impressa é mera representação e não substitui o PDF PAdES original. O resultado do portal comprova a integridade do registro do escritório; a assinatura ICP-Brasil deve ser conferida no próprio PDF e, quando necessário, no VALIDAR ITI.</p>
    <h2>10. Uso proibido</h2><p>É proibido acessar documento alheio, contornar controles, testar credenciais, inserir arquivo malicioso, adulterar evidência, automatizar abuso ou usar o portal em violação à lei e aos direitos de terceiros.</p>
    <h2>11. Disponibilidade</h2><p>Manutenção, atualização, indisponibilidade de terceiros e eventos fora do controle razoável podem interromper o serviço. O escritório adotará medidas proporcionais para restabelecer o acesso, sem prometer funcionamento ininterrupto.</p>
    <h2>12. Validade no caso concreto</h2><p>A tecnologia preserva evidências, mas não torna automaticamente qualquer documento adequado a qualquer finalidade. Lei aplicável, forma exigida, poderes do signatário, conteúdo e aceitação das partes devem ser considerados no caso concreto.</p>
    <h2>13. Software e terceiros</h2><p>O motor documental utiliza DocuSeal sob AGPLv3. Componentes PKI somente serão apresentados como ativos quando licenciados e habilitados. Serviços GOV.BR e validadores externos têm termos próprios.</p>
    <h2>14. Privacidade</h2><p>O tratamento de dados é descrito na <a href="/privacidade/">Política de privacidade</a>, que integra estes termos.</p>
    <h2>15. Atualizações e contato</h2><p>Alterações relevantes serão publicadas com nova data de versão. Dúvidas ou incidentes podem ser comunicados a <a href="mailto:roger@maiocchi.adv.br">roger@maiocchi.adv.br</a>.</p>
  </LegalPage>;
}
