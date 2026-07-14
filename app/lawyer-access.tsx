"use client";

import { FormEvent, useState } from "react";
import {
  BadgeCheck,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  LoaderCircle,
  LogIn,
  ShieldAlert,
} from "lucide-react";

type AccessState =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "otp"; message: string }
  | { kind: "error"; message: string }
  | { kind: "authenticated"; message: string };

type AccessMethod = "certificate" | "password";

const certificateRelayOrigin = "https://certificado.assinatura.maiocchi.adv.br";
const certificateRelayPath = "/certificate_auth/login/present";

async function requestCsrfToken(formSelector: string) {
  const response = await fetch("/portal-auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "text/html" },
  });
  if (!response.ok) throw new Error("O acesso seguro está temporariamente indisponível.");

  const html = await response.text();
  const document = new DOMParser().parseFromString(html, "text/html");
  const token = document.querySelector<HTMLInputElement>(`${formSelector} input[name='authenticity_token']`)?.value
    || document.querySelector<HTMLMetaElement>("meta[name='csrf-token']")?.content;
  if (!token) throw new Error("Não foi possível iniciar uma sessão protegida.");
  return token;
}

function responseMessage(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.querySelector<HTMLElement>("[role='alert'], .alert, .text-error")?.textContent?.trim()
    || "E-mail, senha ou código de verificação não conferem.";
}

export function LawyerAccess() {
  const [accessMethod, setAccessMethod] = useState<AccessMethod>("certificate");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<AccessState>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "loading", message: "Confirmando o acesso..." });

    try {
      const token = await requestCsrfToken("#new_user");
      const body = new URLSearchParams({
        authenticity_token: token,
        "user[email]": email.trim(),
        "user[password]": password,
      });
      if (otp.trim()) body.set("user[otp_attempt]", otp.trim());

      const response = await fetch("/portal-auth/session", {
        method: "POST",
        credentials: "same-origin",
        redirect: "follow",
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "x-csrf-token": token,
        },
        body: body.toString(),
      });
      const html = await response.text();
      const destination = new URL(response.url, window.location.origin).pathname;

      if (response.redirected && response.ok && (destination === "/" || destination === "/dashboard")) {
        setPassword("");
        setOtp("");
        setState({ kind: "authenticated", message: "Identidade confirmada. O ambiente de gestão está liberado." });
        return;
      }
      if (html.includes("user_otp_attempt")) {
        setState({ kind: "otp", message: "Informe o código do autenticador para concluir o acesso." });
        return;
      }
      setState({ kind: "error", message: responseMessage(html) });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "O acesso seguro está temporariamente indisponível.",
      });
    }
  }

  async function startCertificateAccess() {
    setState({ kind: "loading", message: "Preparando o certificado conectado..." });
    try {
      const token = await requestCsrfToken("form[action='/certificate_auth/login/start']");
      const response = await fetch("/portal-auth/certificate", {
        method: "POST",
        credentials: "same-origin",
        redirect: "follow",
        headers: {
          accept: "text/html",
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "x-csrf-token": token,
        },
        body: new URLSearchParams({ authenticity_token: token }).toString(),
      });
      const html = await response.text();
      if (!response.ok) throw new Error(responseMessage(html));

      const relayDocument = new DOMParser().parseFromString(html, "text/html");
      const relay = relayDocument.querySelector<HTMLFormElement>("form[action]");
      const relayAction = new URL(relay?.getAttribute("action") || "", window.location.origin);
      const relayState = relay?.querySelector<HTMLInputElement>("input[name='state']")?.value;
      if (
        !relay
        || relay.method.toLowerCase() !== "post"
        || relayAction.origin !== certificateRelayOrigin
        || relayAction.pathname !== certificateRelayPath
        || !relayState
      ) {
        throw new Error("O provedor de certificado devolveu uma transição inválida.");
      }

      const form = document.createElement("form");
      form.method = "post";
      form.action = relayAction.href;
      relay.querySelectorAll<HTMLInputElement>("input[type='hidden'][name]").forEach((source) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = source.name;
        input.value = source.value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Não foi possível iniciar o acesso com certificado.",
      });
    }
  }

  const busy = state.kind === "loading";
  const needsOtp = state.kind === "otp" || Boolean(otp);

  function selectAccessMethod(method: AccessMethod) {
    if (busy) return;
    setAccessMethod(method);
    if (state.kind !== "authenticated") setState({ kind: "idle" });
  }

  return (
    <section className="lawyer-access" aria-labelledby="lawyer-access-title">
      <div className="lawyer-access__intro">
        <p className="eyebrow"><KeyRound aria-hidden="true" size={14} /> Acesso profissional</p>
        <h2 id="lawyer-access-title">Área dos advogados, sem página intermediária.</h2>
        <p>Entre aqui para preparar, enviar e acompanhar documentos. A gestão somente é aberta depois da autenticação.</p>
        <ul>
          <li><BadgeCheck aria-hidden="true" size={17} /> Sessão protegida na mesma origem</li>
          <li><BadgeCheck aria-hidden="true" size={17} /> Certificado digital disponível</li>
          <li><BadgeCheck aria-hidden="true" size={17} /> Segundo fator quando habilitado</li>
        </ul>
      </div>

      <div className="lawyer-access__panel">
        {state.kind === "authenticated" ? (
          <div className="access-success" role="status">
            <BadgeCheck aria-hidden="true" size={28} />
            <div><strong>Acesso confirmado</strong><span>{state.message}</span></div>
            <a className="button button--yellow" href="/dashboard"><span>Abrir ambiente de gestão</span><LogIn aria-hidden="true" size={17} /></a>
          </div>
        ) : (
          <>
            <div className="access-methods" role="tablist" aria-label="Método de acesso profissional">
              <button id="certificate-access-tab" type="button" role="tab" aria-selected={accessMethod === "certificate"} aria-controls="certificate-access-panel" onClick={() => selectAccessMethod("certificate")}>
                <IdCard aria-hidden="true" size={18} /><span>Certificado</span>
              </button>
              <button id="password-access-tab" type="button" role="tab" aria-selected={accessMethod === "password"} aria-controls="password-access-panel" onClick={() => selectAccessMethod("password")}>
                <KeyRound aria-hidden="true" size={18} /><span>Senha</span>
              </button>
            </div>

            {accessMethod === "certificate" ? (
              <div className="access-method-panel" id="certificate-access-panel" role="tabpanel" aria-labelledby="certificate-access-tab">
                <button className="certificate-access" type="button" onClick={startCertificateAccess} disabled={busy}>
                  <IdCard aria-hidden="true" size={22} />
                  <span><strong>Entrar com certificado digital</strong><small>Use o A1, A3 ou certificado em nuvem já vinculado ao seu perfil.</small></span>
                </button>
                <p className="certificate-enrollment">Primeiro acesso neste certificado? <button type="button" onClick={() => selectAccessMethod("password")}>Entre com senha para vinculá-lo</button>.</p>
              </div>
            ) : (
              <div className="access-method-panel" id="password-access-panel" role="tabpanel" aria-labelledby="password-access-tab">
                <form className="credentials-form" onSubmit={submit} noValidate>
                  <div className="access-field">
                    <label htmlFor="lawyer-email">E-mail</label>
                    <input
                      id="lawyer-email"
                      type="email"
                      name="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      inputMode="email"
                      required
                    />
                  </div>
                  <div className="access-field">
                    <label htmlFor="lawyer-password">Senha</label>
                    <div className="password-field">
                      <input
                        id="lawyer-password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <button className="password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} title={showPassword ? "Ocultar senha" : "Exibir senha"} aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}>
                        {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                      </button>
                    </div>
                  </div>
                  {needsOtp && (
                    <div className="access-field access-field--wide">
                      <label htmlFor="lawyer-otp">Código do autenticador</label>
                      <input
                        id="lawyer-otp"
                        name="otp"
                        value={otp}
                        onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        required
                      />
                    </div>
                  )}
                  <button className="button button--yellow credentials-submit" type="submit" disabled={busy || !email || !password}>
                    {busy ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : <LogIn aria-hidden="true" size={18} />}
                    <span>{busy ? "Confirmando..." : needsOtp ? "Confirmar código" : "Entrar"}</span>
                  </button>
                </form>
                <a className="access-help" href="/ajuda/">Recuperar ou solicitar acesso</a>
              </div>
            )}
          </>
        )}

        {(state.kind === "error" || state.kind === "otp" || state.kind === "loading") && (
          <p className={`access-feedback${state.kind === "error" ? " access-feedback--error" : ""}`} aria-live="polite" role={state.kind === "error" ? "alert" : "status"}>
            {state.kind === "error" ? <ShieldAlert aria-hidden="true" size={18} /> : state.kind === "loading" ? <LoaderCircle className="spin" aria-hidden="true" size={18} /> : <KeyRound aria-hidden="true" size={18} />}
            <span>{state.message}</span>
          </p>
        )}
      </div>
    </section>
  );
}
