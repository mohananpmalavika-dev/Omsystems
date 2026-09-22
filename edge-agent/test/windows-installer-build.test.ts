import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Native Windows installer release build", () => {
  it("verifies bundled runtime assets before and after packaging", async () => {
    const packageJson = JSON.parse(await readFile("edge-agent/package.json", "utf8"));
    const script = packageJson.scripts["build:exe"] as string;

    expect(script).toContain("verify:windows-installer-assets");
    expect(script).toContain("verify:windows-package");
  });

  it("requires every asset consumed by the native installer", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-installer-assets.mjs", "utf8");

    for (const asset of [
      "vendor/windows/ffmpeg.zip",
      "vendor/windows/mediamtx.zip",
      "vendor/windows/cloudflared.exe",
      "installer/windows/sentinel-grid.iss",
      "models/secure-face/manifest.json",
      "models/secure-face/detector.onnx",
      "models/secure-face/recognizer.onnx",
      "models/secure-face/liveness.onnx",
    ]) {
      expect(script).toContain(asset);
    }
  });

  it("does not invoke PowerShell for install, upgrade, or uninstall", async () => {
    const installer = await readFile("edge-agent/installer/windows/sentinel-grid.iss", "utf8");

    expect(installer.toLowerCase()).not.toContain("powershell");
    expect(installer).toContain("schtasks.exe");
    expect(installer).toContain("netsh.exe");
    expect(installer).toContain("StopOldAgent");
    expect(installer).toContain("UpdateConfigSetting('EDGE_AGENT_VERSION', '0.1.27')");
  });

  it("does not expand the app folder before Inno Setup initializes it", async () => {
    const installer = await readFile("edge-agent/installer/windows/sentinel-grid.iss", "utf8");

    expect(installer).toContain("Result := WizardDirValue;");
    expect(installer).toContain("Result := ExtractFileDir(ExpandConstant('{srcexe}'));");
    expect(installer).not.toContain("ExpandConstant('{app}')");
    expect(installer).not.toContain("UninstallDisplayIcon={app}");
    expect(installer).toContain("Result := WizardDirValue;");
  });

  it("runs the startup probe after InitializeWizard returns", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-installer-startup.ps1", "utf8");

    expect(script).toContain("function PrepareToInstall(var NeedsRestart: Boolean): String;");
    expect(script).toContain("Installer Pascal code must never expand {app}");
    expect(script).toContain("$code.Replace('ExistingInstall := DetectExistingInstall;', 'ExistingInstall := False;')");
    expect(script).toContain("taskkill.exe");
    expect(script).not.toContain("InitializeAgentWizard;\n  Log('EDGE_INSTALLER_STARTUP_PASSED');");
  });

  it("registers the startup task from XML without nested command-line quoting", async () => {
    const installer = await readFile("edge-agent/installer/windows/sentinel-grid.iss", "utf8");

    expect(installer).toContain("<Command>' + XmlText(ProgramPath) + '</Command>");
    expect(installer).toContain("<Arguments>' + XmlText(Arguments) + '</Arguments>");
    expect(installer).toContain("<WorkingDirectory>' + XmlText(AppPath) + '</WorkingDirectory>");
    expect(installer).toContain("/XML \"' + TaskXmlPath + '\" /F");
    expect(installer).not.toContain('/TR "');
  });

  it("handles activation retries without rejecting dashboard-managed credentials", async () => {
    const installer = (await readFile("edge-agent/installer/windows/sentinel-grid.iss", "utf8")).replace(/\r\n/g, "\n");

    expect(installer).toContain("function HasCompleteDeviceIdentity: Boolean;");
    expect(installer).toContain("function HasManagedGatewayCredential: Boolean;");
    expect(installer).toContain("function HasPersistentGatewayCredential: Boolean;");
    expect(installer).toContain("if ExistingInstall and not HasPersistentGatewayCredential then\n      ActivationPage.Values[0] := '';");
    expect(installer).toContain("UsePackageConfiguration and not ExistingInstall");
    expect(installer).toContain("ExistingInstall and HasPersistentGatewayCredential");
    expect(installer).toContain("HadPersistentGatewayCredential := HasPersistentGatewayCredential;");
    expect(installer).toContain("if HadPersistentGatewayCredential and FileExists(ConfigPath) then");
    expect(installer).toContain("EnrollmentConfirmed := ValidateNewEnrollment;");
    expect(installer).toContain("--diagnose");
    expect(installer).toContain("ActivationInvalidExitCode = 41;");
    expect(installer).toContain("scheduling automatic retry");
    expect(installer).toContain("will retry enrollment automatically");
    expect(installer).not.toContain("Result := (UsePackageConfiguration or (ExistingInstall and HasCompleteDeviceIdentity))");
    expect(installer).not.toContain("if UsePackageConfiguration or (ExistingInstall and HasCompleteDeviceIdentity) then Exit;");
    expect(installer).not.toContain("if ExistingInstall or FileExists(ConfigPath) then");
  });

  it("does not execute a cross-compiled Windows EXE on the Linux control-plane image", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-package.mjs", "utf8");

    expect(script).toContain('process.platform !== "win32"');
    expect(script).toContain("--verify-bundle");
    expect(script).toContain("--version");
    expect(script).toContain("mkdtempSync");
  });

  it("writes a signed-release manifest for production installer verification", async () => {
    const script = await readFile("edge-agent/scripts/build-signed-windows-release.ps1", "utf8");

    expect(script).toContain("windows-release.json");
    expect(script).toContain("signerThumbprint");
    expect(script).toContain("installerSha256");
    expect(script).toContain("installerSourceSha256");
  });

  it("has a container-safe production release verifier", async () => {
    const script = await readFile("edge-agent/scripts/verify-windows-production-release.mjs", "utf8");

    expect(script).toContain("windows-release.json");
    expect(script).toContain("edge-agent.exe");
    expect(script).toContain("sha256");
    expect(script).toContain("installerSourceSha256");
  });

  it("requires the checksum-verified Windows release while building the control-plane image", async () => {
    const dockerfile = await readFile("Dockerfile", "utf8");

    expect(dockerfile).toContain("RUN node edge-agent/scripts/verify-windows-production-release.mjs");
    expect(dockerfile).not.toContain("verify-windows-production-release.mjs || true");
    expect(dockerfile).not.toContain("mkdir -p /app/edge-agent/build /app/edge-agent/release");
  });
});
