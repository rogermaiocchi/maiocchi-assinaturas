(() => {
  'use strict';
  const portal = __PORTAL_ORIGIN__;
  const acceptedOrigins = new Set(__ACCEPTED_TOKEN_ORIGINS__);
  const acceptedTrustClassification = __ACCEPTED_TRUST_CLASSIFICATION__;
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
      acceptedOrigins.has(certificate.keyOrigin) &&
      certificate.trustClassification === acceptedTrustClassification &&
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
    if (!['pending', 'prepared'].includes(ticket.status)) throw new Error('O ticket não está disponível para uma nova assinatura.');
    if (!certificates.length) throw new Error('Nenhum certificado RSA com chave externa aprovada foi encontrado.');
    certificateNode.disabled = false;
    signNode.disabled = false;
    status(ticket.status === 'prepared'
      ? 'Assinatura preparada e vinculada ao documento; confirme novamente no token.'
      : 'Documento e credencial externa prontos; a cadeia será validada pelo servidor.');
  }

  async function sign() {
    signNode.disabled = true;
    certificateNode.disabled = true;
    try {
      const chosen = certificates.find((item) => item.fingerprintSha256 === certificateNode.value);
      if (!chosen || chosen.tokenBacked !== true || !acceptedOrigins.has(chosen.keyOrigin) ||
          chosen.trustClassification !== acceptedTrustClassification) {
        throw new Error('Selecione um certificado válido do token externo.');
      }
      status('Preparando o PAdES no serviço privado...');
      const metadata = await clientMetadata();
      const prepared = await readJson(await fetch(`${portal}/api/pades/prepare`, {
        method: 'POST',
        headers: { ...authorization(), 'content-type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ certificateBase64: chosen.certificateBase64, chainBase64: chosen.chainBase64, clientMetadata: metadata }),
      }));
      if (prepared.sourceDocumentSha256 !== ticket.documentSha256 ||
          prepared.documentSha256 !== prepared.presentationSha256 ||
          prepared.certificateFingerprintSha256 !== chosen.fingerprintSha256) {
        throw new Error('A tarefa criptográfica não corresponde ao documento ou certificado selecionado.');
      }
      hashNode.textContent = prepared.documentSha256;
      status('Conformidade ICP-Brasil confirmada. Aguardando autorização local do token...');
      const signature = await readJson(await fetch('/v1/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(prepared),
      }));
      status('Concluindo e validando o PDF assinado...');
      await readJson(await fetch(`${portal}/api/pades/complete`, {
        method: 'POST',
        headers: { ...authorization(), 'content-type': 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(signature),
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
