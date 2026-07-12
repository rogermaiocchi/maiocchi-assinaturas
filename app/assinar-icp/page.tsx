import type { Metadata } from "next";
import { LegalPage } from "../legal-page";
import { PrivatePadesPanel } from "./private-pades-panel";

export const metadata: Metadata = { title: "Assinar com ICP-Brasil" };

export default function PrivatePadesSigningPage() {
  return (
    <LegalPage
      title="Assinar com ICP-Brasil"
      lead="Revise a identidade selecionada e autorize o token somente quando o hash exibido corresponder ao documento recebido."
      currentPath="/assinar-icp/"
    >
      <PrivatePadesPanel />
    </LegalPage>
  );
}
