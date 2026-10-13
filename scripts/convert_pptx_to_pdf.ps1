$ppt = New-Object -ComObject PowerPoint.Application
try {
    $inPath = (Resolve-Path ".\KryptonVision_Demo_Presentation.pptx").Path
    $pres = $ppt.Presentations.Open($inPath, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $pdf1 = "C:\Omsystems\Omsystems\KryptonVision_Client_Sales_Presentation.pdf"
    $pdf2 = "C:\Omsystems\Omsystems\KryptonVision_Demo_Presentation.pdf"
    $pdf3 = "C:\Users\Dhanya\.gemini\antigravity-ide\brain\3cbcca46-8051-409e-a74c-89974f0e5bc3\KryptonVision_Client_Sales_Presentation.pdf"
    
    $pres.SaveAs($pdf1, 32)
    $pres.SaveAs($pdf2, 32)
    $pres.SaveAs($pdf3, 32)
    $pres.Close()
    Write-Host "PDFs saved successfully!"
} finally {
    $ppt.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
Get-Item "C:\Omsystems\Omsystems\KryptonVision_Client_Sales_Presentation.pdf" | Select-Object Name, Length, LastWriteTime
