package br.adv.maiocchi.pades;

import eu.europa.esig.dss.spi.client.http.DataLoader;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RestrictedDataLoaderTest {
    @Test
    void blocksLocalPrivateAndNonHttpDestinations() {
        RestrictedDataLoader loader = new RestrictedDataLoader(new StubLoader());
        for (String url : List.of(
                "http://127.0.0.1/crl", "http://10.0.0.1/crl", "http://169.254.169.254/latest/meta-data",
                "file:///etc/passwd", "ldap://example.com/cn=test", "http://user@example.com/crl", "http://localhost/crl")) {
            assertThrows(IllegalArgumentException.class, () -> loader.get(url), url);
        }
    }

    @Test
    void permitsPublicHttpsAndLimitsResponseSize() {
        RestrictedDataLoader loader = new RestrictedDataLoader(new StubLoader());
        assertArrayEquals(new byte[]{1, 2, 3}, loader.get("https://example.com/crl"));
        RestrictedDataLoader oversized = new RestrictedDataLoader(new StubLoader() {
            @Override public byte[] get(String url) { return new byte[5 * 1024 * 1024 + 1]; }
        });
        assertThrows(IllegalArgumentException.class, () -> oversized.get("https://example.com/crl"));
    }

    private static class StubLoader implements DataLoader {
        @Override public byte[] get(String url) { return new byte[]{1, 2, 3}; }
        @Override public DataAndUrl get(List<String> urls) { return null; }
        @Override public byte[] post(String url, byte[] content) { return new byte[]{1, 2, 3}; }
        @Override public void setContentType(String contentType) {}
    }
}
