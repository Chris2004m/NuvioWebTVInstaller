const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const userDataPath = path.join(os.tmpdir(), `nuvio-installer-test-${process.pid}`);
const electronStub = {
  app: {
    getPath(name) {
      return name === "userData" ? userDataPath : os.tmpdir();
    },
    on() {},
    quit() {},
    setAppUserModelId() {},
    setName() {},
    whenReady() {
      return { then() {} };
    }
  },
  BrowserWindow: class BrowserWindow {
    static getAllWindows() {
      return [];
    }
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle() {} },
  shell: { openExternal: async () => {} }
};

const originalLoad = Module._load;
process.env.NUVIO_INSTALLER_TEST = "1";
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === "electron") {
    return electronStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};
const certificateStore = require("../src/main.js");
Module._load = originalLoad;

test.after(async () => {
  delete process.env.NUVIO_INSTALLER_TEST;
  await fs.rm(userDataPath, { recursive: true, force: true });
});

test("recognizes Samsung 118 certificate rejection variants", () => {
  assert.equal(certificateStore.isSamsungCertificateRejection("install failed[118]"), true);
  assert.equal(certificateStore.isSamsungCertificateRejection("install failed [118, -12]"), true);
  assert.equal(certificateStore.isSamsungCertificateRejection("Invalid certificate chain with certificate in signature"), true);
  assert.equal(certificateStore.isSamsungCertificateRejection("download failed[205]"), false);
});

test("finds legacy IP profiles by DUID and promotes the canonical identity", async () => {
  const directory = path.join(userDataPath, "samsung-certificates");
  const duid = "test-tv-duid";
  const currentIdentity = {
    authorCert: "current-author",
    distributorCert: "current-distributor",
    password: "password",
    duid,
    createdAt: "2026-07-01T00:00:00.000Z"
  };
  const previousIdentity = {
    authorCert: "previous-author",
    distributorCert: "previous-distributor",
    password: "password",
    duid,
    createdAt: "2026-07-05T00:00:00.000Z"
  };

  await certificateStore.writeSamsungCertificateConfigFile(path.join(directory, "192.168.0.6.json"), currentIdentity);
  await certificateStore.writeSamsungCertificateConfigFile(path.join(directory, "192.168.0.22.json"), previousIdentity);
  await certificateStore.writeSamsungCertificateConfigFile(path.join(directory, "duplicate.json"), previousIdentity);
  await certificateStore.writeSamsungCertificateConfigFile(path.join(directory, "other-tv.json"), {
    ...previousIdentity,
    authorCert: "other-author",
    duid: "other-tv"
  });

  const legacyCandidates = await certificateStore.readSamsungCertificateCandidates(duid, "192.168.0.6");
  assert.deepEqual(
    legacyCandidates.map(({ certificateConfig }) => certificateConfig.authorCert),
    ["current-author", "previous-author"]
  );

  const canonicalPath = certificateStore.getSamsungCertificateDuidConfigPath(duid);
  await certificateStore.writeSamsungCertificateConfigFile(canonicalPath, previousIdentity);
  const canonicalCandidates = await certificateStore.readSamsungCertificateCandidates(duid, "192.168.0.6");
  assert.deepEqual(
    canonicalCandidates.map(({ certificateConfig }) => certificateConfig.authorCert),
    ["previous-author", "current-author"]
  );

  if (process.platform !== "win32") {
    const mode = (await fs.stat(canonicalPath)).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});
