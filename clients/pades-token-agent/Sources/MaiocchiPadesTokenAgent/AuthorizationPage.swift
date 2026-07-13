import Foundation

enum AuthorizationPage {
    static let html = #"""
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Autorizar assinatura | Maiocchi</title>
      <style>
        :root{color-scheme:light;--ink:#171918;--muted:#626865;--line:#d9ddda;--paper:#f6f7f5;--yellow:#f3ca45;--green:#176b4d;--red:#a12b2b}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(720px,calc(100% - 32px));margin:7vh auto}.brand{font-weight:800;font-size:18px;margin-bottom:40px}.brand span{color:#a77d00}.eyebrow{font-size:12px;font-weight:800;text-transform:uppercase}.panel{background:#fff;border:1px solid var(--line);border-radius:8px;padding:clamp(24px,5vw,44px);box-shadow:0 18px 45px rgba(20,25,22,.07)}h1{font-size:clamp(28px,5vw,42px);line-height:1.12;margin:8px 0 14px;letter-spacing:0}p{color:var(--muted)}dl{display:grid;grid-template-columns:110px 1fr;gap:8px 18px;margin:28px 0;padding:20px 0;border-block:1px solid var(--line)}dt{font-size:12px;font-weight:800}dd{margin:0;overflow-wrap:anywhere}.hash{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}label{display:block;font-weight:700;margin:20px 0 8px}select,button{width:100%;min-height:48px;border-radius:6px;font:inherit}select{border:1px solid #aeb5b1;background:#fff;padding:0 12px}button{border:0;background:var(--yellow);font-weight:800;cursor:pointer;margin-top:18px}button:disabled{cursor:not-allowed;opacity:.55}.status{min-height:24px;margin-top:18px;color:var(--green);font-weight:700}.error{color:var(--red)}.security{font-size:13px;margin-top:26px}.dot{display:inline-block;width:8px;height:8px;background:var(--green);border-radius:50%;margin-right:7px}@media(max-width:520px){main{margin:20px auto}.brand{margin-bottom:20px}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:8px}}
      </style>
      <script src="/v1/authorize.js" defer></script>
    </head>
    <body><main><div class="brand"><span>m.</span> MAIOCCHI ASSINATURAS</div><section class="panel"><div class="eyebrow"><span class="dot"></span>Agente local protegido</div><h1>Autorizar com ICP-Brasil</h1><p>Confira o documento e selecione a identidade do dispositivo criptográfico. A conformidade ICP-Brasil será confirmada pelo servidor antes de a assinatura ser liberada; a chave privada permanece no dispositivo.</p><dl><dt>Documento</dt><dd id="document">Verificando...</dd><dt>SHA-256 recebido</dt><dd class="hash" id="hash">-</dd></dl><label for="certificate">Credencial externa</label><select id="certificate" disabled><option>Consultando dispositivo...</option></select><button id="sign" disabled>Autorizar assinatura no token</button><div id="status" class="status" role="status" aria-live="polite"></div><p class="security">O portal prepara o PAdES; este agente assina somente os bytes vinculados ao hash exibido e devolve a assinatura ao serviço privado. Se a localização for autorizada, ela será incorporada à página final e ficará visível a quem receber o documento ou seu código.</p></section></main></body>
    </html>
    """#

    static let javascript = #"""
    (() => {
      'use strict';
      const portal = 'https://assinatura.maiocchi.adv.br';
      const token = new URLSearchParams(location.hash.slice(1)).get('ticket') || '';
      const documentNode = document.querySelector('#document');
      const hashNode = document.querySelector('#hash');
      const certificateNode = document.querySelector('#certificate');
      const signNode = document.querySelector('#sign');
      const statusNode = document.querySelector('#status');
      let ticket = null;
      let certificates = [];

      const authorization = () => ({ authorization: `Bearer ${token}` });
      const readJson = async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error?.message || 'A operação não pôde ser concluída.');
        return data;
      };
      const status = (message, error = false) => {
        statusNode.textContent = message;
        statusNode.classList.toggle('error', error);
      };

      const optionalGeolocation = () => new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(undefined);
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        };
        const timer = setTimeout(() => finish(undefined), 3000);
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => finish({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
          () => finish(undefined),
          { enableHighAccuracy: false, maximumAge: 0, timeout: 3000 },
        );
      });

      async function clientMetadata() {
        const metadata = {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language,
          screen: { width: screen.width, height: screen.height },
        };
        const geolocation = await optionalGeolocation();
        return geolocation ? { ...metadata, geolocation } : metadata;
      }

      async function initialize() {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Ticket de autorização inválido.');
        history.replaceState(null, '', location.pathname);
        const initialized = await Promise.all([
          readJson(await fetch(`${portal}/api/pades/ticket`, { headers: authorization(), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })),
          readJson(await fetch('/v1/certificates', { cache: 'no-store', credentials: 'omit' })),
        ]);
        ticket = initialized[0];
        certificates = (initialized[1].certificates || []).filter((certificate) =>
          certificate.tokenBacked === true &&
          certificate.keyOrigin === 'CryptoTokenKit' &&
          certificate.trustClassification === 'external-token-unverified' &&
          certificate.keyAlgorithm === 'RSA' &&
          certificate.keySizeInBits >= 2048
        );
        documentNode.textContent = ticket.documentName;
        hashNode.textContent = ticket.documentSha256;
        certificateNode.replaceChildren();
        for (const certificate of certificates) {
          const option = document.createElement('option');
          option.value = certificate.fingerprintSha256;
          option.textContent = `${certificate.subject} · credencial externa · ${certificate.fingerprintSha256.slice(0, 16)}...`;
          certificateNode.append(option);
        }
        if (ticket.status === 'completed') {
          status('Documento já assinado e validado. Retornando ao portal.');
          return setTimeout(() => location.replace(`${portal}/assinar-icp#ticket=${token}`), 700);
        }
        if (ticket.status !== 'pending') throw new Error('O ticket não está disponível para uma nova assinatura.');
        if (!certificates.length) throw new Error('Nenhum certificado RSA com chave externa aprovada foi encontrado no token.');
        certificateNode.disabled = false;
        signNode.disabled = false;
        status('Documento e credencial externa prontos; a cadeia será validada pelo servidor.');
      }

      async function sign() {
        signNode.disabled = true;
        certificateNode.disabled = true;
        try {
          const chosen = certificates.find((item) => item.fingerprintSha256 === certificateNode.value);
          if (!chosen || chosen.tokenBacked !== true || chosen.keyOrigin !== 'CryptoTokenKit' ||
              chosen.trustClassification !== 'external-token-unverified') {
            throw new Error('Selecione um certificado válido do token externo.');
          }
          status('Preparando o PAdES no serviço privado...');
          const metadata = await clientMetadata();
          const prepared = await readJson(await fetch(`${portal}/api/pades/prepare`, {
            method: 'POST', headers: { ...authorization(), 'content-type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer',
            body: JSON.stringify({ certificateBase64: chosen.certificateBase64, chainBase64: chosen.chainBase64, clientMetadata: metadata }),
          }));
          if (prepared.sourceDocumentSha256 !== ticket.documentSha256 ||
              prepared.documentSha256 !== prepared.presentationSha256 ||
              prepared.certificateFingerprintSha256 !== chosen.fingerprintSha256) {
            throw new Error('A tarefa criptográfica não corresponde ao documento ou certificado selecionado.');
          }
          hashNode.textContent = prepared.documentSha256;
          status('Conformidade ICP-Brasil confirmada pelo servidor. Aguardando autorização do token...');
          const signature = await readJson(await fetch('/v1/sign', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', body: JSON.stringify(prepared),
          }));
          status('Concluindo e validando o PDF assinado...');
          await readJson(await fetch(`${portal}/api/pades/complete`, {
            method: 'POST', headers: { ...authorization(), 'content-type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify(signature),
          }));
          status('PAdES concluído e validado. Retornando ao portal...');
          setTimeout(() => location.replace(`${portal}/assinar-icp#ticket=${token}`), 700);
        } catch (error) {
          status(error instanceof Error ? error.message : 'A assinatura falhou.', true);
          signNode.disabled = false;
          certificateNode.disabled = false;
        }
      }

      signNode.addEventListener('click', sign);
      initialize().catch((error) => status(error instanceof Error ? error.message : 'Falha ao iniciar o agente.', true));
    })();
    """#
}
