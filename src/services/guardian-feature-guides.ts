/**
 * KryptonAI Comprehensive Multilingual Feature Guides & Localization Knowledge Base
 * Full support for English, Malayalam (മലയാളം), Hindi (हिन्दी), Manglish, and Hinglish.
 */

export type SupportedLanguage = "en" | "ml" | "hi";

export interface FeatureGuideContent {
  titleEn: string;
  titleMl: string;
  titleHi: string;
  path: string;
  directUrl: string;
  guideEn: string;
  guideMl: string;
  guideHi: string;
  suggestionsEn: string[];
  suggestionsMl: string[];
  suggestionsHi: string[];
}

/**
 * Detect language of user query:
 * - 'ml': Malayalam script or Manglish romanized keywords
 * - 'hi': Devanagari Hindi script or Hinglish romanized keywords
 * - 'en': English (default)
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (!text) return "en";
  const lower = text.toLowerCase();

  // 1. Script checks
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";
  if (/[\u0900-\u097F]/.test(text)) return "hi";

  // 2. Manglish vocabulary check (robust root stems)
  const manglishRoots = [
    "enthu", "entha", "enthellam", "enthokke", "enthan", "engane", "evide",
    "enikku", "njan", "ningal", "undo", "undoo", "unduo", "undath", "ullath",
    "aanu", "aano", "cheyy", "varakk", "varak", "kaanam", "kaanik", "nokku",
    "parayu", "paranj", "mukham", "vahana", "veezh", "shabdam", "ithil", "ethokke",
    "ethu"
  ];
  if (manglishRoots.some((root) => lower.includes(root))) return "ml";

  // 3. Hinglish vocabulary check (robust root stems)
  const hinglishRoots = [
    "kya", "kaise", "kaha", "kahan", "kyu", "kyun", "kab", "batao", "bataiye",
    "samjhao", "samjha", "dikhao", "dikhaye", "karo", "kare", "karein", "chahiye",
    "hai", "hain", "madad", "kaun", "humko", "mujhe", "jode", "jodo", "badlo",
    "suvidha", "khoobiyan"
  ];
  if (hinglishRoots.some((root) => lower.includes(root))) return "hi";

  return "en";
}

export const FEATURE_GUIDES: Record<string, FeatureGuideContent> = {
  // 1. Virtual Tripwire / Line Crossing
  line_crossing: {
    titleEn: "Virtual Tripwire & Line Crossing",
    titleMl: "വെർച്വൽ ട്രിപ്‌വയർ & ലൈൻ ക്രോസിംഗ് (Line Crossing)",
    titleHi: "वर्चुअल ट्रिपवायर एवं लाइन क्रॉसिंग (Line Crossing)",
    path: "Dashboard → Analytics → Rules & Automation",
    directUrl: "/analytics/rules",
    guideEn:
      "**Virtual Tripwire & Line Crossing Setup Guide:**\n\n" +
      "📍 **Path:** [Analytics ➔ Rules & Automation](/analytics/rules)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Go to **Analytics → Rules & Automation** (`/analytics/rules`).\n" +
      "2. Select your **Branch** and **Camera** from the top dropdowns.\n" +
      "3. In the **Visual Zone & Virtual Tripwire Designer**, select **Virtual Tripwire** mode (or click **⚡ Door Ingress Tripwire** preset).\n" +
      "4. Choose crossing direction: `A ➔ B`, `B ➔ A`, or `A ⇄ B` (bidirectional).\n" +
      "5. Click 2 points on the live camera canvas: Point A (start) and Point B (end).\n" +
      "6. Click **Save Tripwire Definition**.\n" +
      "7. Under **Rule Configuration**, choose Condition: `Line Crossing` (`line_crossing`) and select Action (`Alert`, `Siren`, `SMS`, `Incident`). Click **Save Rule**.\n\n" +
      "✅ Any person or vehicle crossing the line in the selected direction will instantly trigger an alert!",
    guideMl:
      "**Line Crossing (Virtual Tripwire) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics ➔ Rules & Automation** (`/analytics/rules`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → Rules & Automation** click ചെയ്യുക.\n" +
      "   🔗 Direct URL: `/analytics/rules`\n" +
      "2️⃣ **Branch** & **Camera** dropdown-ൽ നിന്ന് select ചെയ്യുക.\n" +
      "3️⃣ **Visual Zone & Virtual Tripwire Designer** tool-ൽ mode **Virtual Tripwire** select ചെയ്യുക.\n" +
      "   *(Quick preset: **⚡ Door Ingress Tripwire** click ചെയ്ത് automatically set ആക്കാം)*\n" +
      "4️⃣ **Direction** select ചെയ്യുക: `A ➔ B`, `B ➔ A`, അല്ലെങ്കിൽ `A ⇄ B` (bidirectional).\n" +
      "5️⃣ Camera preview canvas-ൽ **2 points click** ചെയ്ത് line വരയ്ക്കുക.\n" +
      "   • Point A (🟢 Green) — start\n" +
      "   • Point B (🔵 Blue) — end\n" +
      "6️⃣ **Save Tripwire Definition** button click ചെയ്യുക.\n" +
      "7️⃣ **Rule Configuration** section-ൽ Condition: `Line Crossing` കൊടുത്ത് Action (Alert, Siren, SMS, Incident) save ചെയ്യുക.\n\n" +
      "✅ ഇനി ആ line cross ചെയ്ത് ആരെങ്കിലും കടന്നാൽ automatic alert trigger ആകും!",
    guideHi:
      "**वर्चुअल ट्रिपवायर (Line Crossing) कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics ➔ Rules & Automation** (`/analytics/rules`)\n\n" +
      "**चरण-दर-चरण निर्देश (Step-by-Step Instructions):**\n" +
      "1️⃣ लॉगिन करने के बाद बाएं मेनू से **Analytics → Rules & Automation** पर जाएं।\n" +
      "   🔗 सीधा लिंक: `/analytics/rules`\n" +
      "2️⃣ ऊपर दिए गए ड्रॉपडाउन से अपनी **Branch** और **Camera** चुनें।\n" +
      "3️⃣ **Visual Zone & Virtual Tripwire Designer** में **Virtual Tripwire** मोड चुनें (या **⚡ Door Ingress Tripwire** प्रीसेट पर क्लिक करें)।\n" +
      "4️⃣ पार करने की दिशा (Direction) चुनें: `A ➔ B`, `B ➔ A` या `A ⇄ B` (दोनों दिशाओं में)।\n" +
      "5️⃣ कैमरे के लाइव कैनवास पर **2 पॉइंट क्लिक** करके लाइन खींचें (Point A = शुरुआत, Point B = अंत)।\n" +
      "6️⃣ **Save Tripwire Definition** बटन पर क्लिक करें।\n" +
      "7️⃣ नीचे **Rule Configuration** में Condition: `Line Crossing` चुनें और Action (अलर्ट, सायरन, एसएमएस या इंसिडेंट) चुनकर **Save Rule** दबाएं।\n\n" +
      "✅ अब इस लाइन को पार करते ही स्वचालित अलर्ट ट्रिगर हो जाएगा!",
    suggestionsEn: [
      "How to set up Polygon Zone?",
      "Face Recognition setup guide",
      "What AI features are available?",
    ],
    suggestionsMl: [
      "Polygon Zone set cheyyaan",
      "Face Recognition set cheyyaan",
      "What AI features are available?",
    ],
    suggestionsHi: [
      "पॉलीगॉन ज़ोन (Polygon Zone) कैसे बनाएं?",
      "चेहरा पहचान (Face Recognition) कैसे सेट करें?",
      "KryptonVision में क्या फीचर्स हैं?",
    ],
  },

  // 2. Polygon Zone (Sterile / Restricted Area)
  polygon_zone: {
    titleEn: "Polygon Zone (Sterile & Restricted Area)",
    titleMl: "പോളിഗോൺ സോൺ & റെസ്ട്രിക്റ്റഡ് ഏരിയ (Polygon Zone)",
    titleHi: "पॉलीगॉन ज़ोन एवं वर्जित क्षेत्र घुसपैठ (Polygon Zone)",
    path: "Dashboard → Analytics → Rules & Automation",
    directUrl: "/analytics/rules",
    guideEn:
      "**Polygon Zone (Sterile / Restricted Area) Setup Guide:**\n\n" +
      "📍 **Path:** [Analytics ➔ Rules & Automation](/analytics/rules)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Go to **Analytics → Rules & Automation** (`/analytics/rules`).\n" +
      "2. Select your **Branch** and **Camera**.\n" +
      "3. In the Designer, switch mode to **Polygon Zone**.\n" +
      "4. Click **3 or more points** on the live camera canvas to draw a closed polygonal boundary around the restricted area.\n" +
      "5. Click the starting point again to close the polygon shape.\n" +
      "6. Click **Save Zone Definition**.\n" +
      "7. Under **Rule Configuration**, select Condition: `Zone Intrusion` (`zone_intrusion`) and assign an Action (`Alert`, `Siren`, `Dispatch Guard`). Save the rule.\n\n" +
      "✅ Any unauthorized entry into the sterile zone will immediately sound alarms and notify the SOC!",
    guideMl:
      "**Polygon Zone (Sterile / Restricted Area) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics ➔ Rules & Automation** (`/analytics/rules`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Login ചെയ്ത ശേഷം **Analytics → Rules & Automation** click ചെയ്യുക (`/analytics/rules`).\n" +
      "2️⃣ **Branch** & **Camera** select ചെയ്യുക.\n" +
      "3️⃣ Mode **Polygon Zone** select ചെയ്യുക.\n" +
      "4️⃣ Camera canvas-ൽ **3-ൽ കൂടുതൽ points click** ചെയ്ത് ഒരു closed shape വരയ്ക്കുക.\n" +
      "5️⃣ First point-ൽ വീണ്ടും click ചെയ്ത് polygon close ചെയ്യുക.\n" +
      "6️⃣ **Save Zone Definition** click ചെയ്യുക.\n" +
      "7️⃣ Rule Configuration-ൽ Condition: `Zone Intrusion` select ചെയ്ത് Action (Alert/Siren/Incident) save ചെയ്യുക.\n\n" +
      "✅ ഇനി ആ restricted zone-ലേക്ക് ആരെങ്കിലും കടന്നാൽ ഉടൻ alert trigger ആകും!",
    guideHi:
      "**पॉलीगॉन ज़ोन (प्रतिबंधित क्षेत्र घुसपैठ) कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics ➔ Rules & Automation** (`/analytics/rules`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → Rules & Automation** पर जाएं (`/analytics/rules`)।\n" +
      "2️⃣ अपनी **Branch** और **Camera** चुनें।\n" +
      "3️⃣ टूल में मोड बदलकर **Polygon Zone** चुनें।\n" +
      "4️⃣ कैमरे के कैनवास पर **3 या अधिक बिंदु क्लिक** करके प्रतिबंधित क्षेत्र के चारों ओर एक बहुभुज (polygon) बनाएं।\n" +
      "5️⃣ पहले बिंदु पर फिर से क्लिक करके आकार को बंद (close) करें।\n" +
      "6️⃣ **Save Zone Definition** पर क्लिक करें।\n" +
      "7️⃣ Condition में `Zone Intrusion` चुनें और Action (सायरन/अलर्ट/गार्ड डिस्पैच) सेट करके **Save Rule** दबाएं।\n\n" +
      "✅ उस क्षेत्र में किसी के भी प्रवेश करते ही तत्काल अलार्म बज जाएगा!",
    suggestionsEn: [
      "Line Crossing setup guide",
      "Face Recognition watchlist",
      "ANPR vehicle tracking",
    ],
    suggestionsMl: [
      "Line Crossing set cheyyaan",
      "Face Recognition set cheyyaan",
      "ANPR set cheyyaan",
    ],
    suggestionsHi: [
      "लाइन क्रॉसिंग कैसे सेट करें?",
      "चेहरा पहचान (Face Recognition) कैसे लगाएं?",
      "गाड़ी नंबर पहचान (ANPR) कैसे जोड़ें?",
    ],
  },

  // 3. Facial Recognition
  facial_recognition: {
    titleEn: "Facial Recognition & Watchlists",
    titleMl: "ഫേസ് റെക്കഗ്നിഷൻ & വാച്ച്ലിസ്റ്റ് (Facial Recognition)",
    titleHi: "चेहरा पहचान एवं वॉचलिस्ट (Facial Recognition)",
    path: "Dashboard → Analytics → Face Recognition & Watchlists",
    directUrl: "/analytics/face-recognition",
    guideEn:
      "**Facial Recognition & Watchlist Management Guide:**\n\n" +
      "📍 **Path:** [Analytics → Face Recognition & Watchlists](/analytics/face-recognition)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Navigate to **Analytics → Face Recognition & Watchlists** (`/analytics/face-recognition`).\n" +
      "2. Click the **+ Enroll Person** button.\n" +
      "3. Enter the person's Name, Role, and Category: `VIP`, `Employee`, `Contractor`, or `Blacklist/Watchlist`.\n" +
      "4. Upload 1 to 5 clear face photos (different angles provide maximum accuracy).\n" +
      "5. Click **Save & Enroll** to generate the biometric embedding vector.\n" +
      "6. To configure alerts: Go to `/analytics/rules` and select Condition: `Face Match` (`face_match`) with Target Category: `Blacklist` → Action: `Instant Alert & Guard Dispatch`.\n\n" +
      "✅ Live cameras will automatically detect and match registered individuals in under 200 milliseconds with liveness verification!",
    guideMl:
      "**Face Recognition & Watchlist — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics → Face Recognition & Watchlists** (`/analytics/face-recognition`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Analytics → Face Recognition & Watchlists** click ചെയ്യുക (`/analytics/face-recognition`).\n" +
      "2️⃣ **\"+ Enroll Person\"** button click ചെയ്യുക.\n" +
      "3️⃣ Name, Category (`VIP`, `Employee`, `Blacklisted`, `Watchlist`) നൽകുക.\n" +
      "4️⃣ വ്യക്തമായ Face photo upload ചെയ്യുക (1-5 photos, വ്യത്യസ്ത angles കൂടുതൽ accuracy നൽകും).\n" +
      "5️⃣ **Save** click ചെയ്യുക — enrollment complete!\n" +
      "6️⃣ **Alert Rule:** `/analytics/rules`-ൽ Condition: `Face Match` select ചെയ്ത് Blacklist alert configure ചെയ്യുക.\n\n" +
      "✅ ഇനി enroll ചെയ്ത face camera-ൽ വരുമ്പോൾ automatically തിരിച്ചറിഞ്ഞ് alert നൽകും!",
    guideHi:
      "**चेहरा पहचान (Face Recognition) और वॉचलिस्ट कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics → Face Recognition & Watchlists** (`/analytics/face-recognition`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → Face Recognition & Watchlists** पर जाएं (`/analytics/face-recognition`)।\n" +
      "2️⃣ **+ Enroll Person** बटन पर क्लिक करें।\n" +
      "3️⃣ व्यक्ति का नाम और श्रेणी चुनें: `VIP`, `Employee`, या `Blacklist/Watchlist`।\n" +
      "4️⃣ चेहरे की 1 से 5 स्पष्ट तस्वीरें (विभिन्न कोणों से) अपलोड करें।\n" +
      "5️⃣ **Save** पर क्लिक करें — बायोमेट्रिक प्रोफाइल सक्रिय हो जाएगा।\n" +
      "6️⃣ अलर्ट के लिए: `/analytics/rules` में जाकर Condition: `Face Match` चुनें और ब्लैकलिस्ट व्यक्ति दिखने पर तुरंत गार्ड को अलर्ट भेजें।\n\n" +
      "✅ अब लाइव कैमरा फीड में व्यक्ति के आते ही 200 मिलीसेकंड में पहचान हो जाएगी!",
    suggestionsEn: [
      "ANPR vehicle tracking",
      "AI Smart Video Search",
      "Banking & Vault setup",
    ],
    suggestionsMl: [
      "ANPR set cheyyaan",
      "Video Search engane use cheyyam",
      "Banking Vault module",
    ],
    suggestionsHi: [
      "गाड़ी नंबर पहचान (ANPR) कैसे सेट करें?",
      "AI वीडियो सर्च कैसे करें?",
      "बैंक वॉल्ट निगरानी कैसे जोड़ें?",
    ],
  },

  // 4. ANPR (Automatic Number Plate Recognition)
  anpr: {
    titleEn: "ANPR — Automatic Number Plate Recognition",
    titleMl: "ANPR — വാഹന നമ്പർ തിരിച്ചറിയൽ & വെഹിക്കിൾ ട്രാക്കിംഗ്",
    titleHi: "ANPR — स्वचालित वाहन नंबर प्लेट पहचान",
    path: "Dashboard → Analytics → ANPR & Vehicle Telemetry",
    directUrl: "/analytics/anpr",
    guideEn:
      "**ANPR (Automatic Number Plate Recognition) Setup Guide:**\n\n" +
      "📍 **Path:** [Analytics → ANPR & Vehicle Telemetry](/analytics/anpr)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Open **Analytics → ANPR & Vehicle Telemetry** (`/analytics/anpr`).\n" +
      "2. Assign entry/exit cameras designated for gate and driveway coverage.\n" +
      "3. Configure your **Allowlist & Blocklist**:\n" +
      "   • **Allowlist:** Registered staff, tenants, and authorized logistics vehicles.\n" +
      "   • **Blocklist:** Suspicious or barred vehicle license plates (e.g. `KL01AB1234`).\n" +
      "4. Set up automation rules in `/analytics/rules` → Condition: `ANPR Match` → Action: `Trigger Boom Barrier` or `Blocklist Alert`.\n" +
      "5. Review real-time vehicle entry/exit logs with snapshot images and timestamps in the ANPR log tab.\n\n" +
      "✅ Automatic boom barrier control and instant alerts on unauthorized vehicle detection!",
    guideMl:
      "**ANPR (Vehicle Number Plate Recognition) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics → ANPR & Vehicle Telemetry** (`/analytics/anpr`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Analytics → ANPR & Vehicle Telemetry** click ചെയ്യുക (`/analytics/anpr`).\n" +
      "2️⃣ **Camera Assignment** — gate/entrance camera assign ചെയ്യുക.\n" +
      "3️⃣ **Allowlist / Blocklist** configure ചെയ്യുക:\n" +
      "   • Allowlist: അനുവദനീയമായ വാഹനങ്ങൾ (സ്റ്റാഫ്, ഓതറൈസ്ഡ് വാഹനങ്ങൾ)\n" +
      "   • Blocklist: തടയേണ്ട വാഹനങ്ങൾ (ഉടൻ alert നൽകും, format: `KL01AB1234`)\n" +
      "4️⃣ **Alert Rule:** `/analytics/rules`-ൽ Condition: `ANPR Match` സെറ്റ് ചെയ്യുക.\n" +
      "5️⃣ **Entry/Exit Logs:** ലൈസൻസ് പ്ലേറ്റ്, ഫോട്ടോ, സമയം സഹിതം തത്സമയം ലോഗ് ആകും.\n\n" +
      "✅ ബൂം ബാരിയർ ഇന്റഗ്രേഷനും തത്സമയ വെഹിക്കിൾ ട്രാക്കിംഗും ലഭ്യമാണ്!",
    guideHi:
      "**ANPR (गाड़ी की नंबर प्लेट पहचान) कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics → ANPR & Vehicle Telemetry** (`/analytics/anpr`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → ANPR & Vehicle Telemetry** पर जाएं (`/analytics/anpr`)।\n" +
      "2️⃣ गेट या पार्किंग वाले कैमरे को ANPR के लिए असाइन करें।\n" +
      "3️⃣ **Allowlist और Blocklist** सेट करें:\n" +
      "   • **Allowlist:** कर्मचारियों और अधिकृत वाहनों के नंबर (बूम बैरियर अपने आप खुलेगा)।\n" +
      "   • **Blocklist:** संदिग्ध या प्रतिबंधित नंबर (जैसे `DL01AB1234` — तुरंत अलार्म बजेगा)।\n" +
      "4️⃣ `/analytics/rules` में Condition: `ANPR Match` चुनकर नियम सेव करें।\n" +
      "5️⃣ प्रवेश और निकास के समय, फोटो और नंबर प्लेट का रिकॉर्ड लाइव लॉग में देखें।\n\n" +
      "✅ बूम बैरियर ऑटोमेशन और सुरक्षा अलर्ट तुरंत शुरू हो जाएंगे!",
    suggestionsEn: [
      "Facial Recognition watchlist",
      "AI Smart Video Search",
      "Virtual Tripwire setup",
    ],
    suggestionsMl: [
      "Face Recognition set cheyyaan",
      "Video Search engane use cheyyam",
      "Line Crossing set cheyyaan",
    ],
    suggestionsHi: [
      "चेहरा पहचान (Face Recognition) कैसे लगाएं?",
      "वीडियो सर्च कैसे करें?",
      "लाइन क्रॉसिंग कैसे सेट करें?",
    ],
  },

  // 5. Crowd & Loitering
  crowd_loitering: {
    titleEn: "Crowd & Loitering Analytics",
    titleMl: "ക്രൗഡ് ഡെൻസിറ്റി & ലോയ്‌റ്ററിംഗ് അനലിറ്റിക്‌സ് (Crowd & Loitering)",
    titleHi: "भीड़ एवं संदिग्ध ठहराव (Crowd & Loitering Analytics)",
    path: "Dashboard → Analytics → Crowd & Counter Queue",
    directUrl: "/analytics/crowd",
    guideEn:
      "**Crowd Density & Loitering Analytics Guide:**\n\n" +
      "📍 **Path:** [Analytics → Crowd & Counter Queue](/analytics/crowd)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Open **Analytics → Crowd & Counter Queue** (`/analytics/crowd`).\n" +
      "2. Select the camera overseeing the lobby, ATM booth, or entrance.\n" +
      "3. Set the **Crowd Density Threshold** (e.g. alert when more than 8 people congregate in a zone).\n" +
      "4. To enable **Loitering Detection**:\n" +
      "   • In `/analytics/rules`, choose Condition: `Loitering` (`loitering`).\n" +
      "   • Set the dwell time threshold (e.g. 3 minutes lingering in ATM vestibule or vault corridor).\n" +
      "5. Configure Action: `Dispatch Guard` or `Audio Announcement`.\n\n" +
      "✅ Automatic early warning for overcrowding, queue bottlenecks, and suspicious surveillance casing!",
    guideMl:
      "**Crowd & Loitering Analytics — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics → Crowd & Counter Queue** (`/analytics/crowd`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Analytics → Crowd & Counter Queue** click ചെയ്യുക (`/analytics/crowd`).\n" +
      "2️⃣ Lobby, ATM, entrance camera select ചെയ്യുക.\n" +
      "3️⃣ **Crowd Density Threshold** നൽകുക (ഉദാഹരണത്തിന്: 8-ൽ കൂടുതൽ ആളുകൾ ഒത്തുചേർന്നാൽ alert).\n" +
      "4️⃣ **Loitering Alert** set ചെയ്യാൻ: `/analytics/rules`-ൽ Condition: `Loitering` നൽകി സമയം (ഉദാഹരണത്തിന്: 3 മിനിറ്റിൽ കൂടുതൽ നിൽക്കുന്നത്) സെറ്റ് ചെയ്യുക.\n" +
      "5️⃣ Action-ൽ Alert / Guard Dispatch തിരഞ്ഞെടുത്ത് save ചെയ്യുക.\n\n" +
      "✅ ATM, vault, sensitive corridors-ൽ സംശയകരമായ സാന്നിധ്യം തത്സമയം കണ്ടെത്തും!",
    guideHi:
      "**भीड़ (Crowd) और संदिग्ध ठहराव (Loitering) कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics → Crowd & Counter Queue** (`/analytics/crowd`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → Crowd & Counter Queue** पर जाएं (`/analytics/crowd`)।\n" +
      "2️⃣ लॉबी, एटीएम या गेट वाला कैमरा चुनें।\n" +
      "3️⃣ **Crowd Density Threshold** सेट करें (जैसे: 8 से अधिक लोग इकट्ठा होने पर अलर्ट)।\n" +
      "4️⃣ **Loitering (ठहराव) अलर्ट:** `/analytics/rules` में जाएं और Condition: `Loitering` चुनें। समय सीमा तय करें (जैसे एटीएम के पास 3 मिनट से ज्यादा खड़े रहने पर अलर्ट)।\n" +
      "5️⃣ Action में गार्ड भेजना या सायरन बजाना सेट करें।\n\n" +
      "✅ एटीएम, बैंक लॉबी और संवेदनशील क्षेत्रों में संदिग्ध गतिविधि तुरंत पकड़ में आएगी!",
    suggestionsEn: [
      "Banking & Vault setup",
      "Line Crossing rules",
      "Executive MIS Reports",
    ],
    suggestionsMl: [
      "Banking Vault module",
      "Line Crossing set cheyyaan",
      "MIS Reports evide kaanam",
    ],
    suggestionsHi: [
      "बैंक वॉल्ट निगरानी कैसे सेट करें?",
      "लाइन क्रॉसिंग कैसे लगाएं?",
      "एमआईएस रिपोर्ट कैसे देखें?",
    ],
  },

  // 6. Banking & NBFC Vault Operations
  nbfc_banking: {
    titleEn: "Banking & NBFC Operations (Vault & Cash Counters)",
    titleMl: "ബാങ്കിംഗ് & NBFC ഓപ്പറേഷൻസ് (വോൾട്ട് & ക്യാഷ് കൗണ്ടർ)",
    titleHi: "बैंकिंग एवं एनबीएफसी संचालन (वॉल्ट एवं कैश काउंटर)",
    path: "Dashboard → Analytics → Banking & Cash Counters",
    directUrl: "/analytics/banking",
    guideEn:
      "**Banking & NBFC Operations Module Setup Guide:**\n\n" +
      "📍 **Path:** [Analytics → Banking & Cash Counters](/analytics/banking)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Go to **Analytics → Banking & Cash Counters** (`/analytics/banking`).\n" +
      "2. **Strong-Room & Vault Security:**\n" +
      "   • Assign the vault room camera.\n" +
      "   • Enable **Dual Custody Enforcement**: Requires two authorized custodians simultaneously present to access the vault.\n" +
      "   • Configure the **Max Vault Open Duration** timer (e.g. 5 minutes).\n" +
      "3. **Cash Counter & Teller Surveillance:**\n" +
      "   • Assign cameras facing tellers and cash drawers.\n" +
      "   • Enable **Unauthorized Counter Cross Alert** for non-staff entering teller zones.\n" +
      "4. **Defaulter & High-Risk Watchlist:** Manage alerts in `/analytics/nbfc-watchlist`.\n" +
      "5. **Automated Daily MIS Audit:** Generate RBI/regulatory compliant daily surveillance health digests in `/reports/mis`.\n\n" +
      "✅ Complete vault dual-custody verification, cash desk security, and regulatory MIS reporting!",
    guideMl:
      "**Banking & NBFC / Vault Module — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics → Banking & Cash Counters** (`/analytics/banking`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Analytics → Banking & Cash Counters** click ചെയ്യുക (`/analytics/banking`).\n" +
      "2️⃣ **Vault Setup:**\n" +
      "   • Strong-room / Vault camera assign ചെയ്യുക.\n" +
      "   • **Dual Custody Rule** enable ചെയ്യുക — 2 authorized persons ഒരുമിച്ച് ഹാജരായാൽ മാത്രമേ vault തുറക്കാവൂ.\n" +
      "   • Vault open duration timer set ചെയ്യുക (ഉദാഹരണത്തിന് 5 മിനിറ്റ്).\n" +
      "3️⃣ **Cash Counter:** Cash desk cameras assign ചെയ്ത് unauthorized access alert ഓൺ ചെയ്യുക.\n" +
      "4️⃣ **NBFC Watchlist:** `/analytics/nbfc-watchlist`-ൽ defaulters & suspicious watchlist manage ചെയ്യാം.\n" +
      "5️⃣ **Daily MIS Reports:** `/reports/mis`-ൽ ബാങ്കിംഗ് ഓഡിറ്റിന് ആവശ്യമായ daily health digest സ്വയം നിർമ്മിക്കപ്പെടും.\n\n" +
      "✅ വോൾട്ട് സുരക്ഷയും ക്യാഷ് കൗണ്ടർ നിരീക്ഷണവും പൂർണ്ണമായും ഓട്ടോമേറ്റ് ചെയ്യാം!",
    guideHi:
      "**बैंकिंग एवं एनबीएफसी वॉल्ट सुरक्षा कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics → Banking & Cash Counters** (`/analytics/banking`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → Banking & Cash Counters** पर जाएं (`/analytics/banking`)।\n" +
      "2️⃣ **स्ट्रांग रूम एवं वॉल्ट (Vault) सुरक्षा:**\n" +
      "   • वॉल्ट का मुख्य कैमरा जोड़ें।\n" +
      "   • **Dual Custody (दोहरी हिरासत) नियम चालू करें:** वॉल्ट खोलते समय 2 अधिकृत व्यक्तियों का मौजूद होना अनिवार्य होगा।\n" +
      "   • वॉल्ट खुले रहने का अधिकतम समय (जैसे 5 मिनट) सेट करें।\n" +
      "3️⃣ **कैश काउंटर एवं टेलर डेस्क:** कैश ड्रॉअर की निगरानी वाला कैमरा लगाएं और अनाधिकृत व्यक्ति के प्रवेश पर अलर्ट सेट करें।\n" +
      "4️⃣ **NBFC वॉचलिस्ट:** `/analytics/nbfc-watchlist` में संदिग्ध व्यक्तियों की सूची प्रबंधित करें।\n" +
      "5️⃣ **दैनिक एमआईएस रिपोर्ट:** `/reports/mis` से आरबीआई और आंतरिक ऑडिट के लिए दैनिक रिपोर्ट डाउनलोड करें।\n\n" +
      "✅ वॉल्ट दोहरी निगरानी और कैश डेस्क की पूरी सुरक्षा सुनिश्चित होती है!",
    suggestionsEn: [
      "Executive MIS Reports",
      "Face Recognition watchlist",
      "AI Smart Video Search",
    ],
    suggestionsMl: [
      "MIS Reports evide kaanam",
      "Face Recognition set cheyyaan",
      "Video Search engane use cheyyam",
    ],
    suggestionsHi: [
      "एमआईएस रिपोर्ट कैसे देखें?",
      "चेहरा पहचान (Face Recognition) कैसे लगाएं?",
      "AI वीडियो सर्च कैसे करें?",
    ],
  },

  // 7. Natural Language AI Video Search (VLM / Video RAG)
  ai_video_search: {
    titleEn: "Natural Language AI Video Search (Vision RAG)",
    titleMl: "നാച്ചുറൽ ലാംഗ്വേജ് AI വീഡിയോ സെർച്ച് (Talk to your CCTV)",
    titleHi: "प्राकृतिक भाषा AI वीडियो खोज (Vision RAG — Talk to CCTV)",
    path: "Dashboard → Investigate → AI Smart Video Search",
    directUrl: "/video-search",
    guideEn:
      "**Natural Language AI Video Search ('Talk to your CCTV') Guide:**\n\n" +
      "📍 **Path:** [Investigate → AI Smart Video Search](/video-search)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Navigate to **Investigate → AI Smart Video Search** (`/video-search`).\n" +
      "2. Type your search query in plain conversational language:\n" +
      "   • English: *'Person wearing yellow shirt and carrying a backpack yesterday after 7 PM'*\n" +
      "   • Malayalam: *'ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക'*\n" +
      "   • Hindi: *'कल शाम 7 बजे के बाद पीली शर्ट और बैग लिए व्यक्ति को दिखाओ'*\n" +
      "   • Manglish: *'innale 7 manikku sesham yellow shirt ittu vanna aale kaanikku'*\n" +
      "3. Filter by **Branch**, **Camera Group**, or **Date & Time Range**.\n" +
      "4. Click **Search** — the Vision-LLM (Qwen2-VL / Gemini / CLIP) scans hours of footage in seconds.\n" +
      "5. Play the matching clips, view keyframe evidence, and click **Export to Evidence Package**.\n\n" +
      "✅ Zero timeline scrubbing — find suspects and vehicles across branches in seconds!",
    guideMl:
      "**AI Smart Video Search (Talk to your CCTV) — എങ്ങനെ ഉപയോഗിക്കാം:**\n\n" +
      "📍 **Path:** Dashboard → **Investigate → AI Smart Video Search** (`/video-search`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Investigate → AI Smart Video Search** click ചെയ്യുക (`/video-search`).\n" +
      "2️⃣ സാധാരണ സംസാര ഭാഷയിൽ natural language query ടൈപ്പ് ചെയ്യുക:\n" +
      "   • *'ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക'*\n" +
      "   • *'Person wearing red helmet on black bike at entrance'*\n" +
      "   • *'innale ratri vault-nu munnil ninnu aal'* (Manglish-ലും സാധ്യമാണ്)\n" +
      "3️⃣ **Branch** & **Time Range** തിരഞ്ഞെടുക്കുക.\n" +
      "4️⃣ **Search** click ചെയ്യുക — മണിക്കൂറുകളുടെ റെക്കോർഡിംഗിൽ നിന്ന് കൃത്യമായ ക്ലിപ്പുകൾ സെക്കൻഡുകൾക്കുള്ളിൽ ലഭിക്കും!\n" +
      "5️⃣ ക്ലിപ്പുകൾ preview ചെയ്യാനും, കോർട്ട്-റെഡി HSM എവിഡൻസ് ആയി എക്സ്പോർട്ട് ചെയ്യാനും സാധിക്കും.\n\n" +
      "✅ ടൈംലൈൻ മണിക്കൂറുകളോളം സ്ക്രബ്ബ് ചെയ്യാതെ എളുപ്പത്തിൽ തെളിവുകൾ കണ്ടെത്താം!",
    guideHi:
      "**प्राकृतिक भाषा AI वीडियो खोज ('Talk to your CCTV') कैसे करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Investigate → AI Smart Video Search** (`/video-search`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Investigate → AI Smart Video Search** पर जाएं (`/video-search`)।\n" +
      "2️⃣ अपनी भाषा में सीधा सर्च प्रश्न लिखें:\n" +
      "   • हिंदी: *'कल शाम 7 बजे के बाद पीली शर्ट और बैग लिए व्यक्ति को दिखाओ'*\n" +
      "   • अंग्रेजी: *'Person wearing yellow shirt and backpack yesterday after 7 PM'*\n" +
      "   • हिंग्लिश: *'kal 7 baje ke baad yellow shirt wala aadmi dikhao'*\n" +
      "   • मलयालम: *'ഇന്നലെ വൈകുന്നേരം 7 മണിക്ക് ശേഷം മഞ്ഞ ഷർട്ട് ഇട്ട് ബാഗുമായി വന്ന ആളെ കാണിക്കുക'*\n" +
      "3️⃣ अपनी **Branch** और **समय सीमा (Time Range)** चुनें।\n" +
      "4️⃣ **Search** पर क्लिक करें — विज़न-एआई (Gemini / Qwen2-VL) घंटों की रिकॉर्डिंग में से सही क्लिप कुछ ही सेकंड में ढूंढ निकालेगा।\n" +
      "5️⃣ क्लिप देखें और सीधे कानूनी साक्ष्य (Evidence Package) के रूप में डाउनलोड करें।\n\n" +
      "✅ टाइमलाइन को घंटों तक ड्रैग करने की ज़रूरत नहीं — तुरंत सटीक वीडियो खोजें!",
    suggestionsEn: [
      "Evidence & Chain of Custody",
      "Face Recognition watchlist",
      "Live Video Wall",
    ],
    suggestionsMl: [
      "Evidence export cheyyaan",
      "Face Recognition set cheyyaan",
      "Live Video Wall",
    ],
    suggestionsHi: [
      "साक्ष्य (Evidence) कैसे निर्यात करें?",
      "चेहरा पहचान (Face Recognition) कैसे लगाएं?",
      "लाइव वीडियो वॉल (Live Wall) कैसे देखें?",
    ],
  },

  // 8. Incident Management & SOPs
  incident_management: {
    titleEn: "Incident Response & SOP Workflows",
    titleMl: "ഇൻസിഡന്റ് റെസ്പോൺസ് & SOP വർക്ക്ഫ്ലോ (Incident Management)",
    titleHi: "घटना प्रतिक्रिया एवं एसओपी वर्कफ़्लो (Incident Response & SOP)",
    path: "Dashboard → Incident Response",
    directUrl: "/incidents",
    guideEn:
      "**Incident Response & SOP Workflows Guide:**\n\n" +
      "📍 **Path:** [Incident Response](/incidents)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Open **Incident Response** (`/incidents`).\n" +
      "2. **Auto-Incident Generation:** When an AI alert rule triggers in `/analytics/rules` with Action: `Create Incident`, it automatically populates here with attached video clips and camera metadata.\n" +
      "3. **Manual Creation:** Click **+ New Incident**, select Branch, Camera, Severity (`Low`, `Medium`, `High`, `Critical`), and assign an Operator.\n" +
      "4. **SOP Checklist:** Operators must follow and check off mandated response steps (e.g. *1. Verify video feed, 2. Sound local siren, 3. Dispatch security guard, 4. Notify branch manager*).\n" +
      "5. **Escalation Timers:** If unresolved within the configured SLA (e.g. 15 minutes), the incident automatically escalates to regional security directors.\n\n" +
      "✅ Full audit trail with operator actions, guard dispatch notes, and tamper-proof evidence!",
    guideMl:
      "**Incident Management & SOP Workflow — എങ്ങനെ ഉപയോഗിക്കാം:**\n\n" +
      "📍 **Path:** Dashboard → **Incident Response** (`/incidents`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Incident Response** click ചെയ്യുക (`/incidents`).\n" +
      "2️⃣ **Auto-Incident:** റൂൾ ട്രിഗർ ആകുമ്പോൾ automatic-ആയി വീഡിയോ ക്ലിപ്പുകൾ സഹിതം ഇൻസിഡന്റ് ക്രിയേറ്റ് ആകും.\n" +
      "3️⃣ **Manual Incident:** **+ New Incident** ക്ലിക്ക് ചെയ്ത് Branch, Camera, Severity (`Critical`/`High`) നൽകുക.\n" +
      "4️⃣ **SOP Checklist:** സുരക്ഷാ പ്രോട്ടോക്കോൾ അനുസരിച്ചുള്ള സ്റ്റെപ്പുകൾ (ക്യാമറ പരിശോധിക്കുക, സൈറൺ മുഴക്കുക, ഗാർഡിനെ അയക്കുക) ഓപ്പറേറ്റർ ഓരോന്നായി പൂർത്തിയാക്കും.\n" +
      "5️⃣ **Escalation:** നിശ്ചിത സമയത്തിനുള്ളിൽ തീർപ്പുകൽപ്പിച്ചില്ലെങ്കിൽ മാനേജ്‌മെന്റിലേക്ക് ഓട്ടോ-എസ്കലേഷൻ പോകും.\n\n" +
      "✅ സുരക്ഷാ വീഴ്ചകൾ ഒഴിവാക്കാനും മുഴുവൻ ഓഡിറ്റ് ട്രയൽ സൂക്ഷിക്കാനും സഹായിക്കുന്നു!",
    guideHi:
      "**घटना प्रबंधन एवं मानक संचालन प्रक्रिया (Incident Management & SOP):**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Incident Response** (`/incidents`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Incident Response** पर जाएं (`/incidents`)।\n" +
      "2️⃣ **ऑटो इंसिडेंट:** कोई भी अलार्म बजते ही वीडियो क्लिप के साथ केस अपने आप दर्ज हो जाता है।\n" +
      "3️⃣ **मैन्युअल दर्ज करें:** **+ New Incident** दबाएं, ब्रांच और गंभीरता (Severity) चुनें और ऑपरेटर को असाइन करें।\n" +
      "4️⃣ **SOP चेकलिस्ट:** ऑपरेटर को अनिवार्य सुरक्षा चरणों (जैसे: 1. वीडियो देखना, 2. सायरन बजाना, 3. गार्ड को भेजना) को चेक करना होगा।\n" +
      "5️⃣ **एस्केलेशन टाइमर:** तय समय (जैसे 15 मिनट) में समाधान न होने पर उच्च अधिकारियों को स्वतः अलर्ट जाता है।\n\n" +
      "✅ ऑपरेटर की हर गतिविधि और वीडियो साक्ष्य का पूरा ऑडिट लॉग सुरक्षित रहता है!",
    suggestionsEn: [
      "Evidence export guide",
      "Executive MIS Reports",
      "Live Video Wall",
    ],
    suggestionsMl: [
      "Evidence export cheyyaan",
      "MIS Reports evide kaanam",
      "Live Video Wall",
    ],
    suggestionsHi: [
      "साक्ष्य निर्यात (Evidence Export) कैसे करें?",
      "एमआईएस रिपोर्ट (MIS Reports) कैसे देखें?",
      "लाइव वीडियो वॉल कैसे देखें?",
    ],
  },

  // 9. Voice Biometric ID & Voice Login
  voice_id: {
    titleEn: "Voice Biometric ID & Voice Login",
    titleMl: "വോയ്സ് ബയോമെട്രിക് ഐഡി & വോയ്സ് ലോഗിൻ (Voice ID)",
    titleHi: "वॉयस बायोमेट्रिक पहचान एवं वॉयस लॉगिन (Voice ID)",
    path: "Dashboard → Account & Security Settings",
    directUrl: "/account/security",
    guideEn:
      "**Voice Biometric ID & Hands-Free Login Setup Guide:**\n\n" +
      "📍 **Path:** [Account & Security Settings](/account/security)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Go to **Account Settings → Security** (`/account/security`).\n" +
      "2. Under **Voice Biometric Enrollment**, click **Enroll Voice ID**.\n" +
      "3. Speak your personal passphrase clearly into your microphone 3 times when prompted.\n" +
      "4. The acoustic neural engine extracts your unique vocal tract embedding (anti-spoofing protected).\n" +
      "5. Click **Save Voice Profile**.\n" +
      "6. **To Login with Voice:** On the login page, click the **🎙️ Voice Login** button and speak your passphrase — you will be securely authenticated without typing a password!\n\n" +
      "✅ Fast, hands-free, multi-factor biometric authentication for control room operators!",
    guideMl:
      "**Voice Authentication (Voice ID Login) — എവിടെ, എങ്ങനെ Enroll ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Account & Security Settings** (`/account/security`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar അല്ലെങ്കിൽ പ്രൊഫൈൽ വഴി **Account Settings → Security** (`/account/security`) എടുക്കുക.\n" +
      "2️⃣ **Voice Biometric Enrollment** സെക്ഷനിൽ **Enroll Voice ID** ക്ലിക്ക് ചെയ്യുക.\n" +
      "3️⃣ മൈക്രോഫോണിൽ കാണിക്കുന്ന പാസ്ഫ്രേസ് 3 തവണ വ്യക്തമായി പറയുക.\n" +
      "4️⃣ സിസ്റ്റം നിങ്ങളുടെ ശബ്ദത്തിന്റെ യുണീക് ബയോമെട്രിക് പ്രൊഫൈൽ സേവ് ചെയ്യും.\n" +
      "5️⃣ **ലോഗിൻ ചെയ്യുന്ന വിധം:** ലോഗിൻ സ്ക്രീനിൽ **Voice Login** ക്ലിക്ക് ചെയ്ത് പാസ്ഫ്രേസ് പറയുക — പാസ്‌വേഡ് ടൈപ്പ് ചെയ്യാതെ ലോഗിൻ ആകാം!\n\n" +
      "✅ കൺട്രോൾ റൂമിൽ ഹാൻഡ്‌സ്-ഫ്രീ സുരക്ഷിത ലോഗിൻ സാധ്യമാക്കുന്നു!",
    guideHi:
      "**वॉयस बायोमेट्रिक पहचान एवं वॉयस लॉगिन (Voice ID) कैसे लगाएं:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Account & Security Settings** (`/account/security`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ अपनी प्रोफ़ाइल में जाकर **Account Settings → Security** (`/account/security`) खोलें।\n" +
      "2️⃣ **Voice Biometric Enrollment** में **Enroll Voice ID** पर क्लिक करें।\n" +
      "3️⃣ स्क्रीन पर दिए गए पासफ़्रेज़ (Passphrase) को माइक में 3 बार स्पष्ट रूप से बोलें।\n" +
      "4️⃣ आपका वॉयस प्रोफाइल एन्क्रिप्टेड रूप में सेव हो जाएगा।\n" +
      "5️⃣ **वॉयस से लॉगिन करने का तरीका:** लॉगिन पेज पर **🎙️ Voice Login** बटन दबाएं और अपना पासफ़्रेज़ बोलें — बिना पासवर्ड टाइप किए तुरंत लॉगिन हो जाएगा!\n\n" +
      "✅ कंट्रोल रूम में ऑपरेटरों के लिए त्वरित, पासवर्ड-मुक्त सुरक्षित लॉगिन!",
    suggestionsEn: [
      "Facial Recognition setup",
      "AI Video Search",
      "Live Video Wall",
    ],
    suggestionsMl: [
      "Face Recognition set cheyyaan",
      "Video Search engane use cheyyam",
      "Live Video Wall",
    ],
    suggestionsHi: [
      "चेहरा पहचान (Face Recognition) कैसे लगाएं?",
      "वीडियो सर्च कैसे करें?",
      "लाइव वीडियो वॉल कैसे देखें?",
    ],
  },

  // 10. Evidence & Chain of Custody Export
  evidence_export: {
    titleEn: "Evidence & HSM Chain of Custody Export",
    titleMl: "എവിഡൻസ് & ഡിജിറ്റൽ സൈൻഡ് ചെയിൻ ഓഫ് കസ്റ്റഡി",
    titleHi: "साक्ष्य एवं डिजिटल हस्ताक्षरित चेन ऑफ कस्टडी निर्यात",
    path: "Dashboard → Investigate → Evidence & Chain of Custody",
    directUrl: "/evidence",
    guideEn:
      "**Evidence & Chain of Custody Export Guide:**\n\n" +
      "📍 **Path:** [Investigate → Evidence & Chain of Custody](/evidence)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Navigate to **Investigate → Evidence & Chain of Custody** (`/evidence`).\n" +
      "2. Click **Create Evidence Package**.\n" +
      "3. Specify Case Title, Incident ID, Camera, and Time Window.\n" +
      "4. Select recorded video clips, keyframe snapshots, and incident operator notes to bundle.\n" +
      "5. Click **Sign with Hardware Security Module (HSM)** — embeds cryptographic digital signatures and timestamp proofs.\n" +
      "6. Export options: Secure password-protected ZIP download, direct authorized auditor link, or encrypted archive.\n\n" +
      "✅ 100% tamper-evident, court-admissible evidence packages complying with legal standards!",
    guideMl:
      "**Evidence & Chain of Custody Export — എങ്ങനെ ഉപയോഗിക്കാം:**\n\n" +
      "📍 **Path:** Dashboard → **Investigate → Evidence & Chain of Custody** (`/evidence`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Investigate → Evidence & Chain of Custody** click ചെയ്യുക (`/evidence`).\n" +
      "2️⃣ **Create Evidence Package** ക്ലിക്ക് ചെയ്യുക.\n" +
      "3️⃣ കേസ് പേര്, ക്യാമറ, തീയതി & സമയം നൽകുക.\n" +
      "4️⃣ ആവശ്യമായ വീഡിയോ ക്ലിപ്പുകളും ഫോട്ടോകളും പാക്കേജിലേക്ക് ആഡ് ചെയ്യുക.\n" +
      "5️⃣ **HSM Digital Signature** വഴി തെളിവുകൾ ഡിജിറ്റലായി സീൽ ചെയ്യും (ആർക്കും മാറ്റം വരുത്താൻ സാധിക്കില്ല).\n" +
      "6️⃣ പാസ്‌വേഡ് പ്രൊട്ടക്റ്റഡ് ഡൗൺലോഡ് ചെയ്യുകയോ ഓഡിറ്റർമാർക്ക് സുരക്ഷിതമായി അയക്കുകയോ ചെയ്യാം.\n\n" +
      "✅ കോടതിയിലും നിയമപരമായ അന്വേഷണങ്ങൾക്കും ഉപയോഗിക്കാൻ തക്ക തെളിവുകൾ ലഭിക്കും!",
    guideHi:
      "**साक्ष्य एवं डिजिटल चेन ऑफ कस्टडी (Evidence Export) कैसे बनाएं:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Investigate → Evidence & Chain of Custody** (`/evidence`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Investigate → Evidence & Chain of Custody** पर जाएं (`/evidence`)।\n" +
      "2️⃣ **Create Evidence Package** पर क्लिक करें।\n" +
      "3️⃣ केस का नाम, कैमरा और घटना की सही तारीख/समय चुनें।\n" +
      "4️⃣ आवश्यक वीडियो क्लिप, फोटो और ऑपरेटर के नोट्स जोड़ें।\n" +
      "5️⃣ **HSM Digital Signature:** साक्ष्य को डिजिटल रूप से सील किया जाएगा ताकि कोई छेड़छाड़ न कर सके।\n" +
      "6️⃣ पासवर्ड-संरक्षित ज़िप फ़ाइल डाउनलोड करें या अधिकृत अधिकारी के साथ साझा करें।\n\n" +
      "✅ कानूनी रूप से मान्य और न्यायालय में पेश करने योग्य सुरक्षित साक्ष्य प्राप्त करें!",
    suggestionsEn: [
      "AI Smart Video Search",
      "Incident Management",
      "Executive MIS Reports",
    ],
    suggestionsMl: [
      "Video Search engane use cheyyam",
      "Incident management evide",
      "MIS Reports evide kaanam",
    ],
    suggestionsHi: [
      "AI वीडियो सर्च कैसे करें?",
      "इंसिडेंट मैनेजमेंट कैसे करें?",
      "एमआईएस रिपोर्ट कैसे डाउनलोड करें?",
    ],
  },

  // 11. Executive MIS Reports & Graphs
  mis_reports: {
    titleEn: "Executive MIS Reports & Daily Surveillance Digest",
    titleMl: "എക്സിക്യൂട്ടീവ് MIS റിപ്പോർട്ടുകൾ & ഡെയ്‌ലി സർവൈലൻസ് ഡൈജസ്റ്റ്",
    titleHi: "कार्यकारी एमआईएस रिपोर्ट एवं दैनिक निगरानी डाइजेस्ट",
    path: "Dashboard → Reports → Executive MIS Reports & Graphs",
    directUrl: "/reports/mis",
    guideEn:
      "**Executive MIS Reports & Daily Surveillance Digest Guide:**\n\n" +
      "📍 **Path:** [Reports → Executive MIS Reports & Graphs](/reports/mis)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Navigate to **Reports → Executive MIS Reports** (`/reports/mis`).\n" +
      "2. Select Date Range (Daily / Weekly / Monthly) and filter by Branch or Zone.\n" +
      "3. Key Digest Metrics:\n" +
      "   • Camera Uptime & Recording Coverage percentages\n" +
      "   • Alert Counts by Category & Severity\n" +
      "   • Footfall Trends & Peak Lobby Traffic\n" +
      "   • Banking/NBFC Vault Dual-Custody compliance rate\n" +
      "4. Export Formats: Instant PDF summary, Excel raw telemetry, or scheduled 7 AM automated email digest.\n\n" +
      "✅ Executive clarity on multi-branch security posture without wading through raw alerts!",
    guideMl:
      "**Executive MIS Reports & Daily Digest — എവിടെ, എങ്ങനെ കാണാം:**\n\n" +
      "📍 **Path:** Dashboard → **Reports → Executive MIS Reports & Graphs** (`/reports/mis`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Reports → Executive MIS Reports** click ചെയ്യുക (`/reports/mis`).\n" +
      "2️⃣ ദിവസേനയുള്ളതോ (Daily), ആഴ്ചയിലെ (Weekly), അല്ലെങ്കിൽ മാസത്തിലെ (Monthly) റിപ്പോർട്ട് സെലക്ട് ചെയ്യുക.\n" +
      "3️⃣ പ്രധാന വിവരങ്ങൾ:\n" +
      "   • ക്യാമറകളുടെ പ്രവർത്തനക്ഷമത (Uptime & Health)\n" +
      "   • അലർട്ട് സംഗ്രഹം (വിഭാഗം തിരിച്ച്)\n" +
      "   • വോൾട്ട് സുരക്ഷാ പാലനം (ബാങ്കിംഗ് ശാഖകൾക്കായി)\n" +
      "   • ഫുട്ഫാൾ & തിരക്ക് കണക്കുകൾ\n" +
      "4️⃣ **Export:** PDF, Excel ഡൗൺലോഡ് ചെയ്യാം, ദിവസവും രാവിലെ 7 മണിക്ക് ഇമെയിലായി ഷെഡ്യൂൾ ചെയ്യാം.\n\n" +
      "✅ ഉയർന്ന മാനേജ്‌മെന്റിന് ഒറ്റനോട്ടത്തിൽ സുരക്ഷാ നിലവാരം വിലയിരുത്താം!",
    guideHi:
      "**कार्यकारी एमआईएस रिपोर्ट (Executive MIS Reports) कैसे देखें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Reports → Executive MIS Reports & Graphs** (`/reports/mis`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Reports → Executive MIS Reports** पर जाएं (`/reports/mis`)।\n" +
      "2️⃣ दैनिक (Daily), साप्ताहिक (Weekly), या मासिक (Monthly) तारीख चुनें और अपनी ब्रांच फ़िल्टर करें।\n" +
      "3️⃣ मुख्य जानकारी:\n" +
      "   • कैमरों की चालू स्थिति (Uptime & Offline Report)\n" +
      "   • सुरक्षा अलर्ट का विवरण\n" +
      "   • बैंक वॉल्ट और कैश काउंटर अनुपालन स्थिति\n" +
      "   • ग्राहकों और आगंतुकों की संख्या (Footfall)\n" +
      "4️⃣ **डाउनलोड:** पीडीएफ या एक्सेल प्रारूप में डाउनलोड करें या रोजाना सुबह स्वतः ईमेल सेट करें।\n\n" +
      "✅ पूरे संस्थान की सुरक्षा स्थिति का पूरा सारांश एक ही स्थान पर!",
    suggestionsEn: [
      "Banking & Vault setup",
      "Live Video Wall",
      "Camera Health overview",
    ],
    suggestionsMl: [
      "Banking Vault module",
      "Live Video Wall",
      "Camera Health status",
    ],
    suggestionsHi: [
      "बैंक वॉल्ट निगरानी कैसे लगाएं?",
      "लाइव वीडियो वॉल कैसे देखें?",
      "कैमरा स्वास्थ्य रिपोर्ट कैसे देखें?",
    ],
  },

  // 12. Fall Detection
  fall_detection: {
    titleEn: "Worker & Elderly Fall Detection",
    titleMl: "വീഴ്ച തിരിച്ചറിയൽ & എമർജൻസി അലർട്ട് (Fall Detection)",
    titleHi: "गिरने की पहचान एवं आपातकालीन अलर्ट (Fall Detection)",
    path: "Dashboard → Analytics → Worker & Elderly Fall Detection",
    directUrl: "/analytics/fall",
    guideEn:
      "**Worker & Elderly Fall Detection Setup Guide:**\n\n" +
      "📍 **Path:** [Analytics → Worker & Elderly Fall Detection](/analytics/fall)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Open **Analytics → Worker & Elderly Fall Detection** (`/analytics/fall`).\n" +
      "2. Assign cameras in factory floors, construction zones, stairwells, or hospital rooms.\n" +
      "3. Configure detection sensitivity (`High` / `Medium` / `Low`) and posture change thresholds.\n" +
      "4. In `/analytics/rules`, set Condition: `Fall Detection` → Action: `Siren & Immediate Emergency SMS`.\n\n" +
      "✅ Rapid emergency response when slips and falls occur in hazardous or care facilities!",
    guideMl:
      "**Fall Detection (വീഴ്ച തിരിച്ചറിയൽ) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics → Worker & Elderly Fall Detection** (`/analytics/fall`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Analytics → Worker & Elderly Fall** click ചെയ്യുക (`/analytics/fall`).\n" +
      "2️⃣ ഫാക്ടറി, പടവുകൾ, വയോജന കേന്ദ്രങ്ങളിലെ ക്യാമറകൾ സെലക്ട് ചെയ്യുക.\n" +
      "3️⃣ Detection Sensitivity ക്രമീകരിക്കുക.\n" +
      "4️⃣ `/analytics/rules`-ൽ Condition: `Fall Detection` കൊടുത്ത് അടിയന്തര മെഡിക്കൽ എസ്എംഎസ് / സൈറൺ സെറ്റ് ചെയ്യുക.\n\n" +
      "✅ ആരെങ്കിലും വീണാൽ ഉടനടി എമർജൻസി അലർട്ട് ലഭിക്കും!",
    guideHi:
      "**गिरने की पहचान (Fall Detection) कैसे सेट करें:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics → Worker & Elderly Fall Detection** (`/analytics/fall`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → Worker & Elderly Fall Detection** पर जाएं (`/analytics/fall`)।\n" +
      "2️⃣ सीढ़ियों, कारखाने या अस्पताल वाले कैमरे चुनें।\n" +
      "3️⃣ सेंसिटिविटी (संवेदनशीलता) सेट करें।\n" +
      "4️⃣ `/analytics/rules` में Condition: `Fall Detection` चुनकर तुरंत मेडिकल टीम को एसएमएस और अलार्म सेट करें।\n\n" +
      "✅ आपातकालीन स्थिति में तुरंत सहायता सुनिश्चित होती है!",
    suggestionsEn: [
      "Incident Management",
      "Live Video Wall",
      "Camera Tamper detection",
    ],
    suggestionsMl: [
      "Incident management evide",
      "Live Video Wall",
      "Camera Tamper alert",
    ],
    suggestionsHi: [
      "इंसिडेंट मैनेजमेंट कैसे करें?",
      "लाइव वीडियो वॉल कैसे देखें?",
      "कैमरा छेड़छाड़ अलर्ट कैसे लगाएं?",
    ],
  },

  // 13. Camera Tamper & Defocus
  camera_tamper: {
    titleEn: "Camera Tamper, Defocus & Blind Detection",
    titleMl: "ക്യാമറ തടസ്സങ്ങളും ആംഗിൾ മാറ്റങ്ങളും (Camera Tamper)",
    titleHi: "कैमरा छेड़छाड़, ब्लर एवं अंधा करना (Camera Tamper)",
    path: "Dashboard → Analytics → Camera Tamper & Defocus",
    directUrl: "/analytics/camera-tamper",
    guideEn:
      "**Camera Tamper & Defocus Detection Setup Guide:**\n\n" +
      "📍 **Path:** [Analytics → Camera Tamper & Defocus](/analytics/camera-tamper)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Open **Analytics → Camera Tamper & Defocus** (`/analytics/camera-tamper`).\n" +
      "2. Select the cameras to guard against tampering.\n" +
      "3. Enable protection modes:\n" +
      "   • **Defocus:** Blurry or smudged lens\n" +
      "   • **Covered/Spray-Painted:** Physical obstruction or blackout\n" +
      "   • **Redirected/Moved:** Camera tilted away from its intended angle\n" +
      "4. In `/analytics/rules`, set Condition: `Camera Tamper` → Action: `SOC Alert & Alarm`.\n\n" +
      "✅ Zero blind spots — detects physical vandalism within 3 seconds!",
    guideMl:
      "**Camera Tamper & Defocus Detection — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Analytics → Camera Tamper & Defocus** (`/analytics/camera-tamper`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Analytics → Camera Tamper & Defocus** click ചെയ്യുക (`/analytics/camera-tamper`).\n" +
      "2️⃣ നിരീക്ഷിക്കേണ്ട ക്യാമറകൾ സെലക്ട് ചെയ്യുക.\n" +
      "3️⃣ പ്രൊട്ടക്ഷൻ മോഡുകൾ ഓൺ ചെയ്യുക:\n" +
      "   • **Defocus:** ലെൻസ് മങ്ങുകയോ ഫ്രെയിം മാറുന്നതോ\n" +
      "   • **Covered:** ക്യാമറ തുണി കൊണ്ടോ സ്പ്രേ കൊണ്ടോ മൂടുന്നത്\n" +
      "   • **Redirected:** ക്യാമറയുടെ ആംഗിൾ തിരിച്ചു മാറ്റുന്നത്\n" +
      "4️⃣ `/analytics/rules`-ൽ റൂൾ സേവ് ചെയ്യുക.\n\n" +
      "✅ ക്യാമറ കേടുവരുത്താനോ വഴിതിരിച്ചുവിടാനോ ശ്രമിച്ചാൽ ഉടനടി സുരക്ഷാ അലർട്ട് ലഭിക്കും!",
    guideHi:
      "**कैमरा छेड़छाड़ (Camera Tamper) एवं ब्लर पहचान कैसे लगाएं:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Analytics → Camera Tamper & Defocus** (`/analytics/camera-tamper`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Analytics → Camera Tamper & Defocus** पर जाएं (`/analytics/camera-tamper`)।\n" +
      "2️⃣ कैमरे चुनें जिन पर निगरानी रखनी है।\n" +
      "3️⃣ अलर्ट के प्रकार सक्रिय करें:\n" +
      "   • **Defocus:** लेंस धुंधला होने पर\n" +
      "   • **Covered:** कैमरे पर कपड़ा या स्प्रे पेंट डालने पर\n" +
      "   • **Moved:** कैमरे की दिशा मोड़ने पर\n" +
      "4️⃣ `/analytics/rules` में Condition: `Camera Tamper` चुनकर अलार्म सेट करें।\n\n" +
      "✅ कैमरे के साथ किसी भी छेड़छाड़ का 3 सेकंड में पता चल जाएगा!",
    suggestionsEn: [
      "Camera Health status",
      "Live Video Wall",
      "Virtual Tripwire rules",
    ],
    suggestionsMl: [
      "Camera Health status",
      "Live Video Wall",
      "Line Crossing set cheyyaan",
    ],
    suggestionsHi: [
      "कैमरा स्वास्थ्य रिपोर्ट देखें",
      "लाइव वीडियो वॉल देखें",
      "लाइन क्रॉसिंग कैसे लगाएं?",
    ],
  },

  // 14. Edge Agent Installation & High Availability
  edge_agent: {
    titleEn: "Edge Agent Setup & Offline Recording",
    titleMl: "എഡ്ജ് ഏജന്റ് ഇൻസ്റ്റലേഷനും ഓഫ്‌ലൈൻ റെക്കോർഡിംഗും",
    titleHi: "एज एजेंट इंस्टॉलेशन एवं ऑफ़लाइन रिकॉर्डिंग",
    path: "Dashboard → Operations → Edge Fleet Management",
    directUrl: "/operations/edge-fleet",
    guideEn:
      "**Edge Agent Installation & Setup Guide:**\n\n" +
      "📍 **Path:** [Operations → Edge Fleet Management](/operations/edge-fleet)\n\n" +
      "**Step-by-Step Instructions:**\n" +
      "1. Go to **Operations → Edge Fleet Management** (`/operations/edge-fleet`).\n" +
      "2. Select your target **Branch** and click **Generate Branch Installer**.\n" +
      "3. Download the branch-specific MSI / EXE installer bundle onto the local on-premise Windows/Linux PC.\n" +
      "4. Run the installer as Administrator — the one-time activation token will pair the local edge gateway to your central cloud control-plane.\n" +
      "5. Once connected, local cameras stream and buffer on-premise, continuing 24/7 recording even during internet blackouts.\n" +
      "6. When network connectivity resumes, encrypted video clips automatically sync to central cloud storage without data loss.\n\n" +
      "✅ High Availability edge architecture ensuring 100% uninterrupted surveillance uptime!",
    guideMl:
      "**Edge Agent Installation — എവിടെ, എങ്ങനെ ചെയ്യാം:**\n\n" +
      "📍 **Path:** Dashboard → **Operations → Edge Fleet Management** (`/operations/edge-fleet`)\n\n" +
      "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n" +
      "1️⃣ Sidebar-ൽ **Operations → Edge Fleet Management** click ചെയ്യുക (`/operations/edge-fleet`).\n" +
      "2️⃣ നിങ്ങളുടെ **Branch** സെലക്ട് ചെയ്ത് **Generate Branch Installer** ക്ലിക്ക് ചെയ്യുക.\n" +
      "3️⃣ ബ്രാഞ്ചിലെ കമ്പ്യൂട്ടറിൽ ഇൻസ്റ്റാളർ ഡൗൺലോഡ് ചെയ്ത് Run as Administrator ചെയ്യുക.\n" +
      "4️⃣ വൺ-ടൈം ആക്റ്റിവേഷൻ കോഡ് വഴി ബ്രാഞ്ച് ഓട്ടോമാറ്റിക്കായി സെൻട്രൽ ക്ലൗഡിലേക്ക് കണക്റ്റ് ആകും.\n" +
      "5️⃣ ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും ബ്രാഞ്ചിൽ ലോക്കലായി റെക്കോർഡിംഗ് തുടരും; ഇന്റർനെറ്റ് വരുമ്പോൾ ക്ലൗഡിലേക്ക് സ്വയം സിങ്ക് ആകും.\n\n" +
      "✅ ഇന്റർനെറ്റ് തടസ്സപ്പെട്ടാലും ഒരു നിമിഷം പോലും റെക്കോർഡിംഗ് നഷ്ടപ്പെടില്ല!",
    guideHi:
      "**एज एजेंट (Edge Agent) इंस्टॉलेशन और ऑफ़लाइन रिकॉर्डिंग:**\n\n" +
      "📍 **रास्ता (Path):** Dashboard → **Operations → Edge Fleet Management** (`/operations/edge-fleet`)\n\n" +
      "**चरण-दर-चरण निर्देश:**\n" +
      "1️⃣ **Operations → Edge Fleet Management** पर जाएं (`/operations/edge-fleet`)।\n" +
      "2️⃣ अपनी **Branch** चुनें और **Generate Branch Installer** पर क्लिक करें।\n" +
      "3️⃣ शाखा के कंप्यूटर पर इंस्टॉलर फ़ाइल डाउनलोड करें और Run as Administrator चलाएं।\n" +
      "4️⃣ एक्टिवेशन टोकन के माध्यम से शाखा स्वतः केंद्रीय क्लाउड से जुड़ जाएगी।\n" +
      "5️⃣ इंटरनेट बंद होने पर भी स्थानीय स्तर पर 24/7 रिकॉर्डिंग चलती रहेगी। इंटरनेट चालू होते ही सारा डेटा सुरक्षित रूप से क्लाउड पर सिंक हो जाएगा।\n\n" +
      "✅ इंटरनेट कटने पर भी बिना किसी रुकावट के पूरी सुरक्षा!",
    suggestionsEn: [
      "Camera Health overview",
      "Live Video Wall",
      "What AI features are available?",
    ],
    suggestionsMl: [
      "Camera Health status",
      "Live Video Wall",
      "What AI features are available?",
    ],
    suggestionsHi: [
      "कैमरा स्वास्थ्य रिपोर्ट देखें",
      "लाइव वीडियो वॉल देखें",
      "KryptonVision में क्या फीचर्स हैं?",
    ],
  },
};

/**
 * Return fully localized response object for a feature guide
 */
export function getLocalizedGuide(
  featureKey: string,
  preferredLang: SupportedLanguage = "en",
  timestamp: string = new Date().toISOString()
) {
  const guide = FEATURE_GUIDES[featureKey];
  if (!guide) return null;

  let message = guide.guideEn;
  if (preferredLang === "hi") message = guide.guideHi;
  else if (preferredLang === "ml") message = guide.guideMl;

  return {
    message,
    messageMl: guide.guideMl,
    messageHi: guide.guideHi,
    type: "text" as const,
    suggestions: guide.suggestionsEn,
    suggestionsMl: guide.suggestionsMl,
    suggestionsHi: guide.suggestionsHi,
    timestamp,
  };
}
