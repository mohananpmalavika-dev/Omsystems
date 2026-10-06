Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Select-Object ProcessId, CommandLine | Out-File -FilePath scratch/node_procs.txt -Encoding utf8
