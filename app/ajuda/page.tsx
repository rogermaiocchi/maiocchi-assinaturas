import type { Metadata } from "next";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Ajuda" };

export default function HelpPage() {
  return <LegalPage title="Central de ajuda" lead="Respostas rápidas para concluir sua assinatura com segurança.">
    <h2>Não encontro meu link</h2><p>Consulte a mensagem enviada pelo escritório e verifique também a caixa de spam. Se recebeu um código, informe-o na página inicial do portal.</p>
    <h2>O documento não abre</h2><p>Atualize a página, teste uma conexão estável e use uma versão recente do navegador. Evite abrir o mesmo link simultaneamente em vários dispositivos.</p>
    <h2>Há uma informação incorreta</h2><p>Não assine. Feche a página e solicite ao advogado responsável o envio de uma versão corrigida.</p>
    <h2>O token ICP-Brasil pede PIN</h2><p>Digite o PIN somente na janela segura do componente do certificado. O escritório e o portal nunca solicitam que o PIN seja enviado por mensagem, e-mail ou telefone.</p>
    <h2>Atendimento</h2><p>Envie uma mensagem para <a href="mailto:admin@maiocchi.adv.br?subject=Ajuda%20com%20assinatura">admin@maiocchi.adv.br</a>, informando apenas o nome do documento e a dificuldade encontrada. Não envie senhas nem PINs.</p>
  </LegalPage>;
}
