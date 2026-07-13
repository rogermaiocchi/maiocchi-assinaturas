package br.adv.maiocchi.pades;

import eu.europa.esig.dss.enumerations.DigestAlgorithm;
import eu.europa.esig.dss.enumerations.ImageScaling;
import eu.europa.esig.dss.enumerations.Indication;
import eu.europa.esig.dss.enumerations.SignerTextPosition;
import eu.europa.esig.dss.enumerations.SignatureAlgorithm;
import eu.europa.esig.dss.enumerations.SignatureLevel;
import eu.europa.esig.dss.model.DSSDocument;
import eu.europa.esig.dss.model.InMemoryDocument;
import eu.europa.esig.dss.model.Policy;
import eu.europa.esig.dss.model.SignatureValue;
import eu.europa.esig.dss.model.ToBeSigned;
import eu.europa.esig.dss.model.x509.CertificateToken;
import eu.europa.esig.dss.pades.PAdESSignatureParameters;
import eu.europa.esig.dss.pades.DSSJavaFont;
import eu.europa.esig.dss.pades.SignatureFieldParameters;
import eu.europa.esig.dss.pades.SignatureImageParameters;
import eu.europa.esig.dss.pades.SignatureImageTextParameters;
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
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.asn1.ASN1IA5String;
import org.bouncycastle.asn1.ASN1Encodable;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1OctetString;
import org.bouncycastle.asn1.ASN1Primitive;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.ASN1String;
import org.bouncycastle.asn1.cms.Attribute;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.asn1.pkcs.PKCSObjectIdentifiers;
import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.GeneralNames;
import org.bouncycastle.asn1.x509.OtherName;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;

final class PadesEngine {
    static final int MAX_PDF_BYTES = 40 * 1024 * 1024;
    static final Duration SESSION_TTL = Duration.ofMinutes(3);
    static final int MAX_ACTIVE_SESSIONS = 100;
    static final String ICP_BRASIL_AD_RB_V1_3_OID = "2.16.76.1.7.1.11.1.3";
    static final String ICP_BRASIL_AD_RB_V1_3_URI =
            "http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der";
    static final String ICP_BRASIL_AD_RB_V1_3_FILE_SHA256 =
            "23da544aef71f7a75dc85fa6e17a83875741e4baef41ec178258a5c86ace54dd";
    static final String ICP_BRASIL_AD_RB_V1_3_SIGN_POLICY_HASH_SHA256 =
            "23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60";
    private static final String ICP_BRASIL_PERSON_DATA_OID = "2.16.76.1.3.1";
    private static final ASN1ObjectIdentifier ETS_URI_QUALIFIER_OID =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.5.1");
    private static final byte[] ICP_BRASIL_AD_RB_V1_3_DIGEST =
            HexFormat.of().parseHex(ICP_BRASIL_AD_RB_V1_3_SIGN_POLICY_HASH_SHA256);
    private static final String CERTIFICATE_TYPE = "A3";
    private static final float VISIBLE_SIGNATURE_X = 72f;
    private static final float VISIBLE_SIGNATURE_BOTTOM = 64f;
    private static final float VISIBLE_SIGNATURE_WIDTH = 451f;
    private static final float VISIBLE_SIGNATURE_HEIGHT = 72f;
    private static final Pattern NATIONAL_ID = Pattern.compile("(?<!\\d)(\\d{3}[.]?\\d{3}[.]?\\d{3}-?\\d{2})(?!\\d)");
    private static final DateTimeFormatter VISIBLE_SIGNING_TIME = DateTimeFormatter
            .ofPattern("dd/MM/uuuu HH:mm:ss 'UTC'").withZone(ZoneOffset.UTC);

    record PrepareRequest(String pdfBase64, String name, String certificateBase64, List<String> chainBase64) {}
    record PrepareResult(String sessionId, String toBeSignedBase64, String digestAlgorithm,
                         String signatureAlgorithm, String documentSha256, String certificateFingerprintSha256,
                         String expiresAt) {}
    record CompleteRequest(String signatureBase64) {}
    record ValidationResult(boolean cryptographicIntegrity, boolean trusted, String indication,
                            String subIndication, String format, String policyOid, String signedBy,
                            String signerNationalIdMasked, String signingTime, String certificateType,
                            String reportXmlBase64) {}
    record CompleteResult(String signedPdfBase64, String signedPdfSha256, ValidationResult validation) {}
    record SignaturePolicy(String oid, byte[] digest, String uri) {}

    private record Session(byte[] pdf, String name, CertificateToken certificate, List<CertificateToken> chain,
                           PAdESSignatureParameters parameters, byte[] toBeSigned, String documentSha256,
                           String certificateFingerprint, SignerIdentity signerIdentity, Instant signingTime,
                           Instant expiresAt) {}
    private record SignerIdentity(String signedBy, String nationalIdMasked) {}

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
        validateSignaturePolicy(signaturePolicy);
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
        SignerIdentity signerIdentity = signerIdentity(certificate);
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
        parameters.setSignerName(signerIdentity.signedBy());
        configureVisibleSignature(parameters, pdf, signerIdentity, now);

        DSSDocument document = new InMemoryDocument(pdf, safeName(request.name()));
        ToBeSigned toBeSigned = service.getDataToSign(document, parameters);
        byte[] tbs = toBeSigned.getBytes();
        String id = UUID.randomUUID().toString();
        Instant expiresAt = now.plus(SESSION_TTL);
        String documentSha256 = sha256(pdf);
        String certificateFingerprint = sha256(certificate.getEncoded());
        Session session = new Session(pdf, safeName(request.name()), certificate, List.copyOf(chain), parameters,
                tbs, documentSha256, certificateFingerprint, signerIdentity, now, expiresAt);
        sessions.put(id, session);
        return prepareResult(id, session);
    }

    PrepareResult resume(String sessionId) {
        cleanup();
        Session session = sessions.get(sessionId);
        if (session == null) {
            throw new ProviderException(404, "session_not_found", "Sessão inexistente, expirada ou já utilizada.");
        }
        return prepareResult(sessionId, session);
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
        assertCanonicalPolicyReference(signedPdf);
        ValidationResult validation = validate(signedPdf, session.signerIdentity(), session.signingTime());
        if (!validation.cryptographicIntegrity() || (requireTrustedValidation && !validation.trusted())) {
            throw new ProviderException(422, "pades_validation_failed", "O PAdES gerado não passou na validação completa.");
        }
        return new CompleteResult(Base64.getEncoder().encodeToString(signedPdf), sha256(signedPdf), validation);
    }

    int activeSessions() {
        cleanup();
        return sessions.size();
    }

    private static PrepareResult prepareResult(String sessionId, Session session) {
        return new PrepareResult(sessionId, Base64.getEncoder().encodeToString(session.toBeSigned()),
                "SHA-256", "RSA-SHA256", session.documentSha256(), session.certificateFingerprint(),
                session.expiresAt().toString());
    }

    private ValidationResult validate(byte[] signedPdf, SignerIdentity signerIdentity, Instant signingTime) {
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
                signerIdentity.signedBy(), signerIdentity.nationalIdMasked(), signingTime.toString(), CERTIFICATE_TYPE,
                Base64.getEncoder().encodeToString(report.getBytes(java.nio.charset.StandardCharsets.UTF_8))
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

    private static void validateSignaturePolicy(SignaturePolicy policy) {
        if (policy == null || policy.digest() == null ||
                !ICP_BRASIL_AD_RB_V1_3_OID.equals(policy.oid()) ||
                !ICP_BRASIL_AD_RB_V1_3_URI.equals(policy.uri()) ||
                !MessageDigest.isEqual(ICP_BRASIL_AD_RB_V1_3_DIGEST, policy.digest())) {
            throw new IllegalArgumentException("PAdES AD-RB v1.3 policy reference is not canonical");
        }
    }

    private static void assertCanonicalPolicyReference(byte[] signedPdf) {
        try (PDDocument document = Loader.loadPDF(signedPdf)) {
            List<PDSignature> signatures = document.getSignatureDictionaries();
            if (signatures.isEmpty()) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "O PDF assinado não contém dicionário de assinatura.");
            }
            PDSignature pdfSignature = signatures.get(signatures.size() - 1);
            CMSSignedData cms = new CMSSignedData(pdfSignature.getContents(signedPdf));
            var signers = cms.getSignerInfos().getSigners();
            if (signers.size() != 1) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "O CMS deve conter exatamente um assinante.");
            }
            SignerInformation signer = signers.iterator().next();
            Attribute attribute = signer.getSignedAttributes() == null ? null
                    : signer.getSignedAttributes().get(PKCSObjectIdentifiers.id_aa_ets_sigPolicyId);
            if (attribute == null || attribute.getAttrValues().size() != 1) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "A política PAdES não foi incorporada aos atributos assinados.");
            }

            ASN1Sequence policy = ASN1Sequence.getInstance(attribute.getAttrValues().getObjectAt(0));
            if (policy.size() != 3 ||
                    !ICP_BRASIL_AD_RB_V1_3_OID.equals(
                            ASN1ObjectIdentifier.getInstance(policy.getObjectAt(0)).getId())) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "O OID da política PAdES não é o canônico.");
            }

            ASN1Sequence policyHash = ASN1Sequence.getInstance(policy.getObjectAt(1));
            ASN1Sequence digestAlgorithm = ASN1Sequence.getInstance(policyHash.getObjectAt(0));
            byte[] digest = ASN1OctetString.getInstance(policyHash.getObjectAt(1)).getOctets();
            if (!NISTObjectIdentifiers.id_sha256.equals(
                    ASN1ObjectIdentifier.getInstance(digestAlgorithm.getObjectAt(0))) ||
                    !MessageDigest.isEqual(ICP_BRASIL_AD_RB_V1_3_DIGEST, digest)) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "O resumo da política PAdES não é o oficial.");
            }

            ASN1Sequence qualifiers = ASN1Sequence.getInstance(policy.getObjectAt(2));
            if (qualifiers.size() != 1) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "A política PAdES deve conter um único qualificador URI.");
            }
            ASN1Sequence qualifier = ASN1Sequence.getInstance(qualifiers.getObjectAt(0));
            if (qualifier.size() != 2 ||
                    !ETS_URI_QUALIFIER_OID.equals(ASN1ObjectIdentifier.getInstance(qualifier.getObjectAt(0))) ||
                    !ICP_BRASIL_AD_RB_V1_3_URI.equals(
                            ASN1IA5String.getInstance(qualifier.getObjectAt(1)).getString())) {
                throw new ProviderException(422, "policy_reference_invalid",
                        "A URI da política PAdES não é a referência oficial do ITI.");
            }
        } catch (ProviderException error) {
            throw error;
        } catch (Exception error) {
            throw new ProviderException(422, "policy_reference_invalid",
                    "Não foi possível confirmar a política PAdES no CMS final.");
        }
    }

    private static void configureVisibleSignature(PAdESSignatureParameters parameters, byte[] pdf,
                                                  SignerIdentity signerIdentity, Instant signingTime) {
        int page;
        float pageHeight;
        try (PDDocument document = Loader.loadPDF(pdf)) {
            page = document.getNumberOfPages();
            if (page < 1) throw new ProviderException(400, "invalid_pdf", "O PDF não possui página para assinatura visual.");
            var pageBox = document.getPage(page - 1).getCropBox();
            if (pageBox.getWidth() < VISIBLE_SIGNATURE_X + VISIBLE_SIGNATURE_WIDTH ||
                    pageBox.getHeight() < VISIBLE_SIGNATURE_BOTTOM + VISIBLE_SIGNATURE_HEIGHT) {
                throw new ProviderException(400, "invalid_pdf", "A última página não comporta a assinatura visual.");
            }
            pageHeight = pageBox.getHeight();
        } catch (IOException error) {
            throw new ProviderException(400, "invalid_pdf", "Não foi possível posicionar a assinatura visual no PDF.");
        }

        SignatureFieldParameters field = new SignatureFieldParameters();
        field.setPage(page);
        field.setOriginX(VISIBLE_SIGNATURE_X);
        field.setOriginY(pageHeight - VISIBLE_SIGNATURE_BOTTOM - VISIBLE_SIGNATURE_HEIGHT);
        field.setWidth(VISIBLE_SIGNATURE_WIDTH);
        field.setHeight(VISIBLE_SIGNATURE_HEIGHT);

        SignatureImageTextParameters text = new SignatureImageTextParameters();
        text.setSignerTextPosition(SignerTextPosition.RIGHT);
        text.setFont(new DSSJavaFont(Font.SANS_SERIF, Font.PLAIN, 6));
        text.setTextColor(new Color(17, 18, 16));
        text.setBackgroundColor(Color.WHITE);
        text.setPadding(4f);
        String nationalIdLine = signerIdentity.nationalIdMasked() == null
                ? "" : "\nCPF: " + signerIdentity.nationalIdMasked();
        text.setText("ASSINADO DIGITALMENTE\n" + signerIdentity.signedBy()
                + nationalIdLine
                + "\n" + VISIBLE_SIGNING_TIME.format(signingTime)
                + "\nICP-Brasil | A3 | PAdES AD-RB");

        SignatureImageParameters image = new SignatureImageParameters();
        image.setFieldParameters(field);
        image.setImage(new InMemoryDocument(visibleMarker(), "maiocchi-pades-marker.png"));
        image.setImageScaling(ImageScaling.ZOOM_AND_CENTER);
        image.setBackgroundColor(Color.WHITE);
        image.setTextParameters(text);
        parameters.setImageParameters(image);
    }

    private static byte[] visibleMarker() {
        BufferedImage image = new BufferedImage(160, 96, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
            graphics.setColor(new Color(255, 184, 0));
            graphics.fillRect(0, 0, 7, image.getHeight());
            graphics.setColor(new Color(17, 18, 16));
            graphics.setStroke(new BasicStroke(2f));
            graphics.drawRect(7, 1, image.getWidth() - 9, image.getHeight() - 3);
            graphics.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 48));
            graphics.drawString("m", 33, 57);
            graphics.setColor(new Color(255, 184, 0));
            graphics.drawString(".", 80, 57);
            graphics.setColor(new Color(72, 73, 68));
            graphics.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 9));
            graphics.drawString("MAIOCCHI", 31, 78);
            ImageIO.write(image, "png", output);
            return output.toByteArray();
        } catch (IOException error) {
            throw new ProviderException(500, "visible_signature_failed", "Não foi possível gerar a marca visual da assinatura.");
        } finally {
            graphics.dispose();
        }
    }

    private static SignerIdentity signerIdentity(CertificateToken certificate) {
        X500Name subject = X500Name.getInstance(certificate.getCertificate().getSubjectX500Principal().getEncoded());
        RDN[] commonNames = subject.getRDNs(BCStyle.CN);
        if (commonNames.length == 0 || commonNames[0].getFirst() == null) {
            throw new ProviderException(400, "invalid_certificate", "O certificado não informa o nome do titular.");
        }
        String commonName = IETFUtils.valueToString(commonNames[0].getFirst().getValue()).trim();
        Matcher nationalIdMatcher = NATIONAL_ID.matcher(commonName);
        String nationalId = nationalIdMatcher.find()
                ? nationalIdMatcher.group(1).replaceAll("\\D", "")
                : nationalIdFromIcpBrasilExtension(certificate);
        String signedBy = NATIONAL_ID.matcher(commonName).replaceAll("")
                .replaceAll("\\s*[:;|/-]\\s*$", "")
                .replaceAll("^\\s*[:;|/-]\\s*", "")
                .replaceAll("\\s{2,}", " ")
                .trim();
        if (signedBy.isEmpty()) {
            throw new ProviderException(400, "invalid_certificate", "O certificado não informa o nome do titular.");
        }
        return new SignerIdentity(signedBy, nationalId == null ? null : maskNationalId(nationalId));
    }

    private static String nationalIdFromIcpBrasilExtension(CertificateToken certificate) {
        byte[] encoded = certificate.getCertificate().getExtensionValue(Extension.subjectAlternativeName.getId());
        if (encoded == null) return null;
        try {
            ASN1OctetString extension = ASN1OctetString.getInstance(encoded);
            GeneralNames subjectAlternativeNames = GeneralNames.getInstance(
                    ASN1Primitive.fromByteArray(extension.getOctets()));
            for (GeneralName generalName : subjectAlternativeNames.getNames()) {
                if (generalName.getTagNo() != GeneralName.otherName) continue;
                OtherName otherName = OtherName.getInstance(generalName.getName());
                if (!ICP_BRASIL_PERSON_DATA_OID.equals(otherName.getTypeID().getId())) continue;
                String personalData = asText(otherName.getValue());
                if (personalData == null || personalData.length() < 19) {
                    throw new ProviderException(400, "invalid_certificate", "Os dados ICP-Brasil do certificado são inválidos.");
                }
                String nationalId = personalData.substring(8, 19);
                if (!nationalId.chars().allMatch(Character::isDigit)) {
                    throw new ProviderException(400, "invalid_certificate", "Os dados ICP-Brasil do certificado são inválidos.");
                }
                return nationalId;
            }
            return null;
        } catch (ProviderException error) {
            throw error;
        } catch (Exception error) {
            throw new ProviderException(400, "invalid_certificate", "A extensão ICP-Brasil do certificado é inválida.");
        }
    }

    private static String asText(ASN1Encodable value) {
        ASN1Primitive primitive = value.toASN1Primitive();
        if (primitive instanceof ASN1String text) return text.getString();
        if (primitive instanceof ASN1OctetString octets) {
            return new String(octets.getOctets(), java.nio.charset.StandardCharsets.UTF_8);
        }
        return null;
    }

    private static String maskNationalId(String nationalId) {
        return nationalId.substring(0, 3) + ".***.***-" + nationalId.substring(nationalId.length() - 2);
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
