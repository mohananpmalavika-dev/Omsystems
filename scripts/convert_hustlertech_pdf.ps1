$ppt = New-Object -ComObject PowerPoint.Application
try {
    $inPath = (Resolve-Path ".\HustlerTech_Sales_Presentation.pptx").Path
    $pdf1 = "C:\Omsystems\Omsystems\HustlerTech_Sales_Presentation.pdf"
    $pdf2 = "C:\Users\Dhanya\.gemini\antigravity-ide\brain\3cbcca46-8051-409e-a74c-89974f0e5bc3\HustlerTech_Sales_Presentation.pdf"
    
    $pres = $ppt.Presentations.Open($inPath, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $pres.SaveAs($pdf1, 32)
    $pres.SaveAs($pdf2, 32)
    $pres.Close()
    Write-Host "HustlerTech PDFs saved successfully!"
} finally {
    $ppt.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
Get-Item "C:\Omsystems\Omsystems\HustlerTech_Sales_Presentation.pdf" | Select-Object Name, Length, LastWriteTime
