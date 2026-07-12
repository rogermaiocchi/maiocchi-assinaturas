package br.adv.maiocchi.pades;

import eu.europa.esig.dss.enumerations.DigestAlgorithm;
import eu.europa.esig.dss.enumerations.Indication;
import eu.europa.esig.dss.enumerations.SignatureAlgorithm;
import eu.europa.esig.dss.enumerations.SignatureLevel;
import eu.europa.esig.dss.model.DSSDocument;
import eu.europa.esig.dss.model.InMemoryDocument;
import eu.europa.esig.dss.model.Policy;
import eu.europa.esig.dss.model.SignatureValue;
import eu.europa.esig.dss.model.ToBeSigned;
import eu.europa.esig.dss.model.x509.CertificateToken;
import eu.europa.esig.dss.pades.PAdESSignatureParameters;
import eu.europa.esig.dss.pades.signature.PAdESService;
import eu.europa.esig.dss.service.crl.OnlineCRLSource;
import eu.europa.esig.dss.service.http.commons.CommonsDataLoader;
import eu.europa.esig.dss.service.ocsp.OnlineOCSPSource;
import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.validation.CommonCertificateVerifier;
import eu.europa.esig.dss.spi.x509.CommonTrustedCertificateSource;
import eu.europa.esig.dss.validation.SignedDocumentValidator;
import eu.europa.esig.dss.validation.reports.Reports;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

final class PadesEngine {
    static final int MAX_PDF_BYTES = 40 * 1024 * 1024;
    static final Duration SESSION_TTL = Duration.ofMinutes(3);
    static final int MAX_ACTIVE_SESSIONS = 100;

    record PrepareRequest(String pdfBase64, String name, String certificateBase64, List<String> chainBase64) {}
    record PrepareResult(String sessionId, String toBeSignedBase64, String digestAlgorithm,
                         String signatureAlgorithm, String documentSha256, String certificateFingerprintSha256,
                         String expiresAt) {}
    record CompleteRequest(String signatureBase64) {}
    record ValidationResult(boolean cryptographicIntegrity, boolean trusted, String indication,
                            String subIndication, String format, String policyOid, String signedBy, String reportXmlBase64) {}
    record CompleteResult(String signedPdfBase64, String signedPdfSha256, ValidationResult validation) {}
    record SignaturePolicy(String oid, byte[] digest, String uri) {}

    private record Session(byte[] pdf, String name, CertificateToken certificate, List<CertificateToken> chain,
                           PAdESSignatureParameters parameters, byte[] toBeSigned, String documentSha256,
                           String certificateFingerprint, Instant expiresAt) {}

    private final CommonCertificateVerifier verifier;
    private final PAdESService service;
    private final Clock clock;
    private final SignaturePolicy signaturePolicy;
    private final boolean requireTrustedValidation;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    PadesEngine(CommonTrustedCertificateSource trustSource, Clock clock, SignaturePolicy signaturePolicy) {
        this(trustSource, clock, signaturePolicy, true);
    }

    PadesEngine(CommonTrustedCertificateSource trustSource, Clock clock, SignaturePolicy signaturePolicy,
                boolean requireTrustedValidation) {
        if (trustSource == null || trustSource.getCertificates().isEmpty()) {
            throw new IllegalArgumentException("ICP-Brasil trust store is empty");
        }
        this.clock = clock;
        if (signaturePolicy == null || signaturePolicy.oid() == null || !signaturePolicy.oid().matches("[0-9]+(\\.[0-9]+)+") ||
                signaturePolicy.digest() == null || signaturePolicy.digest().length != 32 || signaturePolicy.uri() == null) {
            throw new IllegalArgumentException("PAdES signature policy is invalid");
        }
        this.signaturePolicy = signaturePolicy;
        this.requireTrustedValidation = requireTrustedValidation;
        this.verifier = new CommonCertificateVerifier();
        this.verifier.setTrustedCertSources(trustSource);
        CommonsDataLoader dataLoader = new CommonsDataLoader();
        dataLoader.setRedirectsEnabled(false);
        dataLoader.setTimeoutConnection(10_000);
        dataLoader.setTimeoutConnectionRequest(10_000);
        dataLoader.setTimeoutResponse(10_000);
        dataLoader.setTimeoutSocket(10_000);
        RestrictedDataLoader restrictedDataLoader = new RestrictedDataLoader(dataLoader);
        this.verifier.setCrlSource(new OnlineCRLSource(restrictedDataLoader));
        this.verifier.setOcspSource(new OnlineOCSPSource(restrictedDataLoader));
        this.service = new PAdESService(verifier);
    }

    PrepareResult prepare(PrepareRequest request) {
        cleanup();
        if (sessions.size() >= MAX_ACTIVE_SESSIONS) {
            throw new ProviderException(503, "capacity_exceeded", "Limite de sessões de assinatura atingido.");
        }
        byte[] pdf = decode(request.pdfBase64(), "pdfBase64", MAX_PDF_BYTES);
        if (pdf.length < 5 || pdf[0] != '%' || pdf[1] != 'P' || pdf[2] != 'D' || pdf[3] != 'F' || pdf[4] != '-') {
            throw new ProviderException(400, "invalid_pdf", "O arquivo não é um PDF válido.");
        }
        CertificateToken certificate = loadCertificate(request.certificateBase64(), "certificateBase64");
        if (!"RSA".equalsIgnoreCase(certificate.getCertificate().getPublicKey().getAlgorithm())) {
            throw new ProviderException(400, "unsupported_key", "Somente certificados RSA são aceitos nesta versão.");
        }
        List<CertificateToken> chain = new ArrayList<>();
        chain.add(certificate);
        if (request.chainBase64() != null) {
            for (String encoded : request.chainBase64()) {
                CertificateToken candidate = loadCertificate(encoded, "chainBase64");
                if (!candidate.equals(certificate)) chain.add(candidate);
            }
        }

        Instant now = clock.instant();
        PAdESSignatureParameters parameters = new PAdESSignatureParameters();
        parameters.setSignatureLevel(SignatureLevel.PAdES_BASELINE_B);
        parameters.setDigestAlgorithm(DigestAlgorithm.SHA256);
        parameters.setSigningCertificate(certificate);
        parameters.setCertificateChain(chain);
        parameters.bLevel().setSigningDate(Date.from(now));
        Policy policy = new Policy();
        policy.setId(signaturePolicy.oid());
        policy.setDigestAlgorithm(DigestAlgorithm.SHA256);
        policy.setDigestValue(signaturePolicy.digest());
        policy.setSpuri(signaturePolicy.uri());
        parameters.bLevel().setSignaturePolicy(policy);
        parameters.setLocation("Brasil");
        parameters.setContactInfo("roger@maiocchi.adv.br");

        DSSDocument document = new InMemoryDocument(pdf, safeName(request.name()));
        ToBeSigned toBeSigned = service.getDataToSign(document, parameters);
        byte[] tbs = toBeSigned.getBytes();
        String id = UUID.randomUUID().toString();
        Instant expiresAt = now.plus(SESSION_TTL);
        String documentSha256 = sha256(pdf);
        String certificateFingerprint = sha256(certificate.getEncoded());
        sessions.put(id, new Session(pdf, safeName(request.name()), certificate, List.copyOf(chain), parameters,
                tbs, documentSha256, certificateFingerprint, expiresAt));
        return new PrepareResult(id, Base64.getEncoder().encodeToString(tbs), "SHA-256", "RSA-SHA256",
                documentSha256, certificateFingerprint, expiresAt.toString());
    }

    CompleteResult complete(String sessionId, CompleteRequest request) {
        cleanup();
        Session session = sessions.remove(sessionId);
        if (session == null) {
            throw new ProviderException(404, "session_not_found", "Sessão inexistente, expirada ou já utilizada.");
        }
        if (!clock.instant().isBefore(session.expiresAt())) {
            throw new ProviderException(410, "session_expired", "A sessão de assinatura expirou.");
        }
        byte[] signature = decode(request.signatureBase64(), "signatureBase64", 16 * 1024);
        verifyExternalSignature(session, signature);

        DSSDocument original = new InMemoryDocument(session.pdf(), session.name());
        SignatureValue value = new SignatureValue(SignatureAlgorithm.RSA_SHA256, signature);
        DSSDocument signed = service.signDocument(original, session.parameters(), value);
        byte[] signedPdf = bytes(signed);
        ValidationResult validation = validate(signedPdf);
        if (!validation.cryptographicIntegrity() || (requireTrustedValidation && !validation.trusted())) {
            throw new ProviderException(422, "pades_validation_failed", "O PAdES gerado não passou na validação completa.");
        }
        return new CompleteResult(Base64.getEncoder().encodeToString(signedPdf), sha256(signedPdf), validation);
    }

    int activeSessions() {
        cleanup();
        return sessions.size();
    }

    private ValidationResult validate(byte[] signedPdf) {
        DSSDocument document = new InMemoryDocument(signedPdf, "documento-assinado.pdf");
        SignedDocumentValidator validator = SignedDocumentValidator.fromDocument(document);
        validator.setCertificateVerifier(verifier);
        Reports reports = validator.validateDocument();
        var simple = reports.getSimpleReport();
        String signatureId = simple.getFirstSignatureId();
        if (signatureId == null) {
            throw new ProviderException(422, "signature_missing", "O PDF não contém assinatura reconhecida.");
        }
        Indication indication = simple.getIndication(signatureId);
        boolean trusted = Indication.TOTAL_PASSED.equals(indication) || Indication.PASSED.equals(indication);
        var diagnosticSignature = reports.getDiagnosticData().getSignatureById(signatureId);
        boolean cryptographicIntegrity = diagnosticSignature != null &&
                diagnosticSignature.isSignatureIntact() && diagnosticSignature.isSignatureValid();
        String report = reports.getXmlDiagnosticData();
        if (!report.contains(signaturePolicy.oid())) {
            throw new ProviderException(422, "policy_missing", "A política PAdES ICP-Brasil não consta no relatório final.");
        }
        return new ValidationResult(
                cryptographicIntegrity, trusted,
                indication == null ? "UNKNOWN" : indication.name(),
                simple.getSubIndication(signatureId) == null ? null : simple.getSubIndication(signatureId).name(),
                simple.getSignatureFormat(signatureId) == null ? null : simple.getSignatureFormat(signatureId).name(), signaturePolicy.oid(),
                simple.getSignedBy(signatureId), Base64.getEncoder().encodeToString(report.getBytes(java.nio.charset.StandardCharsets.UTF_8))
        );
    }

    private static void verifyExternalSignature(Session session, byte[] signatureBytes) {
        try {
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(session.certificate().getCertificate().getPublicKey());
            verifier.update(session.toBeSigned());
            if (!verifier.verify(signatureBytes)) {
                throw new ProviderException(422, "signature_invalid", "A assinatura retornada pelo token é inválida.");
            }
        } catch (ProviderException error) {
            throw error;
        } catch (Exception error) {
            throw new ProviderException(422, "signature_verification_failed", "Não foi possível verificar a assinatura do token.");
        }
    }

    private void cleanup() {
        Instant now = clock.instant();
        sessions.entrySet().removeIf(entry -> !now.isBefore(entry.getValue().expiresAt()));
    }

    private static CertificateToken loadCertificate(String value, String field) {
        try {
            return DSSUtils.loadCertificate(decode(value, field, 1024 * 1024));
        } catch (ProviderException error) {
            throw error;
        } catch (Exception error) {
            throw new ProviderException(400, "invalid_certificate", "Certificado X.509 inválido.");
        }
    }

    private static byte[] decode(String value, String field, int maxBytes) {
        if (value == null || value.isBlank()) {
            throw new ProviderException(400, "missing_field", field + " é obrigatório.");
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(value);
            if (decoded.length == 0 || decoded.length > maxBytes) {
                throw new ProviderException(413, "payload_too_large", field + " excede o limite permitido.");
            }
            return decoded;
        } catch (IllegalArgumentException error) {
            throw new ProviderException(400, "invalid_base64", field + " não contém Base64 válido.");
        }
    }

    private static byte[] bytes(DSSDocument document) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.writeTo(output);
            return output.toByteArray();
        } catch (IOException error) {
            throw new ProviderException(500, "document_write_failed", "Falha ao materializar o PDF assinado.");
        }
    }

    private static String safeName(String value) {
        String name = value == null || value.isBlank() ? "documento.pdf" : value.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "-");
        if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
        return name.substring(0, Math.min(name.length(), 120));
    }

    static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }
}
