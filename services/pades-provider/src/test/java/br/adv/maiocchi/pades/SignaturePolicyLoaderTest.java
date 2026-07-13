package br.adv.maiocchi.pades;

import org.bouncycastle.asn1.ASN1Encodable;
import org.bouncycastle.asn1.ASN1Encoding;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.DEROctetString;
import org.bouncycastle.asn1.DERSequence;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.asn1.x509.AlgorithmIdentifier;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SignaturePolicyLoaderTest {
    @Test
    void usesEmbeddedSignPolicyHashInsteadOfWholeFileChecksum() throws Exception {
        Fixture fixture = fixture();
        Path file = Files.createTempFile("pades-policy-", ".der");
        Files.write(file, fixture.der());

        var policy = SignaturePolicyLoader.load(file, PadesEngine.ICP_BRASIL_AD_RB_V1_3_OID,
                PadesEngine.ICP_BRASIL_AD_RB_V1_3_URI,
                hex(sha256(fixture.der())), hex(fixture.policyDigest()));

        assertArrayEquals(fixture.policyDigest(), policy.digest());
        assertNotEquals(hex(sha256(fixture.der())), hex(policy.digest()));
    }

    @Test
    void rejectsWholeFileChecksumAsConfiguredPolicyDigest() throws Exception {
        Fixture fixture = fixture();
        Path file = Files.createTempFile("pades-policy-", ".der");
        Files.write(file, fixture.der());
        String fileDigest = hex(sha256(fixture.der()));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> SignaturePolicyLoader.load(file, PadesEngine.ICP_BRASIL_AD_RB_V1_3_OID,
                        PadesEngine.ICP_BRASIL_AD_RB_V1_3_URI, fileDigest, fileDigest));

        assertEquals("PAdES policy configured digest mismatch", error.getMessage());
    }

    @Test
    void rejectsTamperedInternalDigestEvenWithMatchingFileChecksum() throws Exception {
        Fixture fixture = fixture();
        byte[] tampered = fixture.der().clone();
        tampered[tampered.length - 1] ^= 1;
        Path file = Files.createTempFile("pades-policy-", ".der");
        Files.write(file, tampered);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> SignaturePolicyLoader.load(file, PadesEngine.ICP_BRASIL_AD_RB_V1_3_OID,
                        PadesEngine.ICP_BRASIL_AD_RB_V1_3_URI,
                        hex(sha256(tampered)), hex(fixture.policyDigest())));

        assertEquals("PAdES policy internal digest mismatch", error.getMessage());
    }

    @Test
    void recordsOfficialArtifactAndSignedDigestAsDistinctValues() {
        assertEquals("23da544aef71f7a75dc85fa6e17a83875741e4baef41ec178258a5c86ace54dd",
                PadesEngine.ICP_BRASIL_AD_RB_V1_3_FILE_SHA256);
        assertEquals("23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60",
                PadesEngine.ICP_BRASIL_AD_RB_V1_3_SIGN_POLICY_HASH_SHA256);
        assertNotEquals(PadesEngine.ICP_BRASIL_AD_RB_V1_3_FILE_SHA256,
                PadesEngine.ICP_BRASIL_AD_RB_V1_3_SIGN_POLICY_HASH_SHA256);
    }

    private static Fixture fixture() throws Exception {
        AlgorithmIdentifier algorithm = new AlgorithmIdentifier(NISTObjectIdentifiers.id_sha256);
        DERSequence policyInfo = new DERSequence(new ASN1ObjectIdentifier(
                PadesEngine.ICP_BRASIL_AD_RB_V1_3_OID));
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(algorithm.getEncoded(ASN1Encoding.DER));
        body.write(policyInfo.getEncoded(ASN1Encoding.DER));
        byte[] policyDigest = sha256(body.toByteArray());
        byte[] der = new DERSequence(new ASN1Encodable[] {
                algorithm, policyInfo, new DEROctetString(policyDigest)
        }).getEncoded(ASN1Encoding.DER);
        return new Fixture(der, policyDigest);
    }

    private static byte[] sha256(byte[] value) throws Exception {
        return MessageDigest.getInstance("SHA-256").digest(value);
    }

    private static String hex(byte[] value) {
        return HexFormat.of().formatHex(value);
    }

    private record Fixture(byte[] der, byte[] policyDigest) {}
}
