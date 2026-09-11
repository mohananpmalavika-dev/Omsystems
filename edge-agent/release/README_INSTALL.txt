========================================================================
  KryptoVision (OmSystems) Edge Agent - Windows Quick Deployment Guide
========================================================================

If Windows Defender or SmartScreen shows a warning or blocks the executable:

STEP 1: TRUST THE CODE SIGNING CERTIFICATE (1-Click)
---------------------------------------------------
1. Right-click "Install-Certificate.bat" and select "Run as Administrator".
2. Click "Yes" on the UAC prompt.
3. This installs the OmSystems Edge Agent code signing certificate into the
   Windows "Trusted Root Certification Authorities" and "Trusted Publishers" stores.
4. Windows will now recognize the executable as a verified application from OmSystems.

STEP 2: ADD DEFENDER EXCLUSION (Optional / Recommended)
------------------------------------------------------
1. Right-click "Allow-In-Defender.bat" and select "Run as Administrator".
2. This whitelists edge-agent.exe in Microsoft Defender Antivirus so it can
   freely scan ONVIF / RTSP camera subnets without heuristic interference.

STEP 3: RUN THE EDGE AGENT
--------------------------
Double-click "edge-agent.exe" or "START_SCANNER.bat".
The agent will automatically register with KryptoVision cloud and begin streaming.

========================================================================
Digital Signature Verification:
- Publisher: OmSystems Sentinel Edge Agent (Om Systems)
- Hash Algorithm: SHA256 with Authenticode
========================================================================
