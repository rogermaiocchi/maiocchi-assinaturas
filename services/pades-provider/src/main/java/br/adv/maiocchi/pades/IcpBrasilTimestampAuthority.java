package br.adv.maiocchi.pades;

import eu.europa.esig.dss.model.InMemoryDocument;
import eu.europa.esig.dss.service.SecureRandomNonceSource;
import eu.europa.esig.dss.service.http.commons.TimestampDataLoader;
import eu.europa.esig.dss.service.tsp.OnlineTSPSource;
import eu.europa.esig.dss.spi.x509.tsp.TSPSource;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

final class IcpBrasilTimestampAuthority {
    private static final int MAX_KEYSTORE_BYTES = 2 * 1024 * 1024;

    record Configuration(boolean enabled, TSPSource source) {}

    private IcpBrasilTimestampAuthority() {}

    static Configuration fromEnvironment(Map<String, String> environment) throws Exception {
        String mode = value(environment, "PADES_TSP_MODE", "disabled");
        if ("disabled".equals(mode)) return new Configuration(false, null);
        if (!"act-mtls".equals(mode)) {
            throw new IllegalArgumentException("PADES_TSP_MODE must be disabled or act-mtls");
        }

        String endpoint = required(environment, "PADES_TSP_URL");
        URI uri = URI.create(endpoint);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null ||
                (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw new IllegalArgumentException("PADES_TSP_URL must be a public HTTPS endpoint");
        }

        Path keyStore = Path.of(required(environment, "PADES_TSP_KEYSTORE_FILE"));
        if (!Files.isRegularFile(keyStore) || Files.size(keyStore) == 0 || Files.size(keyStore) > MAX_KEYSTORE_BYTES) {
            throw new IllegalArgumentException("PADES_TSP_KEYSTORE_FILE must be a non-empty PKCS#12 file");
        }
        char[] password = required(environment, "PADES_TSP_KEYSTORE_PASSWORD").toCharArray();

        TimestampDataLoader dataLoader = new TimestampDataLoader();
        dataLoader.setRedirectsEnabled(false);
        dataLoader.setTimeoutConnection(10_000);
        dataLoader.setTimeoutConnectionRequest(10_000);
        dataLoader.setTimeoutResponse(15_000);
        dataLoader.setTimeoutSocket(15_000);
        dataLoader.setSslProtocol("TLS");
        dataLoader.setSupportedSSLProtocols(new String[]{"TLSv1.3", "TLSv1.2"});
        dataLoader.setSslKeystore(new InMemoryDocument(Files.readAllBytes(keyStore), keyStore.getFileName().toString()));
        dataLoader.setSslKeystoreType("PKCS12");
        dataLoader.setSslKeystorePassword(password);
        dataLoader.setKeyStoreAsTrustMaterial(false);

        OnlineTSPSource source = new OnlineTSPSource(endpoint, new RestrictedDataLoader(dataLoader));
        source.setNonceSource(new SecureRandomNonceSource());
        String policyOid = value(environment, "PADES_TSP_POLICY_OID", "");
        if (!policyOid.isBlank()) source.setPolicyOid(policyOid);
        return new Configuration(true, source);
    }

    private static String required(Map<String, String> environment, String name) {
        String value = environment.get(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " is required");
        return value.trim();
    }

    private static String value(Map<String, String> environment, String name, String fallback) {
        String value = environment.get(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
