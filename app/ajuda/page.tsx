import type { Metadata } from "next";
import { BadgeHelp, CircleStop, FileSearch, Mail } from "lucide-react";
import { FlowMap } from "../flow-map";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Ajuda" };

export default function HelpPage() {
  return <LegalPage title="Central de ajuda" lead="Respostas rápidas para concluir sua assinatura com segurança." currentPath="/ajuda/">
    <FlowMap eyebrow="Diagnóstico rápido" title="Dificuldade não se resolve assinando às cegas." description="Identifique o problema, preserve o documento e só prossiga quando conteúdo, acesso e modalidade estiverem claros." ariaLabel="Fluxo de ajuda para problemas durante a assinatura" steps={[
      { title: "Identificar", description: "Localize o link, a etapa e a mensagem exibida.", icon: FileSearch },
      { title: "Conferir", description: "Revise documento, dados e modalidade indicada.", icon: BadgeHelp },
      { title: "Interromper se houver erro", description: "Não assine conteúdo incorreto ou inesperado.", icon: CircleStop, tone: "yellow" },
      { title: "Pedir orientação", description: "Informe somente o documento e a dificuldade encontrada.", icon: Mail, href: "mailto:roger@maiocchi.adv.br?subject=Ajuda%20com%20assinatura", linkLabel: "Enviar mensagem" },
    ]} />
    <h2>Não encontro meu link</h2><p>Consulte a mensagem enviada pelo escritório e verifique também a caixa de spam. Se recebeu um código, informe-o na página inicial do portal.</p>
    <h2>O documento não abre</h2><p>Atualize a página, teste uma conexão estável e use uma versão recente do navegador. Evite abrir o mesmo link simultaneamente em vários dispositivos.</p>
    <h2>Há uma informação incorreta</h2><p>Não assine. Feche a página e solicite ao advogado responsável o envio de uma versão corrigida.</p>
    <h2>Qual modalidade estou usando?</h2><p>O próprio fluxo deve identificar a modalidade. O acesso por link e a assinatura desenhada são tratados como assinatura eletrônica simples por padrão. Consulte a <a href="/assinaturas-eletronicas/">comparação das modalidades</a>.</p>
    <h2>Assinatura com certificado ICP-Brasil</h2><p>Quando essa opção estiver indicada no documento, selecione seu certificado no componente seguro. A chave privada e o PIN permanecem sob seu controle. O Maiocchi Advogado nunca solicita PIN, arquivo A1 ou senha por mensagem, e-mail ou telefone.</p>
    <h2>Assinatura pelo GOV.BR</h2><p>O GOV.BR é um serviço externo. Siga o <a href="/assinatura-gov-br/">percurso oficial</a>, baixe o arquivo assinado sem usar a função de impressão e confira a assinatura no Validador do ITI.</p>
    <h2>Conferir um documento assinado</h2><p>Acesse a página <a href="/validar/">Validar assinatura</a> para encontrar os validadores oficiais e as orientações de conferência.</p>
    <h2>Atendimento</h2><p>Envie uma mensagem para <a href="mailto:roger@maiocchi.adv.br?subject=Ajuda%20com%20assinatura">roger@maiocchi.adv.br</a>, informando apenas o nome do documento e a dificuldade encontrada. Não envie senha, PIN, chave privada ou código de acesso.</p>
  </LegalPage>;
}
