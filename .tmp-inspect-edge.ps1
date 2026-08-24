$ErrorActionPreference = "SilentlyContinue"

"=== EDGE PROCESS ==="
Get-Process -Name "edge-agent" | Select-Object Id, StartTime, Path | Format-List

"=== SCHEDULED TASK ==="
Get-ScheduledTask -TaskName "Sentinel Grid Edge Agent" | Select-Object TaskName, State | Format-List

"=== INSTALLER POWERSHELL WINDOWS ==="
Get-Process -Name "powershell" |
    Sort-Object StartTime -Descending |
    Select-Object -First 12 Id, StartTime, MainWindowTitle, Path |
    Format-Table -AutoSize

"=== RECENT PROCESS TREE ==="
$cutoff = (Get-Date).AddMinutes(-10)
Get-CimInstance Win32_Process |
    Where-Object {
        try { [Management.ManagementDateTimeConverter]::ToDateTime($_.CreationDate) -ge $cutoff } catch { $false }
    } |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath |
    Sort-Object ProcessId |
    Format-Table -AutoSize

"=== RECENT PROCESS ACTIVITY ==="
Get-Process |
    Where-Object { $_.StartTime -ge (Get-Date).AddMinutes(-12) } |
    Select-Object Id, ProcessName, StartTime, CPU, WorkingSet64, MainWindowTitle |
    Sort-Object StartTime |
    Format-Table -AutoSize

"=== INSTALLER PROCESS DETAILS ==="
Get-CimInstance Win32_Process |
    Where-Object { $_.ProcessId -in @(59724, 22204, 24652) } |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine |
    Format-List

"=== INSTALLER WINDOW HANDLES ==="
Get-Process -Id 59724, 22204, 24652 -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, MainWindowHandle, MainWindowTitle, Responding |
    Format-List

"=== INSTALLER THREAD STATES ==="
Get-Process -Id 24652 -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Threads } |
    Select-Object Id, ThreadState, WaitReason |
    Format-Table -AutoSize

"=== LOG TAIL ==="
Get-Content -LiteralPath "C:\Program Files\Sentinel Grid\Edge Agent\logs\edge-agent.log" -Tail 80

"=== RECENT INSTALL FILES ==="
Get-ChildItem -LiteralPath "C:\Program Files\Sentinel Grid\Edge Agent" -Recurse -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 20 FullName, Length, LastWriteTime |
    Format-Table -AutoSize


"=== KEY TIMESTAMPS ==="
@(
    "C:\Program Files\Sentinel Grid\Edge Agent\edge-agent.exe",
    "C:\Program Files\Sentinel Grid\Edge Agent\config\edge-agent.env",
    "C:\Program Files\Sentinel Grid\Edge Agent\data\device-identity.enc",
    "C:\Program Files\Sentinel Grid\Edge Agent\data\device-identity.key",
    "C:\Program Files\Sentinel Grid\Edge Agent\data\edge-agent.lock"
) | ForEach-Object { Get-Item -LiteralPath $_ } |
    Select-Object FullName, Length, CreationTime, LastWriteTime |
    Format-List

"=== IDENTITY ARCHIVES ==="
Get-ChildItem -LiteralPath "C:\Program Files\Sentinel Grid\Edge Agent\data\identity-archive" -Directory |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 8 FullName, CreationTime, LastWriteTime |
    Format-List
