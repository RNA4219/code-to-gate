import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const lockPath = path.join(root, "security", "toolchain-lock.json");
const packagePath = path.join(root, "package.json");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

assert(lock.schema === "ctg/security-toolchain-lock/v1", "Unexpected security toolchain lock schema");

const semgrep = lock.tools?.semgrep;
assert(semgrep?.version === "1.164.0", "Semgrep must remain pinned to 1.164.0");
assert(/^sha256:[0-9a-f]{64}$/.test(semgrep.digest), "Semgrep digest must be a SHA-256 OCI digest");
assert(
  semgrep.image === `semgrep/semgrep@${semgrep.digest}`,
  "Semgrep image must be referenced by the locked digest"
);
assert(
  semgrep.source === `https://hub.docker.com/v2/repositories/semgrep/semgrep/tags/${semgrep.version}`,
  "Semgrep source must be the official Docker Hub tag endpoint"
);
assert(semgrep.platform === "linux/amd64", "Semgrep CI platform must be explicit");

const gitleaks = lock.tools?.gitleaks;
assert(gitleaks?.version === "8.30.1", "Gitleaks must remain pinned to 8.30.1");
assert(
  gitleaks.archive?.url ===
    `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks.version}/gitleaks_${gitleaks.version}_linux_x64.tar.gz`,
  "Gitleaks archive must come from the official versioned GitHub release"
);
assert(/^[0-9a-f]{64}$/.test(gitleaks.archive.sha256), "Gitleaks archive hash must be SHA-256");
assert(
  gitleaks.checksums?.url ===
    `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaks.version}/gitleaks_${gitleaks.version}_checksums.txt`,
  "Gitleaks checksum file must come from the official versioned GitHub release"
);
assert(/^[0-9a-f]{64}$/.test(gitleaks.checksums.sha256), "Gitleaks checksum-file hash must be SHA-256");

const npm = lock.tools?.npm;
assert(packageJson.packageManager === `npm@${npm?.version}`, "Locked npm version must match packageManager");
assert(npm.auditLevel === "high", "npm audit must block high and critical vulnerabilities");
assert(npm.sbomFormat === "cyclonedx", "SBOM format must remain CycloneDX");

process.stdout.write(
  JSON.stringify({
    schema: lock.schema,
    semgrep: { version: semgrep.version, digest: semgrep.digest },
    gitleaks: { version: gitleaks.version, sha256: gitleaks.archive.sha256 },
    npm,
  }) + "\n"
);
