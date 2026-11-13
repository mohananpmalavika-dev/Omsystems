# 🚀 Oracle Cloud Infrastructure (OCI) Deployment Guide
## KryptonLogic Enterprise Vision AI & VMS (OM Systems & Services)

ഈ ഗൈഡ് ഉപയോഗിച്ച് **KryptonLogic / OM Systems VMS** പ്ലാറ്റ്‌ഫോം ഒറാക്കിൾ ക്ലൗഡിൽ (Oracle Cloud - OCI) എളുപ്പത്തിൽ ലൈവായി പബ്ലിഷ് ചെയ്യാം. 
ഒറാക്കിൾ ക്ലൗഡിന്റെ **Always Free Tier (Ampere A1 - 4 OCPU, 24 GB RAM)** അല്ലെങ്കിൽ ഏതെങ്കിലും പെയ്ഡ് VM ഇൻസ്റ്റൻസിൽ ഇത് പൂർണ്ണമായി പ്രവർത്തിക്കും.

---

## 📋 ആകെ 3 ഘട്ടങ്ങൾ (Quick Summary)

1. **Step 1: OCI-യിൽ ഒരു VM ക്രിയേറ്റ് ചെയ്യുക (Ubuntu 22.04 അല്ലെങ്കിൽ 24.04 LTS)**
2. **Step 2: VCN Security List-ൽ Ports ഓപ്പൺ ചെയ്യുക (Ingress Rules)**
3. **Step 3: ഒറ്റ കമാൻഡിൽ ഓട്ടോമേറ്റഡ് സെറ്റപ്പ് റൺ ചെയ്യുക**

---

## 🛠️ Step 1: Create Compute Instance in Oracle Cloud Console

1. [Oracle Cloud Console](https://cloud.oracle.com/) ലോഗിൻ ചെയ്യുക.
2. Menu ➔ **Compute** ➔ **Instances** ➔ **Create Instance** ക്ലിക്ക് ചെയ്യുക.
3. പേര് നൽകുക: `kryptovision-server`
4. **Image and Shape:**
   - **Image:** `Canonical Ubuntu 22.04 Minimal` അല്ലെങ്കിൽ `Ubuntu 24.04`
   - **Shape:** 
     - *Always Free:* `VM.Standard.A1.Flex` (4 OCPU, 24 GB RAM - ഏറ്റവും അനുയോജ്യം)
     - *അല്ലെങ്കിൽ:* `VM.Standard.E4.Flex` / `VM.Standard.E2.1.Micro`
5. **Networking:**
   - Create new Virtual Cloud Network (VCN) അല്ലെങ്കിൽ നിലവിലുള്ള VCN തിരഞ്ഞെടുക്കുക.
   - **Assign a public IPv4 address:** തിരഞ്ഞെടുക്കുക (Check "Yes").
6. **Add SSH Keys:**
   - "Generate SSH key pair" ക്ലിക്ക് ചെയ്ത് **Save Private Key** ഡൗൺലോഡ് ചെയ്യുക (ഉദാ: `ssh-key.key`), അല്ലെങ്കിൽ നിങ്ങളുടെ കയ്യിലുള്ള Public Key പേസ്റ്റ് ചെയ്യുക.
7. **Boot Volume:**
   - മിനിമം **50 GB** അല്ലെങ്കിൽ **100 GB** നൽകുക.
8. **Create** ക്ലിക്ക് ചെയ്യുക. (1-2 മിനിറ്റിനുള്ളിൽ സ്റ്റാറ്റസ് **RUNNING** ആകും).
9. ഇൻസ്റ്റൻസിന്റെ **Public IP Address** കോപ്പി ചെയ്യുക (ഉദാ: `140.238.xxx.xxx`).

---

## 🔓 Step 2: Open Ingress Ports in OCI VCN Security List

ഒറാക്കിൾ ക്ലൗഡിൽ വെബ് ട്രാഫിക്കും ക്യാമറ സ്ട്രീമുകളും വരാൻ VCN Security List-ൽ പോർട്ടുകൾ തുറക്കണം:

1. നിങ്ങളുടെ Instance പേജിൽ **Subnet** ലിങ്കിൽ ക്ലിക്ക് ചെയ്യുക.
2. **Default Security List for vcn-...** ക്ലിക്ക് ചെയ്യുക.
3. **Add Ingress Rules** ക്ലിക്ക് ചെയ്യുക:
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `TCP`
   - **Destination Port Range:** `80,443,8080,8090,8554,8888,10000`
   - **Description:** `KryptonLogic Web, API & Stream Ports`
   - **Add Ingress Rules** ക്ലിക്ക് ചെയ്യുക.
4. വീണ്ടും **Add Ingress Rules** ക്ലിക്ക് ചെയ്യുക (WebRTC UDP-ക്ക് വേണ്ടി):
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `UDP`
   - **Destination Port Range:** `8189`
   - **Description:** `KryptonLogic WebRTC Video Stream`
   - **Add Ingress Rules** ക്ലിക്ക് ചെയ്യുക.

---

## ⚡ Step 3: Run 1-Click Automated Setup

### രീതി 1: നിങ്ങളുടെ കമ്പ്യൂട്ടറിൽ നിന്ന് ഒറ്റ സ്ക്രിപ്റ്റ് റൺ ചെയ്യുക (ഏറ്റവും എളുപ്പം)

Windows PowerShell തുറന്ന് താഴെ കാണുന്ന കമാൻഡ് റൺ ചെയ്യുക:

```powershell
cd c:\Omsystems\Omsystems\deploy\oci
.\deploy-to-oci.ps1
```
സ്ക്രിപ്റ്റ് നിങ്ങളോട് ചോദിക്കുന്നത്:
1. **Public IP:** നിങ്ങളുടെ OCI VM-ന്റെ Public IP നൽകുക.
2. **Key Path:** ഡൗൺലോഡ് ചെയ്ത SSH Private Key ഫയലിന്റെ പാത്ത് നൽകുക.
3. **Domain:** നിങ്ങളുടെ ഡൊമെയ്ൻ (ഉദാ: `cctv.omsystemandservice.in`), അല്ലെങ്കിൽ വെറുതെ Enter അടിച്ചാൽ ഓട്ടോമാറ്റിക് ആയി സൗജന്യ Let's Encrypt SSL-ഓടെ `https://<IP>.sslip.io` ആയി ലൈവാകും!

---

### രീതി 2: OCI VM-ൽ നേരിട്ട് SSH വഴി കയറി റൺ ചെയ്യുക

നിങ്ങളുടെ ടെർമിനലിൽ നിന്ന് OCI VM-ലേക്ക് SSH ചെയ്യുക:

```bash
ssh -i /path/to/your-ssh-key.key ubuntu@<YOUR-OCI-PUBLIC-IP>
```

തുടർന്ന് താഴെ കാണുന്ന **ഒരൊറ്റ കമാൻഡ്** പേസ്റ്റ് ചെയ്ത് റൺ ചെയ്യുക:

```bash
curl -fsSL https://raw.githubusercontent.com/mohananpmalavika-dev/Omsystems/main/deploy/oci/setup-oci-vm.sh | sudo bash
```

*(ഒരു കസ്റ്റം ഡൊമെയ്ൻ ഉണ്ടെങ്കിൽ, ഉദാഹരണത്തിന് `cctv.omsystemandservice.in` ആണെങ്കിൽ:)*
```bash
curl -fsSL https://raw.githubusercontent.com/mohananpmalavika-dev/Omsystems/main/deploy/oci/setup-oci-vm.sh | sudo bash -s "cctv.omsystemandservice.in"
```

---

## 🌐 സെറ്റപ്പ് പൂർത്തിയാകുമ്പോൾ ലഭ്യമാകുന്ന ഫീച്ചറുകൾ

- ✅ **Automatic HTTPS/SSL:** Caddy റിവേഴ്സ് പ്രോക്സി വഴി വാലിഡ് ആയ SSL സർട്ടിഫിക്കറ്റ് തനിയെ ഇൻസ്റ്റാൾ ആകുന്നു.
- ✅ **PostgreSQL 16 + pgvector:** എല്ലാ AI റൂളുകളും വാച്ച്‌ലിസ്റ്റ് വെക്റ്ററുകളും ഡാറ്റാബേസിലേക്ക് മൈഗ്രേറ്റ് ചെയ്യപ്പെടുന്നു.
- ✅ **Redis 7 Event Bus:** റിയൽ-ടൈം അലേർട്ടുകൾക്കും സോക്കറ്റുകൾക്കും വേണ്ടി പ്രവർത്തിക്കുന്നു.
- ✅ **Next.js Dashboard:** ലൈവ് കൺട്രോൾ റൂം, എഐ റൂളുകൾ, MIS ഗ്രാഫുകൾ എന്നിവ അടങ്ങിയ ഫ്രണ്ട്-എൻഡ്.
- ✅ **Media Gateway & WebRTC:** റിയൽ-ടൈം sub-250ms ക്യാമറ സ്ട്രീമിംഗ്.
- ✅ **Host Firewall Fixed:** ഒറാക്കിൾ ക്ലൗഡിലെ ലോക്കൽ `iptables` തനിയെ കോൺഫിഗർ ചെയ്ത് പെർസിസ്റ്റന്റ് ആക്കുന്നു.

### 🔑 ലൈവ് ലോഗിൻ വിവരങ്ങൾ:
- **URL:** `https://<YOUR-IP>.sslip.io` അല്ലെങ്കിൽ നിങ്ങളുടെ ഡൊമെയ്ൻ
- **Username:** `krypton`
- **Password:** `4344@RAM`
