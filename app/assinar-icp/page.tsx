import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { PrivatePadesPanel } from "./private-pades-panel";

export const metadata: Metadata = { title: "Assinar com ICP-Brasil" };

export default function PrivatePadesSigningPage() {
  return (
    <LegalPage
      title="Assinar com ICP-Brasil"
      lead="Confira o documento e escolha a assinatura ICP-Brasil em nuvem ou, como alternativa, o token conectado ao seu computador."
      currentPath="/assinar-icp/"
    >
      <PrivatePadesPanel />
    </LegalPage>
  );
}
