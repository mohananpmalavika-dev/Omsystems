; KryptonVision Edge Agent - native Windows installer
; This installer uses no command-script host. Inno Setup performs
; elevation, configuration, upgrade cleanup, task registration, and firewall setup.

[Setup]
AppName=KryptonVision Edge Agent
AppVersion=0.1.29
AppPublisher=KryptonVision
AppPublisherURL=https://sentinel-grid.com
AppSupportURL=https://sentinel-grid.com/support
DefaultDirName={autopf}\Sentinel Grid\Edge Agent
DefaultGroupName=KryptonVision
OutputDir=output
OutputBaseFilename=KryptonVisionInstaller-v0.1.29-windows
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
DisableProgramGroupPage=yes
DisableWelcomePage=no
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Package the same executable that the release manifest verifies and signs.
Source: "..\..\release\edge-agent.exe"; DestDir: "{app}"; DestName: "edge-agent.exe"; Flags: ignoreversion restartreplace uninsrestartdelete
Source: "..\..\release\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "..\..\models\secure-face\*"; DestDir: "{app}\models\secure-face"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\vendor\windows\ffmpeg.zip"; DestName: "edge-agent-ffmpeg.zip"; Flags: dontcopy
Source: "..\..\vendor\windows\mediamtx.zip"; DestName: "edge-agent-mediamtx.zip"; Flags: dontcopy
Source: "..\..\vendor\windows\cloudflared.exe"; DestDir: "{app}\vendor"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "..\..\GETTING_STARTED.txt"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
Name: "{app}\data"
Name: "{app}\logs"
Name: "{app}\config"

[Icons]
Name: "{group}\KryptonVision Edge Agent"; Filename: "{app}\edge-agent.exe"
Name: "{group}\Configuration Folder"; Filename: "{app}\config"
Name: "{group}\Logs Folder"; Filename: "{app}\logs"
Name: "{group}\Uninstall KryptonVision"; Filename: "{uninstallexe}"
Name: "{autodesktop}\KryptonVision Edge Agent"; Filename: "{app}\edge-agent.exe"; Tasks: desktopicon

[Code]
function GetTickCount: Cardinal;
  external 'GetTickCount@kernel32.dll stdcall';

const
  TaskName = 'Sentinel Grid Edge Agent';
  LegacyServiceName = 'SentinelGridEdgeAgent';
  FirewallRuleName = 'Sentinel Grid Private Live Video';
  ControlPlaneUrl = 'https://34-14-220-41.sslip.io';
  ActivationInvalidExitCode = 41;
  DeviceAlreadyEnrolledExitCode = 42;

var
  BranchNamePage: TInputQueryWizardPage;
  ActivationPage: TInputQueryWizardPage;
  ExistingInstall: Boolean;
  UsePackageConfiguration: Boolean;
  PackageControlPlaneUrl: String;

function SafeDefaultInstallDir: String;
begin
  Result := ExpandConstant('{autopf}\Sentinel Grid\Edge Agent');
end;

function AppPath: String;
begin
  // Never expand {app} from Pascal code. If setup aborts before Inno has
  // initialized its application directory, even cleanup/error handling may run
  // this helper and turn the original error into a fatal startup exception.
  // The original uninstaller executable lives in the installed application
  // directory; {srcexe} is available from process startup in both modes.
  if IsUninstaller then begin
    Result := ExtractFileDir(ExpandConstant('{srcexe}'));
    Exit;
  end;
  Result := WizardDirValue;
  if Result = '' then
    Result := SafeDefaultInstallDir;
end;

function ConfigPath: String;
begin
  Result := AddBackslash(AppPath) + 'config\edge-agent.env';
end;

function ConfigurationValue(const Filename, Key: String): String;
var
  Lines: TArrayOfString;
  Index: Integer;
  Prefix: String;
begin
  Result := '';
  if not LoadStringsFromFile(Filename, Lines) then Exit;
  Prefix := Key + '=';
  for Index := 0 to GetArrayLength(Lines) - 1 do begin
    if Pos(Prefix, Lines[Index]) = 1 then begin
      Result := Trim(Copy(Lines[Index], Length(Prefix) + 1, MaxInt));
      if (Length(Result) >= 2) and (Result[1] = '"') and (Result[Length(Result)] = '"') then
        Result := Copy(Result, 2, Length(Result) - 2);
      Exit;
    end;
  end;
end;

function HasCompleteDeviceIdentity: Boolean;
var
  DataPath: String;
begin
  DataPath := AddBackslash(AppPath) + 'data\';
  Result := FileExists(DataPath + 'device-identity.enc') and
    FileExists(DataPath + 'device-identity.key');
end;

function HasManagedGatewayCredential: Boolean;
var
  BranchId: String;
  AgentId: String;
  BridgeKey: String;
begin
  // Dashboard-issued installer packages use a branch-scoped agent id plus a
  // protected bridge credential. That is already a durable authentication
  // method; only activation-code packages create a local device identity.
  if not FileExists(ConfigPath) then begin
    Result := False;
    Exit;
  end;
  BranchId := ConfigurationValue(ConfigPath, 'BRANCH_ID');
  AgentId := ConfigurationValue(ConfigPath, 'EDGE_AGENT_ID');
  BridgeKey := ConfigurationValue(ConfigPath, 'EDGE_BRIDGE_SHARED_KEY');
  Result := (BranchId <> '') and (AgentId <> '') and (Length(BridgeKey) >= 32);
end;

function HasPersistentGatewayCredential: Boolean;
begin
  Result := HasCompleteDeviceIdentity or HasManagedGatewayCredential;
end;

function DetectExistingInstall: Boolean;
var
  InstalledDir: String;
  DefaultDir: String;
begin
  Result := False;
  InstalledDir := '';

  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\KryptonVision Edge Agent_is1', 'Inno Setup: App Path', InstalledDir) or
     RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\KryptonVision Edge Agent_is1', 'InstallLocation', InstalledDir) or
     RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\KryptonVision Edge Agent_is1', 'Inno Setup: App Path', InstalledDir) or
     RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\KryptonVision Edge Agent_is1', 'InstallLocation', InstalledDir) then
  begin
    if (InstalledDir <> '') and (FileExists(AddBackslash(InstalledDir) + 'config\edge-agent.env') or FileExists(AddBackslash(InstalledDir) + 'edge-agent.exe')) then begin
      Result := True;
      Exit;
    end;
  end;

  DefaultDir := SafeDefaultInstallDir;
  if FileExists(AddBackslash(DefaultDir) + 'config\edge-agent.env') or FileExists(AddBackslash(DefaultDir) + 'edge-agent.exe') then begin
    Result := True;
    Exit;
  end;
end;

function DotenvPath(const Value: String): String;
begin
  Result := Value;
  StringChange(Result, '\', '/');
end;

function XmlText(const Value: String): String;
begin
  Result := Value;
  StringChange(Result, '&', '&amp;');
  StringChange(Result, '<', '&lt;');
  StringChange(Result, '>', '&gt;');
end;

function HasUnsafeConfigText(const Value: String): Boolean;
begin
  Result := (Pos('"', Value) > 0) or (Pos(#13, Value) > 0) or (Pos(#10, Value) > 0);
end;

function PackageConfigPath: String;
begin
  Result := AddBackslash(ExpandConstant('{src}')) + 'edge-agent.env';
end;

function PackageConfigValue(const Key: String): String;
begin
  Result := ConfigurationValue(PackageConfigPath, Key);
end;

procedure LoadPackageDefaults;
var
  Value: String;
begin
  if not FileExists(PackageConfigPath) then Exit;

  Value := PackageConfigValue('EDGE_AGENT_NAME');
  if (Value <> '') and not HasUnsafeConfigText(Value) then
    BranchNamePage.Values[0] := Value;

  Value := PackageConfigValue('EDGE_ACTIVATION_CODE');
  if (Value <> '') and not HasUnsafeConfigText(Value) then
    ActivationPage.Values[0] := Value;

  Value := PackageConfigValue('CONTROL_PLANE_URL');
  if (Value <> '') and not HasUnsafeConfigText(Value) then
    PackageControlPlaneUrl := Value;
end;

function FindRuntimeExecutable(const Directory, Filename: String): String;
var
  FindRec: TFindRec;
  Candidate: String;
begin
  Result := '';
  if FindFirst(AddBackslash(Directory) + '*', FindRec) then begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then begin
          Candidate := AddBackslash(Directory) + FindRec.Name;
          if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then begin
            Result := FindRuntimeExecutable(Candidate, Filename);
            if Result <> '' then Exit;
          end else if CompareText(FindRec.Name, Filename) = 0 then begin
            Result := Candidate;
            Exit;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

procedure UnpackRuntimeArchive(const ArchiveName, Destination: String);
var
  Shell: Variant;
  Archive: Variant;
  Target: Variant;
begin
  ExtractTemporaryFile(ArchiveName);
  Shell := CreateOleObject('Shell.Application');
  Archive := Shell.NameSpace(ExpandConstant('{tmp}\') + ArchiveName);
  Target := Shell.NameSpace(Destination);
  if VarIsNull(Archive) or VarIsNull(Target) then
    RaiseException('The bundled Windows runtime archive could not be opened.');
  Target.CopyHere(Archive.Items, 16);
end;

procedure UnpackRuntime;
var
  RuntimePath: String;
  Deadline: Cardinal;
begin
  RuntimePath := AddBackslash(AppPath) + 'runtime';
  ForceDirectories(RuntimePath);
  UnpackRuntimeArchive('edge-agent-ffmpeg.zip', RuntimePath);
  UnpackRuntimeArchive('edge-agent-mediamtx.zip', RuntimePath);
  Deadline := GetTickCount + 60000;
  while (FindRuntimeExecutable(RuntimePath, 'ffmpeg.exe') = '') or
        (FindRuntimeExecutable(RuntimePath, 'ffprobe.exe') = '') or
        (FindRuntimeExecutable(RuntimePath, 'mediamtx.exe') = '') do begin
    if GetTickCount > Deadline then
      RaiseException('The bundled camera runtime did not unpack correctly. Download a new signed installer.');
    Sleep(500);
  end;
end;

procedure InitializeWizard;
begin
  ExistingInstall := DetectExistingInstall;
  UsePackageConfiguration := FileExists(PackageConfigPath);
  PackageControlPlaneUrl := ControlPlaneUrl;
  BranchNamePage := CreateInputQueryPage(wpWelcome,
    'Branch Information',
    'Enter your branch details',
    'This name identifies the branch in KryptonVision. Existing installations keep their registered identity.');
  BranchNamePage.Add('Branch Name:', False);
  BranchNamePage.Values[0] := 'Branch Office';

  ActivationPage := CreateInputQueryPage(BranchNamePage.ID,
    'Gateway Activation',
    'Enter the one-time activation code',
    'Create a gateway activation in KryptonVision and paste the code here. It is consumed on first start.');
  ActivationPage.Add('Activation Code:', False);
  if UsePackageConfiguration then begin
    LoadPackageDefaults;
    // A package activation is single-use. If an earlier activation did not
    // create a durable credential, never prefill that same code on retry.
    // Keep the packaged branch/server defaults, but require a fresh code.
    if ExistingInstall and not HasPersistentGatewayCredential then
      ActivationPage.Values[0] := '';
  end;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  // A directory left by a failed enrollment is not an enrolled installation.
  // A dashboard-managed package is durable when its protected branch credential
  // is present, even though it does not create an activation-code identity.
  Result := ((UsePackageConfiguration and not ExistingInstall) or
    (ExistingInstall and HasPersistentGatewayCredential)) and
    ((PageID = BranchNamePage.ID) or (PageID = ActivationPage.ID));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  BranchName: String;
  ActivationCode: String;
begin
  Result := True;
  if (UsePackageConfiguration and not ExistingInstall) or
    (ExistingInstall and HasPersistentGatewayCredential) then Exit;

  if CurPageID = BranchNamePage.ID then begin
    BranchName := Trim(BranchNamePage.Values[0]);
    if (Length(BranchName) < 3) or HasUnsafeConfigText(BranchName) then begin
      MsgBox('Enter a branch name with at least 3 characters. Quotes and line breaks are not allowed.', mbError, MB_OK);
      Result := False;
    end;
  end;

  if CurPageID = ActivationPage.ID then begin
    ActivationCode := Trim(ActivationPage.Values[0]);
    if (Pos('sgact_', ActivationCode) <> 1) or (Length(ActivationCode) < 40) or HasUnsafeConfigText(ActivationCode) then begin
      MsgBox('Enter a valid one-time KryptonVision activation code.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure UpdateConfigSetting(const Key, Value: String);
var
  Lines: TArrayOfString;
  Index: Integer;
  Found: Boolean;
begin
  if not LoadStringsFromFile(ConfigPath, Lines) then
    RaiseException('The existing edge-agent configuration could not be read.');
  Found := False;
  for Index := 0 to GetArrayLength(Lines) - 1 do begin
    if Pos(Key + '=', Lines[Index]) = 1 then begin
      Lines[Index] := Key + '="' + Value + '"';
      Found := True;
      Break;
    end;
  end;
  if not Found then begin
    SetArrayLength(Lines, GetArrayLength(Lines) + 1);
    Lines[GetArrayLength(Lines) - 1] := Key + '="' + Value + '"';
  end;
  if not SaveStringsToFile(ConfigPath, Lines, False) then
    RaiseException('The existing edge-agent configuration could not be updated.');
end;

procedure WriteFreshConfig;
var
  DataPath: String;
  LogPath: String;
  FfmpegPath: String;
  FfprobePath: String;
  MediaMtxPath: String;
  Config: String;
begin
  DataPath := DotenvPath(AddBackslash(AppPath) + 'data');
  LogPath := DotenvPath(AddBackslash(AppPath) + 'logs\edge-agent.log');
  FfmpegPath := FindRuntimeExecutable(AddBackslash(AppPath) + 'runtime', 'ffmpeg.exe');
  FfprobePath := FindRuntimeExecutable(AddBackslash(AppPath) + 'runtime', 'ffprobe.exe');
  MediaMtxPath := FindRuntimeExecutable(AddBackslash(AppPath) + 'runtime', 'mediamtx.exe');
  if (FfmpegPath = '') or (FfprobePath = '') or (MediaMtxPath = '') then
    RaiseException('The installed camera runtime is incomplete. Download a new signed installer.');
  // Only a clean first installation may consume the package activation
  // without operator input. An incomplete existing installation must use the
  // fresh activation entered on the wizard page, never the stale sidecar.
  if UsePackageConfiguration and not ExistingInstall then begin
    if not CopyFile(PackageConfigPath, ConfigPath, False) then
      RaiseException('The branch configuration from the installer package could not be saved.');
    UpdateConfigSetting('EDGE_AGENT_VERSION', '0.1.29');
    UpdateConfigSetting('EDGE_LOG_PATH', LogPath);
    UpdateConfigSetting('FFMPEG_PATH', DotenvPath(FfmpegPath));
    UpdateConfigSetting('FFPROBE_PATH', DotenvPath(FfprobePath));
    UpdateConfigSetting('MEDIAMTX_PATH', DotenvPath(MediaMtxPath));
    UpdateConfigSetting('CLOUDFLARED_PATH', DotenvPath(AddBackslash(AppPath) + 'vendor\cloudflared.exe'));
    Exit;
  end;
  Config :=
    'CONTROL_PLANE_URL="' + PackageControlPlaneUrl + '"' + #13#10 +
    'EDGE_ACTIVATION_CODE="' + Trim(ActivationPage.Values[0]) + '"' + #13#10 +
    'EDGE_AGENT_NAME="' + Trim(BranchNamePage.Values[0]) + '"' + #13#10 +
    'EDGE_AGENT_VERSION="0.1.29"' + #13#10 +
    'EDGE_IDENTITY_PATH="' + DataPath + '/device-identity.enc"' + #13#10 +
    'EDGE_IDENTITY_KEY_PATH="' + DataPath + '/device-identity.key"' + #13#10 +
    'EDGE_OFFLINE_OUTBOX_PATH="' + DataPath + '/offline-outbox.enc"' + #13#10 +
    'EDGE_OFFLINE_OUTBOX_KEY_PATH="' + DataPath + '/offline-outbox.key"' + #13#10 +
    'EDGE_CAMERA_CREDENTIAL_VAULT_PATH="' + DataPath + '/camera-credentials.enc"' + #13#10 +
    'EDGE_CAMERA_CREDENTIAL_VAULT_KEY_PATH="' + DataPath + '/camera-credentials.key"' + #13#10 +
    'EDGE_UPDATE_STAGING_PATH="' + DataPath + '/updates"' + #13#10 +
    'EDGE_LOG_PATH="' + LogPath + '"' + #13#10 +
    'FFMPEG_PATH="' + DotenvPath(FfmpegPath) + '"' + #13#10 +
    'FFPROBE_PATH="' + DotenvPath(FfprobePath) + '"' + #13#10 +
    'MEDIAMTX_PATH="' + DotenvPath(MediaMtxPath) + '"' + #13#10 +
    'LIVE_MEDIA_ENABLED="true"' + #13#10 +
    'EDGE_MANAGED_MEDIA_BOOTSTRAP="true"' + #13#10 +
    'EDGE_LIVE_GATEWAY_HOST="0.0.0.0"' + #13#10 +
    'EDGE_LIVE_GATEWAY_PORT="8090"' + #13#10 +
    'PUBLIC_MEDIA_GATEWAY_URL="auto"' + #13#10 +
    'MEDIA_TUNNEL_MODE="quick"' + #13#10 +
    'CLOUDFLARED_PATH="' + DotenvPath(AddBackslash(AppPath) + 'vendor\cloudflared.exe') + '"' + #13#10 +
    'SECURE_FACE_AI_ENABLED="false"' + #13#10 +
    'SECURE_FACE_MODEL_MANIFEST="./models/secure-face/manifest.json"' + #13#10 +
    'SECURE_FACE_MIN_LIVENESS="0.95"' + #13#10 +
    'SECURE_FACE_MIN_OBSERVATIONS="3"' + #13#10;
  if not SaveStringToFile(ConfigPath, Config, False) then
    RaiseException('Unable to write the edge-agent configuration.');
end;

procedure RunNative(const Filename, Parameters, FailureMessage: String; Required: Boolean);
var
  ResultCode: Integer;
begin
  if not Exec(Filename, Parameters, AppPath, SW_HIDE, ewWaitUntilTerminated, ResultCode) then begin
    if Required then RaiseException(FailureMessage);
    Exit;
  end;
  if Required and (ResultCode <> 0) then
    RaiseException(FailureMessage + ' (exit code ' + IntToStr(ResultCode) + ').');
end;

procedure StopOldAgent;
begin
  RunNative(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "' + TaskName + '"', '', False);
  RunNative(ExpandConstant('{sys}\taskkill.exe'), '/F /IM edge-agent.exe /T', '', False);
  RunNative(ExpandConstant('{sys}\taskkill.exe'), '/F /IM mediamtx.exe /T', '', False);
  RunNative(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ffmpeg.exe /T', '', False);
  RunNative(ExpandConstant('{sys}\taskkill.exe'), '/F /IM cloudflared.exe /T', '', False);
  RunNative(ExpandConstant('{sys}\sc.exe'), 'stop "' + LegacyServiceName + '"', '', False);
  Sleep(1500);
  RunNative(ExpandConstant('{sys}\sc.exe'), 'delete "' + LegacyServiceName + '"', '', False);
  RegDeleteKeyIncludingSubkeys(HKEY_LOCAL_MACHINE, 'SOFTWARE\Classes\sentinel-grid-scanner');
end;

procedure ConfigureFirewall;
var
  ProgramPath: String;
begin
  ProgramPath := AddBackslash(AppPath) + 'edge-agent.exe';
  RunNative(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="' + FirewallRuleName + '"', '', False);
  RunNative(ExpandConstant('{sys}\netsh.exe'),
    'advfirewall firewall add rule name="' + FirewallRuleName + '" dir=in action=allow protocol=TCP localport=8090 program="' + ProgramPath + '" remoteip=LocalSubnet profile=any',
    'Unable to create the local live-video firewall rule', True);
end;

procedure ProtectConfigFile;
begin
  RunNative(ExpandConstant('{sys}\icacls.exe'),
    '"' + ConfigPath + '" /inheritance:r /grant:r "*S-1-5-18:(F)" "*S-1-5-32-544:(F)"',
    'Unable to protect the edge-agent configuration', True);
end;

procedure RegisterAgentTask;
var
  TaskXmlPath: String;
  ProgramPath: String;
  Arguments: String;
  TaskXml: String;
begin
  TaskXmlPath := ExpandConstant('{tmp}\edge-agent-startup-task.xml');
  ProgramPath := AddBackslash(AppPath) + 'edge-agent.exe';
  Arguments := '--run --config "' + ConfigPath + '"';
  TaskXml :=
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">' + #13#10 +
    '  <RegistrationInfo><Description>KryptonVision branch edge agent</Description></RegistrationInfo>' + #13#10 +
    '  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>' + #13#10 +
    '  <Principals><Principal id="System"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>' + #13#10 +
    '  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure></Settings>' + #13#10 +
    '  <Actions Context="System"><Exec><Command>' + XmlText(ProgramPath) + '</Command><Arguments>' + XmlText(Arguments) + '</Arguments><WorkingDirectory>' + XmlText(AppPath) + '</WorkingDirectory></Exec></Actions>' + #13#10 +
    '</Task>' + #13#10;
  if not SaveStringToFile(TaskXmlPath, TaskXml, False) then
    RaiseException('Unable to prepare the Sentinel Grid startup task definition.');
  RunNative(ExpandConstant('{sys}\schtasks.exe'),
    '/Create /TN "' + TaskName + '" /XML "' + TaskXmlPath + '" /F',
    'Unable to register the Sentinel Grid startup task', True);
  DeleteFile(TaskXmlPath);
  RunNative(ExpandConstant('{sys}\schtasks.exe'), '/Run /TN "' + TaskName + '"',
    'Unable to start the Sentinel Grid Edge Agent', True);
end;

function RunNativeResult(const Filename, Parameters: String): Integer;
var
  ResultCode: Integer;
begin
  if not Exec(Filename, Parameters, AppPath, SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    RaiseException('Unable to start the Edge Agent enrollment check.');
  Result := ResultCode;
end;

function ValidateNewEnrollment: Boolean;
var
  ProgramPath: String;
  Arguments: String;
  ResultCode: Integer;
begin
  ProgramPath := AddBackslash(AppPath) + 'edge-agent.exe';
  Arguments := '--config "' + ConfigPath + '" --diagnose';
  ResultCode := RunNativeResult(ProgramPath, Arguments);
  if ResultCode = 0 then begin
    if not HasPersistentGatewayCredential then
      RaiseException('The Edge Agent authenticated but did not retain a durable gateway credential.');
    Result := True;
    Exit;
  end;

  // The control plane can accept activation and then have the first heartbeat
  // fail. The identity is written before that heartbeat, so preserve it and
  // let the startup task retry instead of falsely requiring a Repair package.
  if HasPersistentGatewayCredential then begin
    Log('Initial enrollment completed but the diagnostic heartbeat was unavailable; continuing with automatic retry.');
    Result := False;
    Exit;
  end;

  if ResultCode = ActivationInvalidExitCode then
    RaiseException('The one-time gateway activation is invalid, expired, or already used. Create one fresh activation in Sentinel Grid and run its matching installer package.');
  if ResultCode = DeviceAlreadyEnrolledExitCode then
    RaiseException('This computer is already enrolled with another gateway identity. Use that gateway''s Repair package or remove the previous Edge Agent installation first.');

  // Connectivity and server-side transient errors must not strand a newly
  // installed gateway. Its startup task retains the protected configuration
  // and retries enrollment after the network or control plane recovers.
  Log('Initial enrollment could not reach the control plane (exit code ' + IntToStr(ResultCode) + '); scheduling automatic retry.');
  Result := False;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  HadPersistentGatewayCredential: Boolean;
  EnrollmentConfirmed: Boolean;
begin
  if CurStep = ssInstall then begin
    StopOldAgent;
    Exit;
  end;

  if CurStep <> ssPostInstall then Exit;

  StopOldAgent;
  UnpackRuntime;
  HadPersistentGatewayCredential := HasPersistentGatewayCredential;
  if HadPersistentGatewayCredential and FileExists(ConfigPath) then
    UpdateConfigSetting('EDGE_AGENT_VERSION', '0.1.29')
  else
    WriteFreshConfig;
  ProtectConfigFile;
  EnrollmentConfirmed := HadPersistentGatewayCredential;
  if not HadPersistentGatewayCredential then
    EnrollmentConfirmed := ValidateNewEnrollment;
  ConfigureFirewall;
  RegisterAgentTask;
  if not EnrollmentConfirmed then
    Log('Sentinel Grid Edge Agent is installed and will retry enrollment automatically when the network and control plane are reachable.');
  SaveStringToFile(AddBackslash(AppPath) + 'install-info.txt',
    'Installation Date: ' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', #0, #0) + #13#10 +
    'Installation Path: ' + AppPath + #13#10 +
    'Version: 0.1.29' + #13#10 +
    'Installer: Native Windows', False);
end;

function InitializeUninstall(): Boolean;
begin
  Result := MsgBox('Uninstall KryptonVision Edge Agent?' + #13#10 + #13#10 +
    'The startup task and application files will be removed. Camera credentials and logs are retained.',
    mbConfirmation, MB_YESNO) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then begin
    RunNative(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "' + TaskName + '"', '', False);
    RunNative(ExpandConstant('{sys}\schtasks.exe'), '/Delete /TN "' + TaskName + '" /F', '', False);
    RunNative(ExpandConstant('{sys}\sc.exe'), 'stop "' + LegacyServiceName + '"', '', False);
    RunNative(ExpandConstant('{sys}\sc.exe'), 'delete "' + LegacyServiceName + '"', '', False);
    RunNative(ExpandConstant('{sys}\netsh.exe'), 'advfirewall firewall delete rule name="' + FirewallRuleName + '"', '', False);
    RegDeleteKeyIncludingSubkeys(HKEY_LOCAL_MACHINE, 'SOFTWARE\Classes\sentinel-grid-scanner');
  end;
end;
