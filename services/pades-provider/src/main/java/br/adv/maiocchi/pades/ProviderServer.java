package br.adv.maiocchi.pades;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.x509.CommonTrustedCertificateSource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

public final class ProviderServer {
    private static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
    private static final int MAX_JSON_BYTES = 60 * 1024 * 1024;
    private static final String VERSION = ProviderServer.class.getPackage().getImplementationVersion() == null
            ? "development" : ProviderServer.class.getPackage().getImplementationVersion();

    private final HttpServer server;
    private final PadesEngine engine;
    private final byte[] apiKey;

    ProviderServer(InetSocketAddress address, PadesEngine engine, String apiKey) throws IOException {
        if (apiKey == null || apiKey.length() < 32) throw new IllegalArgumentException("provider API key is too short");
        this.engine = engine;
        this.apiKey = apiKey.getBytes(StandardCharsets.UTF_8);
        this.server = HttpServer.create(address, 64);
        this.server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        this.server.createContext("/healthz", this::health);
        this.server.createContext("/v1/signatures/prepare", this::prepare);
        this.server.createContext("/v1/signatures", this::session);
    }

    void start() { server.start(); }
    void stop() { server.stop(1); }
    int port() { return server.getAddress().getPort(); }

    private void health(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            problem(exchange, 405, "method_not_allowed", "Método não permitido.");
            return;
        }
        json(exchange, 200, Map.of(
                "status", "ok",
                "service", "pades-provider",
                "version", VERSION,
                "ready", true,
                "activeSessions", engine.activeSessions()
        ));
    }

    private void prepare(HttpExchange exchange) throws IOException {
        if (!authorize(exchange)) return;
        if (!"POST".equals(exchange.getRequestMethod())) {
            problem(exchange, 405, "method_not_allowed", "Método não permitido.");
            return;
        }
        try {
            var request = JSON.readValue(readBody(exchange), PadesEngine.PrepareRequest.class);
            json(exchange, 201, engine.prepare(request));
        } catch (ProviderException error) {
            problem(exchange, error.status, error.code, error.getMessage());
        } catch (LinkageError error) {
            error.printStackTrace();
            problem(exchange, 500, "provider_runtime_error", "Runtime criptográfico incompleto.");
        } catch (Exception error) {
            problem(exchange, 400, "invalid_request", "Requisição inválida.");
        }
    }

    private void session(HttpExchange exchange) throws IOException {
        if (!authorize(exchange)) return;
        if (!"POST".equals(exchange.getRequestMethod())) {
            problem(exchange, 405, "method_not_allowed", "Método não permitido.");
            return;
        }
        String prefix = "/v1/signatures/";
        String path = exchange.getRequestURI().getPath();
        boolean isResume = path.endsWith("/resume");
        boolean isComplete = path.endsWith("/complete");
        if (!path.startsWith(prefix) || (!isResume && !isComplete)) {
            problem(exchange, 404, "not_found", "Rota não encontrada.");
            return;
        }
        String suffix = isResume ? "/resume" : "/complete";
        String sessionId = path.substring(prefix.length(), path.length() - suffix.length());
        if (!sessionId.matches("[0-9a-f-]{36}")) {
            problem(exchange, 404, "not_found", "Sessão não encontrada.");
            return;
        }
        try {
            if (isResume) {
                readBody(exchange);
                json(exchange, 200, engine.resume(sessionId));
            } else {
                var request = JSON.readValue(readBody(exchange), PadesEngine.CompleteRequest.class);
                json(exchange, 200, engine.complete(sessionId, request));
            }
        } catch (ProviderException error) {
            problem(exchange, error.status, error.code, error.getMessage());
        } catch (LinkageError error) {
            error.printStackTrace();
            problem(exchange, 500, "provider_runtime_error", "Runtime criptográfico incompleto.");
        } catch (Exception error) {
            problem(exchange, 400, "invalid_request", "Requisição inválida.");
        }
    }

    private boolean authorize(HttpExchange exchange) throws IOException {
        String supplied = exchange.getRequestHeaders().getFirst("X-Provider-Key");
        byte[] candidate = supplied == null ? new byte[0] : supplied.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(apiKey, candidate)) {
            problem(exchange, 401, "unauthorized", "Requisição não autorizada.");
            return false;
        }
        return true;
    }

    private static byte[] readBody(HttpExchange exchange) throws IOException {
        byte[] body = exchange.getRequestBody().readNBytes(MAX_JSON_BYTES + 1);
        if (body.length > MAX_JSON_BYTES) throw new ProviderException(413, "payload_too_large", "Corpo excede o limite.");
        return body;
    }

    private static void json(HttpExchange exchange, int status, Object value) throws IOException {
        byte[] body = JSON.writeValueAsBytes(value);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void problem(HttpExchange exchange, int status, String code, String message) throws IOException {
        json(exchange, status, Map.of("error", Map.of("code", code, "message", message)));
    }

    static CommonTrustedCertificateSource loadTrustStore(Path directory, List<String> trustedRoots) throws IOException {
        CommonTrustedCertificateSource source = new CommonTrustedCertificateSource();
        if (!Files.isDirectory(directory) || trustedRoots == null || trustedRoots.isEmpty()) return source;
        for (String fileName : trustedRoots) {
            if (!fileName.matches("[A-Za-z0-9._-]+") || !isCertificateFile(Path.of(fileName))) {
                throw new IOException("invalid trust certificate name: " + fileName);
            }
            Path path = directory.resolve(fileName).normalize();
            if (!path.getParent().equals(directory.normalize()) || !Files.isRegularFile(path)) {
                throw new IOException("trust certificate not found: " + fileName);
            }
            try {
                byte[] bytes = Files.readAllBytes(path);
                if (fileName.toLowerCase().endsWith(".p7b") || fileName.toLowerCase().endsWith(".p7c")) {
                    DSSUtils.loadCertificateFromP7c(bytes).forEach(source::addCertificate);
                } else {
                    source.addCertificate(DSSUtils.loadCertificate(bytes));
                }
            } catch (Exception error) {
                throw new IOException("invalid trust certificate: " + fileName, error);
            }
        }
        return source;
    }

    private static boolean isCertificateFile(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return name.endsWith(".crt") || name.endsWith(".cer") || name.endsWith(".p7b") || name.endsWith(".p7c");
    }

    public static void main(String[] args) throws Exception {
        String apiKey = System.getenv("PADES_PROVIDER_API_KEY");
        Path trustDirectory = Path.of(System.getenv().getOrDefault("ICP_TRUST_DIR", "/run/icp-trust"));
        List<String> trustedRoots = List.of(requiredEnvironment("ICP_TRUST_ROOTS").split(","));
        Path policyFile = Path.of(requiredEnvironment("PADES_POLICY_FILE"));
        String policyOid = requiredEnvironment("PADES_POLICY_OID");
        String policyUri = requiredEnvironment("PADES_POLICY_URI");
        String expectedPolicyFileHash = requiredEnvironment("PADES_POLICY_FILE_SHA256");
        String expectedPolicyDigest = requiredEnvironment("PADES_POLICY_DIGEST_SHA256");
        PadesEngine.SignaturePolicy signaturePolicy = SignaturePolicyLoader.load(
                policyFile, policyOid, policyUri, expectedPolicyFileHash, expectedPolicyDigest);
        IcpBrasilTimestampAuthority.Configuration timestampAuthority =
                IcpBrasilTimestampAuthority.fromEnvironment(System.getenv());
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "3500"));
        CommonTrustedCertificateSource trust = loadTrustStore(trustDirectory, trustedRoots.stream().map(String::trim).toList());
        PadesEngine engine = new PadesEngine(trust, Clock.systemUTC(), signaturePolicy, true,
                timestampAuthority.source(), timestampAuthority.enabled());
        ProviderServer app = new ProviderServer(new InetSocketAddress("0.0.0.0", port), engine, apiKey);
        Runtime.getRuntime().addShutdownHook(new Thread(app::stop));
        app.start();
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalArgumentException(name + " is required");
        return value.trim();
    }
}
