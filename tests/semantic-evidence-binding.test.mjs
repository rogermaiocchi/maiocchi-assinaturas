import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("..", import.meta.url));
const validator = join(repoDir, "scripts", "validate-sso-candidate-images.sh");
const recipeRevision = "0123456789abcdef0123456789abcdef01234567";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value));
}

function defaultKernelIgnores() {
  return [
    ["kernel-headers", "rpm", "kernel"],
    ["linux(-.*)?-headers-.*", "deb", "linux.*"],
    ["linux-libc-dev", "deb", "linux"],
    ["linux-kbuild-.*", "deb", "linux.*"],
  ].map(([name, type, upstreamName]) => ({
    vulnerability: "",
    "include-aliases": false,
    reason: "",
    namespace: "",
    "fix-state": "",
    package: {
      name,
      version: "",
      language: "",
      type,
      location: "",
      "upstream-name": upstreamName,
    },
    "vex-status": "",
    "vex-justification": "",
    "match-type": "exact-indirect-match",
  }));
}

function vexDescriptorIgnores() {
  return ["not_affected", "fixed"].map((vexStatus) => ({
    vulnerability: "",
    "include-aliases": false,
    reason: "",
    namespace: "",
    "fix-state": "",
    package: {
      name: "",
      version: "",
      language: "",
      type: "",
      location: "",
      "upstream-name": "",
    },
    "vex-status": vexStatus,
    "vex-justification": "",
    "match-type": "",
  }));
}

function scannerConfiguration() {
  return {
    output: ["json"],
    file: "",
    pretty: false,
    distro: "",
    "add-cpes-if-none": false,
    "output-template-file": "",
    "check-for-app-update": false,
    "only-fixed": false,
    "only-notfixed": false,
    "ignore-wontfix": "",
    platform: "",
    search: {
      scope: "squashed",
      "unindexed-archives": false,
      "indexed-archives": true,
    },
    ignore: defaultKernelIgnores(),
    exclude: [],
    externalSources: {
      enable: false,
      maven: {
        searchUpstreamBySha1: true,
        baseUrl: "https://search.maven.org/solrsearch/select",
        rateLimit: 300_000_000,
      },
    },
    match: {
      java: { "using-cpes": false },
      jvm: { "using-cpes": true },
      dotnet: { "using-cpes": false },
      golang: {
        "using-cpes": false,
        "always-use-cpe-for-stdlib": false,
        "allow-main-module-pseudo-version-comparison": false,
      },
      javascript: { "using-cpes": false },
      python: { "using-cpes": false },
      ruby: { "using-cpes": false },
      rust: { "using-cpes": false },
      hex: { "using-cpes": false },
      stock: { "using-cpes": true },
      dpkg: {
        "using-cpes": false,
        "missing-epoch-strategy": "zero",
        "use-cpes-for-eol": false,
      },
      rpm: {
        "using-cpes": false,
        "missing-epoch-strategy": "auto",
        "use-cpes-for-eol": false,
      },
    },
    "fail-on-severity": "",
    registry: {
      "insecure-skip-tls-verify": false,
      "insecure-use-http": false,
      "ca-cert": "",
    },
    from: ["docker"],
    "show-suppressed": false,
    "by-cve": false,
    SortBy: { "sort-by": "risk" },
    name: "",
    "default-image-pull-source": "",
    "match-upstream-kernel-headers": false,
    "fix-channel": { "redhat-eus": { apply: "auto", versions: ">= 8.0" } },
    timestamp: true,
    alerts: { "enable-eol-distro-warnings": true },
    db: {
      "cache-dir": "/tmp/grype/db",
      "update-url": "https://grype.anchore.io/databases",
      "ca-cert": "",
      "auto-update": false,
      "validate-by-hash-on-start": true,
      "validate-age": true,
      "max-allowed-built-age": 86_400_000_000_000,
      "require-update-check": false,
      "update-available-timeout": 30_000_000_000,
      "update-download-timeout": 300_000_000_000,
      "max-update-check-frequency": 7_200_000_000_000,
    },
    exp: {},
    dev: { db: { debug: false } },
    "vex-documents": [],
    "vex-add": [],
  };
}

function buildFixture(
  parent,
  marker,
  { includeHighMatches = true, runtimeUser = "1000", tamperConfig = false } = {},
) {
  const fixtureDir = join(parent, marker);
  const archiveRoot = join(fixtureDir, "archive");
  const blobsDir = join(archiveRoot, "blobs", "sha256");
  mkdirSync(blobsDir, { recursive: true });

  const labels = {
    "br.adv.maiocchi.recipe-commit": recipeRevision,
    "org.opencontainers.image.revision": recipeRevision,
    "org.opencontainers.image.version": `fixture-${marker}`,
  };
  const diffId = `sha256:${sha256(`uncompressed-${marker}`)}`;
  const config = {
    architecture: "amd64",
    os: "linux",
    config: {
      Labels: labels,
      Env: [`FIXTURE=${marker}`],
      Entrypoint: ["/bin/sh"],
      Cmd: ["-c", "true"],
      User: runtimeUser,
      WorkingDir: "/app",
    },
    rootfs: { type: "layers", diff_ids: [diffId] },
  };
  const configBytes = Buffer.from(JSON.stringify(config));
  const configDigest = `sha256:${sha256(configBytes)}`;
  const configHex = configDigest.slice("sha256:".length);

  const layerBytes = Buffer.from(`synthetic-layer-${marker}`);
  const layerDigest = `sha256:${sha256(layerBytes)}`;
  const layerHex = layerDigest.slice("sha256:".length);
  writeFileSync(join(blobsDir, layerHex), layerBytes);
  writeFileSync(
    join(blobsDir, configHex),
    tamperConfig ? Buffer.concat([configBytes, Buffer.from("tampered")]) : configBytes,
  );

  const dockerManifest = {
    schemaVersion: 2,
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    config: {
      mediaType: "application/vnd.docker.container.image.v1+json",
      digest: configDigest,
      size: configBytes.length,
    },
    layers: [
      {
        mediaType: "application/vnd.docker.image.rootfs.diff.tar.gzip",
        digest: layerDigest,
        size: layerBytes.length,
      },
    ],
  };
  const manifestBytes = Buffer.from(JSON.stringify(dockerManifest));
  const imageId = `sha256:${sha256(manifestBytes)}`;
  const imageHex = imageId.slice("sha256:".length);
  writeFileSync(join(blobsDir, imageHex), manifestBytes);

  writeJson(join(archiveRoot, "index.json"), {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: [
      {
        mediaType: dockerManifest.mediaType,
        digest: imageId,
        size: manifestBytes.length,
        annotations: { "config.digest": configDigest },
      },
    ],
  });
  writeJson(join(archiveRoot, "manifest.json"), [
    {
      Config: `blobs/sha256/${configHex}`,
      RepoTags: null,
      Layers: [`blobs/sha256/${layerHex}`],
    },
  ]);
  writeJson(join(archiveRoot, "oci-layout"), { imageLayoutVersion: "1.0.0" });
  const archive = join(fixtureDir, "docker-image.tar");
  execFileSync("tar", [
    "-cf",
    archive,
    "-C",
    archiveRoot,
    "blobs",
    "index.json",
    "manifest.json",
    "oci-layout",
  ]);

  const inspect = join(fixtureDir, "image-inspect.json");
  writeJson(inspect, [
    {
      Id: imageId,
      Architecture: "amd64",
      Os: "linux",
      Config: config.config,
      RootFS: { Type: "layers", Layers: [diffId] },
    },
  ]);

  const sbom = join(fixtureDir, "sbom.cdx.json");
  writeJson(sbom, {
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    version: 1,
    metadata: {
      component: {
        type: "container",
        name: "sha256",
        version: imageHex,
      },
      tools: {
        components: [{ type: "application", name: "syft", version: "1.46.0" }],
      },
      properties: [
        {
          name: "syft:image:labels:br.adv.maiocchi.recipe-commit",
          value: recipeRevision,
        },
        {
          name: "syft:image:labels:org.opencontainers.image.revision",
          value: recipeRevision,
        },
      ],
    },
    components: [
      ["tiff", "4.7.2-r0"],
      ["openexr-libiex", "3.4.13-r0"],
      ["openexr-libilmthread", "3.4.13-r0"],
      ["openexr-libopenexr", "3.4.13-r0"],
      ["openexr-libopenexrcore", "3.4.13-r0"],
    ].map(([name, version]) => ({
      type: "library",
      name,
      version,
      purl: `pkg:apk/alpine/${name}@${version}?arch=x86_64&distro=alpine-3.24.1`,
    })),
  });

  const dbStatus = {
    schemaVersion: "v6.1.9",
    from: `https://grype.anchore.io/databases/v6/fixture-${marker}.tar.zst?checksum=sha256%3A${"a".repeat(64)}`,
    built: "2026-07-19T00:00:00Z",
    path: "/tmp/grype/vulnerability.db",
    valid: true,
  };
  const rawMatches = [
    ["CVE-2023-52356", "not_affected"],
    ["CVE-2026-4775", "fixed"],
  ].map(([id, vexStatus]) => ({
    vulnerability: {
      id,
      namespace: "nvd:cpe",
      severity: "High",
    },
    artifact: {
      name: "tiff",
      version: "4.7.2-r0",
      type: "apk",
      purl: "pkg:apk/alpine/tiff@4.7.2-r0?arch=x86_64&distro=alpine-3.24.1",
    },
    appliedIgnoreRules: [
      {
        namespace: "vex",
        "vex-status": vexStatus,
      },
    ],
  }));
  const rawGrype = join(fixtureDir, "grype.raw.json");
  const rawGrypeReport = {
    matches: includeHighMatches
      ? rawMatches.map((match) =>
          Object.fromEntries(
            Object.entries(match).filter(([key]) => key !== "appliedIgnoreRules"),
          ))
      : [],
    source: {
      type: "image",
      target: {
        userInput: imageId,
        imageID: configDigest,
        manifestDigest: imageId,
        mediaType: dockerManifest.mediaType,
        manifest: manifestBytes.toString("base64"),
        config: configBytes.toString("base64"),
        architecture: "amd64",
        os: "linux",
        labels,
      },
    },
    descriptor: {
      name: "grype",
      version: "0.115.0",
      timestamp: "2026-07-19T00:10:00.123456789Z",
      configuration: scannerConfiguration(),
      db: { status: dbStatus, providers: {} },
    },
  };
  writeJson(rawGrype, rawGrypeReport);
  const filteredGrype = join(fixtureDir, "grype.filtered.json");
  const filteredGrypeReport = structuredClone(rawGrypeReport);
  filteredGrypeReport.matches = [];
  filteredGrypeReport.ignoredMatches = structuredClone(rawMatches);
  filteredGrypeReport.descriptor.timestamp = "2026-07-19T00:10:30.987654321Z";
  filteredGrypeReport.descriptor.configuration["vex-documents"] = [
    "/tmp/docuseal-3.0.1-maiocchi.15.openvex.json",
  ];
  filteredGrypeReport.descriptor.configuration.ignore.push(...vexDescriptorIgnores());
  filteredGrypeReport.descriptor.configuration["fail-on-severity"] = "high";
  writeJson(filteredGrype, filteredGrypeReport);

  const openvex = join(fixtureDir, "docuseal-3.0.1-maiocchi.15.openvex.json");
  const vexTimestamp = "2026-07-19T00:09:30Z";
  const tiffPurl = "pkg:apk/alpine/tiff@4.7.2-r0?arch=x86_64&distro=alpine-3.24.1";
  const imagePurl = `pkg:oci/docuseal@${imageId}?repository_url=maiocchi%2Fdocuseal&tag=3.0.1-maiocchi.15`;
  const vexProducts = [
    { "@id": tiffPurl },
    { "@id": imagePurl, subcomponents: [{ "@id": tiffPurl }] },
  ];
  writeJson(openvex, {
    "@context": "https://openvex.dev/ns/v0.2.0",
    "@id": "urn:uuid:123e4567-e89b-42d3-a456-426614174000",
    author: "Maiocchi Advogado",
    role: "Fornecedor do produto",
    version: 1,
    timestamp: vexTimestamp,
    statements: [
      {
        vulnerability: { name: "CVE-2023-52356" },
        products: structuredClone(vexProducts),
        status: "not_affected",
        justification: "vulnerable_code_not_present",
        timestamp: vexTimestamp,
      },
      {
        vulnerability: { name: "CVE-2026-4775" },
        products: structuredClone(vexProducts),
        status: "fixed",
        timestamp: vexTimestamp,
      },
    ],
  });

  const metadata = join(fixtureDir, "scan-metadata.json");
  writeJson(metadata, {
    schema: "maiocchi.scanner-evidence.v1",
    syft: {
      application: "syft",
      binarySha256: "574df1a0862ff88ad933be214e81069e35b17618a13e019f8f1c84fe063222a2",
      version: "1.46.0",
      gitCommit: "b15c5dbfe2bb21c9d73002c1056a829c8c411c75",
      gitDescription: "v1.46.0",
      platform: "linux/amd64",
      releaseArchive: {
        url: "https://github.com/anchore/syft/releases/download/v1.46.0/syft_1.46.0_linux_amd64.tar.gz",
        sha256: "d654f678b709eb53c393d38519d5ed7d2e57205529404018614cfefa0fb2b5ca",
      },
      schemaVersion: "16.1.5",
    },
    grype: {
      application: "grype",
      binarySha256: "05ffd2c28a607e48fb2269d9aac5b3d53e8a51bbac501946644745eae2119907",
      version: "0.115.0",
      gitCommit: "fa8b7e2a528cf1f8b098123f256c61db9e5df69c",
      gitDescription: "v0.115.0",
      platform: "linux/amd64",
      releaseArchive: {
        url: "https://github.com/anchore/grype/releases/download/v0.115.0/grype_0.115.0_linux_amd64.tar.gz",
        sha256: "3fad92940650e514c0aa2dad83526942a055e210cec09a8a59d9c024adc2b90e",
      },
      supportedDbSchema: 6,
      syftVersion: "v1.46.0",
    },
    grypeDb: {
      schemaVersion: dbStatus.schemaVersion,
      from: dbStatus.from,
      built: dbStatus.built,
      sha256: "b".repeat(64),
      valid: dbStatus.valid,
    },
  });

  return { fixtureDir, imageId, configDigest, inspect, archive, sbom, rawGrype, filteredGrype, openvex, metadata };
}

function validate(fixture, overrides = {}, includeFiltered = false, expectedRuntimeUser = "-") {
  const evidence = { ...fixture, ...overrides };
  return spawnSync(
    "sh",
    [
      validator,
      "--validate-semantic-evidence-set",
      "Fixture",
      evidence.imageId,
      evidence.inspect,
      evidence.archive,
      evidence.sbom,
      evidence.rawGrype,
      includeFiltered ? evidence.filteredGrype : "-",
      evidence.metadata,
      recipeRevision,
      expectedRuntimeUser,
    ],
    { cwd: repoDir, encoding: "utf8" },
  );
}

function validateDocusealReports(fixture, overrides = {}) {
  const evidence = { ...fixture, ...overrides };
  return spawnSync(
    "sh",
    [
      validator,
      "--validate-docuseal-report-set",
      evidence.imageId,
      evidence.sbom,
      evidence.openvex,
      evidence.rawGrype,
      evidence.filteredGrype,
    ],
    { cwd: repoDir, encoding: "utf8" },
  );
}

test("evidência semântica liga ID, archive, inspect, SBOM, Grype e config", () => {
  const root = mkdtempSync(join(tmpdir(), "maiocchi-semantic-evidence-"));
  try {
    const candidate = buildFixture(root, "candidate", { includeHighMatches: false });
    const foreign = buildFixture(root, "foreign", { includeHighMatches: false });
    const badConfig = buildFixture(root, "bad-config", {
      includeHighMatches: false,
      tamperConfig: true,
    });
    const docusealRuntime = buildFixture(root, "docuseal-runtime", {
      includeHighMatches: false,
      runtimeUser: "docuseal",
    });
    const rootRuntime = buildFixture(root, "root-runtime", {
      includeHighMatches: false,
      runtimeUser: "root",
    });
    const extraArchive = join(candidate.fixtureDir, "docker-image.extra.tar");
    const extraEntry = join(candidate.fixtureDir, "unreferenced.txt");
    copyFileSync(candidate.archive, extraArchive);
    writeFileSync(extraEntry, "not part of the image");
    execFileSync("tar", ["-rf", extraArchive, "-C", candidate.fixtureDir, "unreferenced.txt"]);
    const badGrypeManifest = join(candidate.fixtureDir, "grype.bad-manifest.json");
    const badGrypeReport = JSON.parse(readFileSync(candidate.rawGrype, "utf8"));
    const embeddedManifest = JSON.parse(
      Buffer.from(badGrypeReport.source.target.manifest, "base64").toString("utf8"),
    );
    embeddedManifest.layers.push(embeddedManifest.layers[0]);
    const badManifestBytes = Buffer.from(JSON.stringify(embeddedManifest));
    badGrypeReport.source.target.manifest = badManifestBytes.toString("base64");
    badGrypeReport.source.target.manifestDigest = `sha256:${sha256(badManifestBytes)}`;
    writeJson(badGrypeManifest, badGrypeReport);

    const recompressedGrypeManifest = join(candidate.fixtureDir, "grype.recompressed-manifest.json");
    const recompressedGrypeReport = JSON.parse(readFileSync(candidate.rawGrype, "utf8"));
    const recompressedManifest = JSON.parse(
      Buffer.from(recompressedGrypeReport.source.target.manifest, "base64").toString("utf8"),
    );
    recompressedManifest.layers = recompressedManifest.layers.map((layer, index) => ({
      ...layer,
      digest: `sha256:${sha256(`recompressed-${index}`)}`,
    }));
    const recompressedManifestBytes = Buffer.from(JSON.stringify(recompressedManifest));
    recompressedGrypeReport.source.target.manifest = recompressedManifestBytes.toString("base64");
    recompressedGrypeReport.source.target.manifestDigest = `sha256:${sha256(recompressedManifestBytes)}`;
    writeJson(recompressedGrypeManifest, recompressedGrypeReport);
    const recompressedResult = validate(candidate, { rawGrype: recompressedGrypeManifest });
    assert.equal(recompressedResult.status, 0, recompressedResult.stderr || recompressedResult.stdout);

    const badLayerSize = join(candidate.fixtureDir, "grype.bad-layer-size.json");
    const badLayerSizeReport = structuredClone(recompressedGrypeReport);
    const badSizeManifest = JSON.parse(
      Buffer.from(badLayerSizeReport.source.target.manifest, "base64").toString("utf8"),
    );
    badSizeManifest.layers[0].size += 1;
    const badSizeManifestBytes = Buffer.from(JSON.stringify(badSizeManifest));
    badLayerSizeReport.source.target.manifest = badSizeManifestBytes.toString("base64");
    badLayerSizeReport.source.target.manifestDigest = `sha256:${sha256(badSizeManifestBytes)}`;
    writeJson(badLayerSize, badLayerSizeReport);

    const highPortal = join(candidate.fixtureDir, "grype.high-portal.json");
    const highPortalReport = JSON.parse(readFileSync(candidate.rawGrype, "utf8"));
    highPortalReport.matches.push({
      vulnerability: {
        id: "CVE-FIXTURE-HIGH",
        namespace: "fixture",
        severity: "High",
      },
      artifact: {
        name: "fixture-package",
        version: "1.0.0",
        type: "apk",
      },
    });
    writeJson(highPortal, highPortalReport);
    const noncanonicalSeverity = join(candidate.fixtureDir, "grype.noncanonical-severity.json");
    const noncanonicalSeverityReport = structuredClone(highPortalReport);
    noncanonicalSeverityReport.matches[0].vulnerability.severity = "High ";
    writeJson(noncanonicalSeverity, noncanonicalSeverityReport);

    const positive = validate(candidate);
    assert.equal(positive.status, 0, positive.stderr || positive.stdout);
    const positiveFiltered = validate(candidate, {}, true);
    assert.equal(positiveFiltered.status, 0, positiveFiltered.stderr || positiveFiltered.stdout);

    const mutateFilteredConfiguration = (name, transform) => {
      const targetPath = join(candidate.fixtureDir, name);
      const value = JSON.parse(readFileSync(candidate.filteredGrype, "utf8"));
      transform(value.descriptor.configuration.ignore);
      writeJson(targetPath, value);
      return targetPath;
    };
    const badFilteredConfigurations = [
      [
        "regra VEX de descriptor ausente",
        mutateFilteredConfiguration("filtered.missing-vex-rule.json", (ignore) => ignore.pop()),
      ],
      [
        "regra VEX de descriptor excedente",
        mutateFilteredConfiguration("filtered.extra-vex-rule.json", (ignore) => {
          ignore.push(structuredClone(ignore[4]));
        }),
      ],
      [
        "status VEX de descriptor divergente",
        mutateFilteredConfiguration("filtered.bad-vex-status.json", (ignore) => {
          ignore[4]["vex-status"] = "under_investigation";
        }),
      ],
    ];
    for (const [description, filteredGrype] of badFilteredConfigurations) {
      const result = validate(candidate, { filteredGrype }, true);
      assert.notEqual(result.status, 0, `${description} deveria ser rejeitado`);
      assert.match(result.stderr, /Fixture:/, `${description}: diagnóstico ausente`);
    }

    const badMatching = join(candidate.fixtureDir, "grype.bad-matching.json");
    const badMatchingReport = JSON.parse(readFileSync(candidate.rawGrype, "utf8"));
    badMatchingReport.descriptor.configuration.match.stock["using-cpes"] = false;
    writeJson(badMatching, badMatchingReport);

    const negativeCases = [
      ["image ID trocado", { imageId: foreign.imageId }],
      ["archive trocado", { archive: foreign.archive }],
      ["archive com entrada não referenciada", { archive: extraArchive }],
      ["inspect trocado", { inspect: foreign.inspect }],
      ["Grype trocado", { rawGrype: foreign.rawGrype }],
      ["política de matching Grype relaxada", { rawGrype: badMatching }],
      ["Portal com vulnerabilidade High", { rawGrype: highPortal }],
      ["Portal com severidade não canônica", { rawGrype: noncanonicalSeverity }],
      ["manifesto embutido no Grype trocado", { rawGrype: badGrypeManifest }],
      ["tamanho de camada Grype adulterado", { rawGrype: badLayerSize }],
      ["config do archive adulterada", { archive: badConfig.archive }],
    ];
    for (const [description, overrides] of negativeCases) {
      const result = validate(candidate, overrides);
      assert.notEqual(result.status, 0, `${description} deveria ser rejeitado`);
      assert.match(result.stderr, /Fixture:/, `${description}: diagnóstico ausente`);
    }

    const runtimePositive = validate(docusealRuntime, {}, false, "docuseal");
    assert.equal(runtimePositive.status, 0, runtimePositive.stderr || runtimePositive.stdout);
    const runtimeNegative = validate(rootRuntime, {}, false, "docuseal");
    assert.notEqual(runtimeNegative.status, 0, "runtime root deveria ser rejeitado");
    assert.match(runtimeNegative.stderr, /usuário runtime/, "diagnóstico de runtime ausente");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture não persiste archive binário no repositório", () => {
  const source = readFileSync(new URL(import.meta.url), "utf8");
  assert.match(source, /mkdtempSync/);
  assert.match(source, /rmSync/);
});

test("conjunto DocuSeal conserva exatamente SBOM, OpenVEX e dois achados TIFF", () => {
  const root = mkdtempSync(join(tmpdir(), "maiocchi-docuseal-report-set-"));
  try {
    const candidate = buildFixture(root, "docuseal");
    const positive = validateDocusealReports(candidate);
    assert.equal(positive.status, 0, positive.stderr || positive.stdout);

    const mutations = [];
    const mutate = (name, sourcePath, transform) => {
      const targetPath = join(candidate.fixtureDir, name);
      const value = JSON.parse(readFileSync(sourcePath, "utf8"));
      transform(value);
      writeJson(targetPath, value);
      return targetPath;
    };
    mutations.push([
      "CVE esperado ausente",
      { rawGrype: mutate("raw.missing-cve.json", candidate.rawGrype, (value) => value.matches.pop()) },
    ]);
    mutations.push([
      "ignored match adulterado",
      {
        filteredGrype: mutate("filtered.bad-ignored.json", candidate.filteredGrype, (value) => {
          value.ignoredMatches[0].artifact.version = "4.7.1-r0";
        }),
      },
    ]);
    mutations.push([
      "UUID OpenVEX não-v4",
      { openvex: mutate("openvex.bad-uuid.json", candidate.openvex, (value) => { value["@id"] = "urn:uuid:123e4567-e89b-12d3-a456-426614174000"; }) },
    ]);
    mutations.push([
      "produto OpenVEX estrangeiro",
      {
        openvex: mutate("openvex.foreign-product.json", candidate.openvex, (value) => {
          value.statements[0].products[1]["@id"] = value.statements[0].products[1]["@id"].replace(candidate.imageId, `sha256:${"f".repeat(64)}`);
        }),
      },
    ]);
    mutations.push([
      "timestamp de statement divergente",
      {
        openvex: mutate("openvex.bad-time.json", candidate.openvex, (value) => {
          value.statements[1].timestamp = "2026-07-19T00:09:31Z";
        }),
      },
    ]);
    mutations.push([
      "relatório filtrado anterior ao bruto",
      {
        filteredGrype: mutate("filtered.bad-time.json", candidate.filteredGrype, (value) => {
          value.descriptor.timestamp = "2026-07-19T00:09:59Z";
        }),
      },
    ]);
    for (const [description, overrides] of mutations) {
      const result = validateDocusealReports(candidate, overrides);
      assert.notEqual(result.status, 0, `${description} deveria ser rejeitado`);
      assert.match(result.stderr, /DocuSeal:/, `${description}: diagnóstico ausente`);
    }

    const badSeverity = mutate("filtered.bad-severity.json", candidate.filteredGrype, (value) => {
      value.descriptor.configuration["fail-on-severity"] = "High";
    });
    const semanticResult = validate(candidate, { filteredGrype: badSeverity }, true);
    assert.notEqual(semanticResult.status, 0, "severidade Grype com caixa divergente deveria ser rejeitada");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
