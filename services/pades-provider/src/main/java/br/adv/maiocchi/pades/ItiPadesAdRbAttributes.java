package br.adv.maiocchi.pades;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.cms.AttributeTable;
import org.bouncycastle.asn1.cms.CMSAttributes;
import org.bouncycastle.asn1.pkcs.PKCSObjectIdentifiers;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;

import java.util.ArrayList;
import java.util.List;

final class ItiPadesAdRbAttributes {
    static final String APPLICATION_NAME = "Maiocchi Assinatura PAdES Provider 1.2.1";
    static final String DEFAULT_REASON = "Assinatura digital ICP-Brasil";
    static final String DEFAULT_SIGNER_ROLE = "Signatário ICP-Brasil";

    private static final ASN1ObjectIdentifier SIGNER_ATTRIBUTE =
            PKCSObjectIdentifiers.id_aa_ets_signerAttr;
    private static final ASN1ObjectIdentifier SIGNER_ATTRIBUTE_V2 =
            new ASN1ObjectIdentifier("0.4.0.19122.1.1");
    private static final ASN1ObjectIdentifier CONTENT_TIMESTAMP =
            PKCSObjectIdentifiers.id_aa_ets_contentTimestamp;
    private static final ASN1ObjectIdentifier SIGNATURE_TIMESTAMP =
            PKCSObjectIdentifiers.id_aa_signatureTimeStampToken;
    private static final ASN1ObjectIdentifier SIGNER_LOCATION =
            PKCSObjectIdentifiers.id_aa_ets_signerLocation;
    private static final ASN1ObjectIdentifier ADOBE_REVOCATION_INFO =
            new ASN1ObjectIdentifier("1.2.840.113583.1.1.8");
    private static final ASN1ObjectIdentifier COUNTERSIGNATURE =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.6");
    private static final ASN1ObjectIdentifier CERTIFICATE_REFS =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.21");
    private static final ASN1ObjectIdentifier REVOCATION_REFS =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.22");
    private static final ASN1ObjectIdentifier CERTIFICATE_VALUES =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.23");
    private static final ASN1ObjectIdentifier REVOCATION_VALUES =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.24");
    private static final ASN1ObjectIdentifier ESC_TIMESTAMP =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.25");
    private static final ASN1ObjectIdentifier ATTRIBUTE_CERTIFICATE_REFS =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.44");
    private static final ASN1ObjectIdentifier ATTRIBUTE_REVOCATION_REFS =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.45");
    private static final ASN1ObjectIdentifier ARCHIVE_TIMESTAMP_V2 =
            new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.48");

    private static final COSName REFERENCE = COSName.getPDFName("Reference");
    private static final COSName CHANGES = COSName.getPDFName("Changes");
    private static final COSName V = COSName.getPDFName("V");
    private static final COSName PROP_BUILD = COSName.getPDFName("Prop_Build");
    private static final COSName PROP_AUTH_TIME = COSName.getPDFName("Prop_AuthTime");
    private static final COSName PROP_AUTH_TYPE = COSName.getPDFName("Prop_AuthType");
    private static final COSName R = COSName.getPDFName("R");
    private static final COSName DSS = COSName.getPDFName("DSS");
    private static final COSName VRI = COSName.getPDFName("VRI");

    record AttributeState(String identifier, String requirement, boolean present, String status) {}

    record Profile(String normativeDocument, String profile, List<AttributeState> signedCms,
                   List<AttributeState> unsignedCms, List<AttributeState> signatureDictionary,
                   List<AttributeState> relatedDictionaries, List<String> prohibitedAbsent) {}

    private ItiPadesAdRbAttributes() {}

    static Profile inspectAndAssert(byte[] signedPdf, boolean timestampsRequired) {
        try (PDDocument document = Loader.loadPDF(signedPdf)) {
            List<PDSignature> signatures = document.getSignatureDictionaries();
            if (signatures.isEmpty()) {
                throw invalid("O PDF não contém dicionário de assinatura.");
            }
            PDSignature signature = signatures.get(signatures.size() - 1);
            CMSSignedData cms = new CMSSignedData(signature.getContents(signedPdf));
            if (cms.getSignerInfos().size() != 1) {
                throw invalid("O CMS deve conter exatamente um assinante.");
            }
            SignerInformation signer = cms.getSignerInfos().getSigners().iterator().next();
            AttributeTable signed = signer.getSignedAttributes();
            AttributeTable unsigned = signer.getUnsignedAttributes();
            if (signed == null) throw invalid("O CMS não contém atributos assinados.");

            require(signed, CMSAttributes.contentType, "id-contentType");
            require(signed, CMSAttributes.messageDigest, "id-messageDigest");
            require(signed, PKCSObjectIdentifiers.id_aa_signingCertificateV2, "id-aa-signingCertificateV2");
            require(signed, PKCSObjectIdentifiers.id_aa_ets_sigPolicyId, "id-aa-ets-sigPolicyId");
            require(signed, SIGNER_ATTRIBUTE, "id-aa-ets-signerAttr");

            prohibit(signed, PKCSObjectIdentifiers.id_aa_signingCertificate, "id-aa-signingCertificate");
            prohibit(signed, PKCSObjectIdentifiers.pkcs_9_at_signingTime, "id-signingTime");
            prohibit(signed, SIGNER_LOCATION, "id-aa-ets-signerLocation");
            prohibit(signed, ADOBE_REVOCATION_INFO, "adbe-revocationInfoArchival");
            prohibit(signed, SIGNER_ATTRIBUTE_V2, "id-aa-ets-signerAttrV2");
            prohibit(unsigned, COUNTERSIGNATURE, "id-countersignature");
            prohibit(unsigned, CERTIFICATE_REFS, "id-aa-ets-certificateRefs");
            prohibit(unsigned, REVOCATION_REFS, "id-aa-ets-revocationRefs");
            prohibit(unsigned, ATTRIBUTE_CERTIFICATE_REFS, "id-aa-ets-attrCertificateRefs");
            prohibit(unsigned, ATTRIBUTE_REVOCATION_REFS, "id-aa-ets-attrRevocationRefs");
            prohibit(unsigned, ESC_TIMESTAMP, "id-aa-ets-escTimeStamp");
            prohibit(unsigned, CERTIFICATE_VALUES, "id-aa-ets-certValues");
            prohibit(unsigned, REVOCATION_VALUES, "id-aa-ets-revocationValues");
            prohibit(unsigned, ARCHIVE_TIMESTAMP_V2, "id-aa-ets-archiveTimestampV2");

            COSDictionary dictionary = signature.getCOSObject();
            requireDictionary(dictionary, COSName.TYPE, "Type");
            requireDictionary(dictionary, COSName.FILTER, "Filter");
            requireDictionary(dictionary, COSName.SUB_FILTER, "SubFilter");
            requireDictionary(dictionary, COSName.CONTENTS, "Contents");
            requireDictionary(dictionary, COSName.BYTERANGE, "ByteRange");
            requireDictionary(dictionary, COSName.NAME, "Name");
            requireDictionary(dictionary, COSName.M, "M");
            requireDictionary(dictionary, COSName.LOCATION, "Location");
            requireDictionary(dictionary, COSName.REASON, "Reason");
            requireDictionary(dictionary, COSName.CONTACT_INFO, "ContactInfo");
            requireDictionary(dictionary, PROP_BUILD, "Prop_Build");
            prohibitDictionary(dictionary, COSName.CERT, "Cert");
            prohibitDictionary(dictionary, R, "R");
            prohibitDictionary(dictionary, PROP_AUTH_TYPE, "Prop_AuthType");

            boolean contentTimestamp = has(signed, CONTENT_TIMESTAMP);
            boolean signatureTimestamp = has(unsigned, SIGNATURE_TIMESTAMP);
            if (timestampsRequired && (!contentTimestamp || !signatureTimestamp)) {
                throw invalid("Os carimbos opcionais configurados não constam integralmente no CMS.");
            }
            COSDictionary catalog = document.getDocumentCatalog().getCOSObject();
            COSDictionary dss = catalog.getCOSDictionary(DSS);
            boolean hasDss = dss != null;
            boolean hasVri = hasDss && dss.getCOSDictionary(VRI) != null;
            boolean hasDocumentTimestamp = signatures.stream().anyMatch(candidate ->
                    "DocTimeStamp".equals(candidate.getCOSObject().getNameAsString(COSName.TYPE)));

            List<AttributeState> signedCms = List.of(
                    present("id-aa-ets-signerAttr", "P"),
                    conditional("id-aa-ets-contentTimeStamp", "P", contentTimestamp,
                            "REQUIRES_ICP_BRASIL_ACT")
            );
            List<AttributeState> unsignedCms = List.of(
                    conditional("id-aa-signatureTimeStampToken", "P", signatureTimestamp,
                            "REQUIRES_ICP_BRASIL_ACT")
            );
            List<AttributeState> signatureDictionary = List.of(
                    conditional("Reference", "P", dictionary.containsKey(REFERENCE),
                            "NOT_APPLICABLE_APPROVAL_SIGNATURE"),
                    conditional("Changes", "P", dictionary.containsKey(CHANGES),
                            "NOT_APPLICABLE_WITHOUT_REFERENCE_TRANSFORM"),
                    present("Name", "P"),
                    present("M", "P"),
                    present("Location", "P"),
                    present("Reason", "P"),
                    present("ContactInfo", "P"),
                    conditional("V", "P", dictionary.containsKey(V), "EFFECTIVE_DEFAULT_0"),
                    present("Prop_Build", "P"),
                    conditional("Prop_AuthTime", "P", dictionary.containsKey(PROP_AUTH_TIME),
                            "NOT_AVAILABLE_BEFORE_A3_AUTHENTICATION")
            );
            List<AttributeState> relatedDictionaries = List.of(
                    conditional("DSS", "P", hasDss, "NOT_REQUESTED_FOR_AD_RB"),
                    conditional("VRI", "P", hasVri, "REQUIRED_ONLY_WHEN_DSS_IS_PRESENT"),
                    conditional("Document Time-stamp", "P", hasDocumentTimestamp,
                            "REQUIRES_ICP_BRASIL_ACT")
            );
            List<String> prohibitedAbsent = new ArrayList<>(List.of(
                    "id-aa-signingCertificate", "id-signingTime", "id-aa-ets-signerLocation",
                    "adbe-revocationInfoArchival", "id-countersignature", "id-aa-ets-certificateRefs",
                    "id-aa-ets-revocationRefs", "id-aa-ets-attrCertificateRefs",
                    "id-aa-ets-attrRevocationRefs", "id-aa-ets-escTimeStamp", "id-aa-ets-certValues",
                    "id-aa-ets-revocationValues", "id-aa-ets-archiveTimestampV2",
                    "Cert", "R", "Prop_AuthType"
            ));
            return new Profile("DOC-ICP-15.03 v9.1, tabelas A.14-A.22", "PAdES AD-RB v1.3",
                    signedCms, unsignedCms, signatureDictionary, relatedDictionaries,
                    List.copyOf(prohibitedAbsent));
        } catch (ProviderException error) {
            throw error;
        } catch (Exception error) {
            throw invalid("Não foi possível auditar os atributos ITI do PAdES final.");
        }
    }

    private static AttributeState present(String identifier, String requirement) {
        return new AttributeState(identifier, requirement, true, "PRESENT");
    }

    private static AttributeState conditional(String identifier, String requirement, boolean present,
                                              String absentStatus) {
        return new AttributeState(identifier, requirement, present, present ? "PRESENT" : absentStatus);
    }

    private static boolean has(AttributeTable attributes, ASN1ObjectIdentifier oid) {
        return attributes != null && attributes.get(oid) != null;
    }

    private static void require(AttributeTable attributes, ASN1ObjectIdentifier oid, String name) {
        if (!has(attributes, oid)) throw invalid("Atributo obrigatório ausente: " + name + ".");
    }

    private static void prohibit(AttributeTable attributes, ASN1ObjectIdentifier oid, String name) {
        if (has(attributes, oid)) throw invalid("Atributo proibido presente: " + name + ".");
    }

    private static void requireDictionary(COSDictionary dictionary, COSName key, String name) {
        if (!dictionary.containsKey(key)) throw invalid("Entrada obrigatória ou adotada ausente: " + name + ".");
    }

    private static void prohibitDictionary(COSDictionary dictionary, COSName key, String name) {
        if (dictionary.containsKey(key)) throw invalid("Entrada proibida presente: " + name + ".");
    }

    private static ProviderException invalid(String message) {
        return new ProviderException(422, "iti_attribute_profile_invalid", message);
    }
}
