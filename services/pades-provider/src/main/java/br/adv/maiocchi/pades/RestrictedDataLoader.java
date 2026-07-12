package br.adv.maiocchi.pades;

import eu.europa.esig.dss.spi.client.http.DataLoader;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.util.List;

final class RestrictedDataLoader implements DataLoader {
    private static final long serialVersionUID = 1L;
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private final DataLoader delegate;

    RestrictedDataLoader(DataLoader delegate) {
        this.delegate = delegate;
    }

    @Override
    public byte[] get(String url) {
        assertPublicHttp(url);
        return limit(delegate.get(url));
    }

    @Override
    public DataAndUrl get(List<String> urls) {
        for (String url : urls) {
            try {
                byte[] data = get(url);
                if (data != null) return new DataAndUrl(url, data);
            } catch (RuntimeException ignored) {
                // Try the next official distribution point.
            }
        }
        return null;
    }

    @Override
    public byte[] post(String url, byte[] content) {
        assertPublicHttp(url);
        if (content == null || content.length == 0 || content.length > 1024 * 1024) {
            throw new IllegalArgumentException("OCSP request size is invalid");
        }
        return limit(delegate.post(url, content));
    }

    @Override
    public void setContentType(String contentType) {
        delegate.setContentType(contentType);
    }

    private static byte[] limit(byte[] data) {
        if (data != null && data.length > MAX_RESPONSE_BYTES) throw new IllegalArgumentException("PKI response is too large");
        return data;
    }

    private static void assertPublicHttp(String value) {
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            int port = uri.getPort();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) || host == null ||
                    uri.getUserInfo() != null || (port != -1 && port != 80 && port != 443) ||
                    host.equalsIgnoreCase("localhost") || host.toLowerCase().endsWith(".local")) {
                throw new IllegalArgumentException("PKI URL is not allowed");
            }
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() ||
                        address.isSiteLocalAddress() || address.isMulticastAddress() || isUniqueLocal(address)) {
                    throw new IllegalArgumentException("PKI URL resolves to a non-public address");
                }
            }
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("PKI URL could not be validated", error);
        }
    }

    private static boolean isUniqueLocal(InetAddress address) {
        if (!(address instanceof Inet6Address)) return false;
        byte first = address.getAddress()[0];
        return (first & 0xfe) == 0xfc;
    }
}
