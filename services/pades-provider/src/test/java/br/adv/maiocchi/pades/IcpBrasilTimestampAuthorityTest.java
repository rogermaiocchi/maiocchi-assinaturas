package br.adv.maiocchi.pades;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class IcpBrasilTimestampAuthorityTest {
    @TempDir
    Path tempDirectory;

    @Test
    void remainsDisabledByDefault() throws Exception {
        var configuration = IcpBrasilTimestampAuthority.fromEnvironment(Map.of());
        assertFalse(configuration.enabled());
        assertNull(configuration.source());
    }

    @Test
    void failsClosedForIncompleteOrInsecureActConfiguration() throws Exception {
        Map<String, String> environment = new HashMap<>();
        environment.put("PADES_TSP_MODE", "act-mtls");
        IllegalArgumentException missing = assertThrows(IllegalArgumentException.class,
                () -> IcpBrasilTimestampAuthority.fromEnvironment(environment));
        assertEquals("PADES_TSP_URL is required", missing.getMessage());

        Path keyStore = tempDirectory.resolve("client.p12");
        Files.write(keyStore, new byte[]{1, 2, 3});
        environment.put("PADES_TSP_URL", "http://act.example.test/tsp");
        environment.put("PADES_TSP_KEYSTORE_FILE", keyStore.toString());
        environment.put("PADES_TSP_KEYSTORE_PASSWORD", "test-only");
        IllegalArgumentException insecure = assertThrows(IllegalArgumentException.class,
                () -> IcpBrasilTimestampAuthority.fromEnvironment(environment));
        assertEquals("PADES_TSP_URL must be a public HTTPS endpoint", insecure.getMessage());
    }
}
