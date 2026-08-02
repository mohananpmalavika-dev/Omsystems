; Sentinel Grid Edge Agent - Inno Setup Installer Script
; This creates a one-click installer for branch deployment

[Setup]
AppName=Sentinel Grid Edge Agent
AppVersion=0.1.0
AppPublisher=Sentinel Grid
AppPublisherURL=https://sentinel-grid.com
AppSupportURL=https://sentinel-grid.com/support
DefaultDirName={autopf}\Sentinel Grid\Edge Agent
DefaultGroupName=Sentinel Grid
OutputDir=output
OutputBaseFilename=SentinelGridInstaller-v0.1.0-windows
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern
DisableProgramGroupPage=yes
DisableWelcomePage=no
; SetupIconFile=assets\logo.ico
UninstallDisplayIcon={app}\edge-agent.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startservice"; Description: "Start Sentinel Grid service after installation"; GroupDescription: "Service Configuration:"; Flags: checkedonce

[Files]
; Main executable
Source: "..\..\release\edge-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

; Runtime dependencies
Source: "..\..\release\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

; Vendor dependencies (cloudflared)
Source: "..\..\vendor\windows\cloudflared.exe"; DestDir: "{app}\vendor"; Flags: ignoreversion

; Installation scripts
Source: "scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs

; Documentation
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "..\..\GETTING_STARTED.txt"; DestDir: "{app}"; Flags: ignoreversion; Check: FileExists(ExpandConstant('{app}\..\..\GETTING_STARTED.txt'))

[Dirs]
Name: "{app}\data"
Name: "{app}\logs"
Name: "{app}\config"

[Icons]
Name: "{group}\Sentinel Grid Edge Agent"; Filename: "{app}\edge-agent.exe"
Name: "{group}\Configuration Folder"; Filename: "{app}\config"
Name: "{group}\Logs Folder"; Filename: "{app}\logs"
Name: "{group}\Uninstall Sentinel Grid"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Sentinel Grid Edge Agent"; Filename: "{app}\edge-agent.exe"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\register-branch.ps1"""; Description: "Register with Sentinel Grid Cloud"; Flags: runhidden waituntilterminated; StatusMsg: "Registering branch with cloud..."
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install-service.ps1"""; Description: "Install Windows Service"; Flags: runhidden waituntilterminated; StatusMsg: "Installing Windows service..."; Tasks: startservice

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall-service.ps1"""; Flags: runhidden waituntilterminated

[Code]
var
  BranchNamePage: TInputQueryWizardPage;
  ActivationPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  // Branch Information Page
  BranchNamePage := CreateInputQueryPage(wpWelcome,
    'Branch Information', 
    'Enter your branch details',
    'Please enter a name for this branch location. This will be used to identify this branch in the Sentinel Grid dashboard.');
  BranchNamePage.Add('Branch Name:', False);
  BranchNamePage.Values[0] := 'Branch Office';

  // One-time activation issued by Sentinel Grid.
  ActivationPage := CreateInputQueryPage(BranchNamePage.ID,
    'Gateway Activation',
    'Enter the one-time activation code',
    'Create a gateway activation in Sentinel Grid and paste the code here. It is consumed on first boot.');
  ActivationPage.Add('Activation Code:', False);
  ActivationPage.Values[0] := '';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  
  // Validate branch name
  if CurPageID = BranchNamePage.ID then
  begin
    if Trim(BranchNamePage.Values[0]) = '' then
    begin
      MsgBox('Please enter a branch name.', mbError, MB_OK);
      Result := False;
    end
    else if Length(Trim(BranchNamePage.Values[0])) < 3 then
    begin
      MsgBox('Branch name must be at least 3 characters long.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = ActivationPage.ID then
  begin
    if Pos('sgact_', Trim(ActivationPage.Values[0])) <> 1 then
    begin
      MsgBox('A valid one-time Sentinel Grid activation code is required.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  BranchName: String;
  ActivationCode: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Save installation parameters for registration script
    BranchName := Trim(BranchNamePage.Values[0]);
    ActivationCode := Trim(ActivationPage.Values[0]);
    
    // Save to temporary files for PowerShell scripts to read
    SaveStringToFile(ExpandConstant('{app}\branch-name.txt'), BranchName, False);
    
    SaveStringToFile(ExpandConstant('{app}\activation-code.txt'), ActivationCode, False);
    
    // Save installation info
    SaveStringToFile(ExpandConstant('{app}\install-info.txt'), 
      'Installation Date: ' + GetDateTimeString('yyyy-mm-dd hh:nn:ss', #0, #0) + #13#10 +
      'Branch Name: ' + BranchName + #13#10 +
      'Installation Path: ' + ExpandConstant('{app}') + #13#10 +
      'Version: 0.1.0', 
      False);
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := MsgBox('Are you sure you want to uninstall Sentinel Grid Edge Agent?' + #13#10 + #13#10 + 
                   'This will stop monitoring cameras at this branch location.', 
                   mbConfirmation, MB_YESNO) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    MsgBox('Sentinel Grid Edge Agent has been uninstalled.' + #13#10 + #13#10 +
           'Configuration and log files have been preserved in case you reinstall.', 
           mbInformation, MB_OK);
  end;
end;
