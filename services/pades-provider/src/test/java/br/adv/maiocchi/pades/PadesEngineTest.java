package br.adv.maiocchi.pades;

import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.x509.CommonTrustedCertificateSource;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyUsage;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.Test;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class PadesEngineTest {
    private static final Instant NOW = Instant.parse("2026-07-12T16:00:00Z");
    private static final PadesEngine.SignaturePolicy POLICY = new PadesEngine.SignaturePolicy(
            "2.16.76.1.7.1.11.1.3", new byte[32], "https://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der");

    @Test
    void completesPadesWithExternalRsaAndPreventsReplay() throws Exception {
        KeyPair rootKey = rsa();
        X509Certificate root = certificate("CN=ICP Test Root", rootKey, null, null, true);
        KeyPair signerKey = rsa();
        X509Certificate signer = certificate("CN=Assinante ICP Teste", signerKey, root, rootKey.getPrivate(), false);

        CommonTrustedCertificateSource trust = new CommonTrustedCertificateSource();
        trust.addCertificate(DSSUtils.loadCertificate(root.getEncoded()));
        PadesEngine engine = new PadesEngine(trust, Clock.fixed(NOW, ZoneOffset.UTC), POLICY, false);

        byte[] pdf = pdf();
        var prepared = engine.prepare(new PadesEngine.PrepareRequest(
                Base64.getEncoder().encodeToString(pdf), "contrato.pdf",
                Base64.getEncoder().encodeToString(signer.getEncoded()),
                List.of(Base64.getEncoder().encodeToString(root.getEncoded()))
        ));
        assertEquals(PadesEngine.sha256(pdf), prepared.documentSha256());
        assertEquals("RSA-SHA256", prepared.signatureAlgorithm());

        Signature token = Signature.getInstance("SHA256withRSA");
        token.initSign(signerKey.getPrivate());
        token.update(Base64.getDecoder().decode(prepared.toBeSignedBase64()));
        String signature = Base64.getEncoder().encodeToString(token.sign());

        var completed = engine.complete(prepared.sessionId(), new PadesEngine.CompleteRequest(signature));
        byte[] signedPdf = Base64.getDecoder().decode(completed.signedPdfBase64());
        assertTrue(new String(signedPdf, 0, 5).startsWith("%PDF-"));
        assertEquals(PadesEngine.sha256(signedPdf), completed.signedPdfSha256());
        assertTrue(completed.validation().cryptographicIntegrity());
        assertFalse(completed.validation().trusted(), "A fixture não publica CRL/OCSP e não pode simular confiança completa.");
        assertEquals(POLICY.oid(), completed.validation().policyOid());
        try (PDDocument parsed = Loader.loadPDF(signedPdf)) {
            assertFalse(parsed.getSignatureDictionaries().isEmpty());
            assertNotNull(parsed.getDocumentCatalog().getAcroForm());
            PDSignatureField field = null;
            for (PDField candidate : parsed.getDocumentCatalog().getAcroForm().getFieldTree()) {
                if (candidate instanceof PDSignatureField signatureField) {
                    field = signatureField;
                    break;
                }
            }
            assertNotNull(field, "O PAdES deve conter campo de assinatura visível.");
            PDAnnotationWidget widget = field.getWidgets().getFirst();
            assertTrue(widget.getRectangle().getWidth() >= 300);
            assertTrue(widget.getRectangle().getHeight() >= 50);
            assertNotNull(widget.getAppearance());
            assertNotNull(widget.getAppearance().getNormalAppearance());
        }
        ProviderException replay = assertThrows(ProviderException.class,
                () -> engine.complete(prepared.sessionId(), new PadesEngine.CompleteRequest(signature)));
        assertEquals("session_not_found", replay.code);
    }

    @Test
    void rejectsSignatureThatDoesNotMatchPreparedBytes() throws Exception {
        KeyPair signerKey = rsa();
        X509Certificate signer = certificate("CN=Self Signed Test", signerKey, null, null, true);
        CommonTrustedCertificateSource trust = new CommonTrustedCertificateSource();
        trust.addCertificate(DSSUtils.loadCertificate(signer.getEncoded()));
        PadesEngine engine = new PadesEngine(trust, Clock.fixed(NOW, ZoneOffset.UTC), POLICY);
        var prepared = engine.prepare(new PadesEngine.PrepareRequest(
                Base64.getEncoder().encodeToString(pdf()), "teste.pdf",
                Base64.getEncoder().encodeToString(signer.getEncoded()), List.of()
        ));
        Signature token = Signature.getInstance("SHA256withRSA");
        token.initSign(signerKey.getPrivate());
        token.update("outros bytes".getBytes());
        String invalid = Base64.getEncoder().encodeToString(token.sign());
        ProviderException error = assertThrows(ProviderException.class,
                () -> engine.complete(prepared.sessionId(), new PadesEngine.CompleteRequest(invalid)));
        assertEquals("signature_invalid", error.code);
    }

    private static byte[] pdf() throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }

    private static KeyPair rsa() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static X509Certificate certificate(String subject, KeyPair subjectKey, X509Certificate issuer,
                                               PrivateKey issuerKey, boolean ca) throws Exception {
        X500Name subjectName = new X500Name(subject);
        X500Name issuerName = issuer == null ? subjectName : new X500Name(issuer.getSubjectX500Principal().getName());
        PrivateKey signingKey = issuerKey == null ? subjectKey.getPrivate() : issuerKey;
        X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                issuerName, BigInteger.valueOf(Math.abs(subject.hashCode()) + 1L),
                Date.from(NOW.minusSeconds(3600)), Date.from(NOW.plusSeconds(365L * 86400)),
                subjectName, subjectKey.getPublic()
        );
        builder.addExtension(Extension.basicConstraints, true, new BasicConstraints(ca));
        builder.addExtension(Extension.keyUsage, true,
                new KeyUsage(ca ? KeyUsage.keyCertSign | KeyUsage.cRLSign : KeyUsage.digitalSignature | KeyUsage.nonRepudiation));
        return new JcaX509CertificateConverter().getCertificate(
                builder.build(new JcaContentSignerBuilder("SHA256withRSA").build(signingKey))
        );
    }
}
