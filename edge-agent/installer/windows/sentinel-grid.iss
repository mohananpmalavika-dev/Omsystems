; KryptonVision Edge Agent - native Windows installer
; This installer uses no command-script host. Inno Setup performs
; elevation, configuration, upgrade cleanup, task registration, and firewall setup.

[Setup]
AppName=KryptonVision Edge Agent
AppVersion=0.1.21
AppPublisher=KryptonVision
AppPublisherURL=https://sentinel-grid.com
AppSupportURL=https://sentinel-grid.com/support
DefaultDirName={autopf}\Sentinel Grid\Edge Agent
DefaultGroupName=KryptonVision
OutputDir=output
OutputBaseFilename=KryptonVisionInstaller-v0.1.21-windows
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
; The v0.1.21 storage telemetry hotfix is built separately while the currently
; installed agent may still hold edge-agent.exe open during an upgrade.
Source: "..\..\release\edge-agent-v0.1.21-storagefix.exe"; DestDir: "{app}"; DestName: "edge-agent.exe"; Flags: ignoreversion
Source: "..\..\release\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
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
  ControlPlaneUrl = 'https://sentinel-grid-control-plane-zcli.onrender.com';

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
  // WizardDirValue is safe before the destination-directory setup finishes.
  // It also lets upgrade detection run before the wizard starts.
  Result := WizardDirValue;
  if Result = '' then
    Result := SafeDefaultInstallDir;
end;

function ConfigPath: String;
begin
  Result := AddBackslash(AppPath) + 'config\edge-agent.env';
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

function HasUnsafeConfigText(const Value: String): Boolean;
begin
  Result := (Pos('"', Value) > 0) or (Pos(#13, Value) > 0) or (Pos(#10, Value) > 0);
end;

function PackageConfigPath: String;
begin
  Result := AddBackslash(ExpandConstant('{src}')) + 'edge-agent.env';
end;

function PackageConfigValue(const Key: String): String;
var
  Lines: TArrayOfString;
  Index: Integer;
  Prefix: String;
begin
  Result := '';
  if not LoadStringsFromFile(PackageConfigPath, Lines) then Exit;
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
  if UsePackageConfiguration then
    LoadPackageDefaults;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (ExistingInstall or UsePackageConfiguration) and ((PageID = BranchNamePage.ID) or (PageID = ActivationPage.ID));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  BranchName: String;
  ActivationCode: String;
begin
  Result := True;
  if ExistingInstall or UsePackageConfiguration then Exit;

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
  if UsePackageConfiguration then begin
    if not CopyFile(PackageConfigPath, ConfigPath, False) then
      RaiseException('The branch configuration from the installer package could not be saved.');
    UpdateConfigSetting('EDGE_AGENT_VERSION', '0.1.21');
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
    'EDGE_AGENT_VERSION="0.1.21"' + #13#10 +
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
  RunNative(ExpandConstant('{sys}\sc.exe'), 'stop "' + LegacyServiceName + '"', '', False);
  Sleep(1500);
  RunNative(ExpandConstant('{sys}\sc.exe'), 'delete "' + LegacyServiceName + '"', '', False);
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
  Command: String;
begin
  Command := '"' + AddBackslash(AppPath) + 'edge-agent.exe" --run --config "' + ConfigPath + '"';
  RunNative(ExpandConstant('{sys}\schtasks.exe'),
    '/Create /TN "' + TaskName + '" /TR "' + Command + '" /SC ONSTART /RU SYSTEM /RL HIGHEST /F',
    'Unable to register the Sentinel Grid startup task', True);
  RunNative(ExpandConstant('{sys}\schtasks.exe'), '/Run /TN "' + TaskName + '"',
    'Unable to start the Sentinel Grid Edge Agent', True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then Exit;

  StopOldAgent;
  UnpackRuntime;
  if ExistingInstall or FileExists(ConfigPath) then
    UpdateConfigSetting('EDGE_AGENT_VERSION', '0.1.21')
  else
    WriteFreshConfig;
  ProtectConfigFile;
  ConfigureFirewall;
  RegisterAgentTask;
  SaveStringToFile(AddBackslash(AppPath) + 'install-info.txt',
    'Installation Date: ' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', #0, #0) + #13#10 +
    'Installation Path: ' + AppPath + #13#10 +
    'Version: 0.1.21' + #13#10 +
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
  end;
end;
