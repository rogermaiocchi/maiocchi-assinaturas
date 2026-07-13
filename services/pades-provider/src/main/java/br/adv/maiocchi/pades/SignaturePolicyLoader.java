package br.adv.maiocchi.pades;

import org.bouncycastle.asn1.ASN1Encoding;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1OctetString;
import org.bouncycastle.asn1.ASN1Primitive;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

final class SignaturePolicyLoader {
    private SignaturePolicyLoader() {}

    static PadesEngine.SignaturePolicy load(Path file, String expectedOid, String uri,
                                            String expectedFileSha256, String expectedPolicyDigestSha256)
            throws IOException {
        byte[] der = Files.readAllBytes(file);
        byte[] expectedFileDigest = parseSha256(expectedFileSha256, "PADES_POLICY_FILE_SHA256");
        byte[] expectedPolicyDigest = parseSha256(expectedPolicyDigestSha256, "PADES_POLICY_DIGEST_SHA256");
        byte[] actualFileDigest = sha256(der);
        if (!MessageDigest.isEqual(expectedFileDigest, actualFileDigest)) {
            throw new IllegalArgumentException("PAdES policy file checksum mismatch");
        }

        try {
            ASN1Sequence policy = ASN1Sequence.getInstance(ASN1Primitive.fromByteArray(der));
            if (policy.size() != 3 || !MessageDigest.isEqual(der, policy.getEncoded(ASN1Encoding.DER))) {
                throw new IllegalArgumentException("PAdES policy is not a canonical DER SignaturePolicy");
            }

            ASN1Sequence hashAlgorithm = ASN1Sequence.getInstance(policy.getObjectAt(0));
            if (hashAlgorithm.size() < 1 || !NISTObjectIdentifiers.id_sha256.equals(
                    ASN1ObjectIdentifier.getInstance(hashAlgorithm.getObjectAt(0)))) {
                throw new IllegalArgumentException("PAdES policy does not use SHA-256");
            }

            ASN1Sequence policyInfo = ASN1Sequence.getInstance(policy.getObjectAt(1));
            if (policyInfo.size() < 1 || !expectedOid.equals(
                    ASN1ObjectIdentifier.getInstance(policyInfo.getObjectAt(0)).getId())) {
                throw new IllegalArgumentException("PAdES policy OID mismatch");
            }

            ByteArrayOutputStream signedPolicyBody = new ByteArrayOutputStream();
            signedPolicyBody.write(hashAlgorithm.getEncoded(ASN1Encoding.DER));
            signedPolicyBody.write(policyInfo.getEncoded(ASN1Encoding.DER));
            byte[] calculatedPolicyDigest = sha256(signedPolicyBody.toByteArray());
            byte[] embeddedPolicyDigest = ASN1OctetString.getInstance(policy.getObjectAt(2)).getOctets();
            if (embeddedPolicyDigest.length != 32 ||
                    !MessageDigest.isEqual(calculatedPolicyDigest, embeddedPolicyDigest)) {
                throw new IllegalArgumentException("PAdES policy internal digest mismatch");
            }
            if (!MessageDigest.isEqual(expectedPolicyDigest, embeddedPolicyDigest)) {
                throw new IllegalArgumentException("PAdES policy configured digest mismatch");
            }

            return new PadesEngine.SignaturePolicy(expectedOid, embeddedPolicyDigest.clone(), uri);
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("Invalid PAdES policy DER", error);
        }
    }

    private static byte[] parseSha256(String value, String name) {
        if (value == null || !value.matches("[a-fA-F0-9]{64}")) {
            throw new IllegalArgumentException(name + " must be a SHA-256 hex digest");
        }
        return HexFormat.of().parseHex(value);
    }

    private static byte[] sha256(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }
}
