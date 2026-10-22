/** General CCTV and VMS concepts. Product-specific paths stay in the route catalog. */
export const CCTV_VMS_PRIMER = `CCTV / VMS TRAINING KNOWLEDGE:
- CCTV is a video surveillance system. An IP camera encodes video and sends it over a network. An analog camera sends video to a DVR; an NVR typically receives IP camera streams. A VMS (Video Management System) is the software layer for camera enrollment, live viewing, recording policy, playback, search, alerts, users, and evidence export. A VMS may work with an NVR or other storage; they are not synonyms.
- Explain the usual flow: camera or recorder -> network/edge gateway -> VMS/media service -> live view and recordings -> alerts, investigation, and export. Distinguish live stream availability from recording health.
- RTSP is commonly used to request and transport a camera media stream. ONVIF standardizes interfaces for interoperable IP security products; ONVIF discovery/control does not by itself guarantee every vendor feature. Profile S covers basic video streaming, T advanced video streaming, G edge storage/retrieval, and M analytics metadata/events. Verify actual device and client profile conformance and supported functions before promising compatibility. Source: https://www.onvif.org/profiles/.
- PoE can carry network data and power on suitable Ethernet cabling and equipment. Bandwidth, camera count, resolution, frame rate, codec, and bitrate affect network load and storage. H.264/H.265 are codecs; exact savings vary by scene and settings. Recording retention is a policy and capacity calculation, not a universal fixed duration.
- Continuous, scheduled, motion, and event recording are different policies. Playback, multi-camera synchronization, bookmarks, and evidence export help investigations. Keep original timestamps and audit trail for evidence.
- PTZ means pan, tilt, and zoom. Night vision may use infrared or low-light imaging; check illumination, reflections, and camera settings. Video analytics such as line crossing, intrusion, people counting, face recognition, and ANPR need suitable placement, configuration, and human verification of important detections.
- Troubleshoot systematically: power/PoE -> network/IP and reachability -> credentials -> ONVIF/RTSP/recorder channel -> stream/codec -> VMS permissions -> recording schedule/storage/retention. Never ask users to paste passwords or activation codes into chat.
- Distinguish general CCTV/VMS explanations from KryptonVision-specific behavior. Use the verified route catalog for product links. For brand/model specifications or fast-changing standards, state uncertainty and recommend checking official vendor and ONVIF documentation.`;

type Topic = {
  pattern: RegExp;
  title: string;
  titleMl?: string;
  titleHi?: string;
  answer: string;
  answerMl?: string;
  answerHi?: string;
};

const TOPICS: Topic[] = [
  {
    pattern: /\b(?:onvif.*rtsp|rtsp.*onvif)\b/i,
    title: "ONVIF and RTSP",
    titleMl: "ONVIF ഉം RTSP ഉം തമ്മിലുള്ള വ്യത്യാസം",
    titleHi: "ONVIF और RTSP में अंतर",
    answer: "ONVIF is an interoperability interface used for device discovery, configuration, and supported controls; RTSP is commonly used to request the actual media stream. A VMS may use ONVIF to find a camera and obtain its stream details, then RTSP to receive video. Supporting one does not guarantee every feature of the other.",
    answerMl: "ONVIF എന്നത് ക്യാമറകൾ കണ്ടെത്താനും (discovery), ക്രമീകരിക്കാനും (configuration) ഉപയോഗിക്കുന്ന ഒരു മാനദണ്ഡമാണ്. RTSP (Real-Time Streaming Protocol) ലൈവ് വീഡിയോ സ്ട്രീം അയക്കാനാണ് ഉപയോഗിക്കുന്നത്. VMS ആദ്യം ONVIF വഴി ക്യാമറ കണ്ടെത്തി പിന്നീട് RTSP വഴി വീഡിയോ പ്ലേ ചെയ്യുന്നു.",
    answerHi: "ONVIF एक मानक इंटरफेस है जो डिवाइस की खोज (डिस्कवरी) और सेटिंग्स के लिए उपयोग होता है; RTSP का उपयोग वास्तविक वीडियो स्ट्रीम प्राप्त करने के लिए किया जाता है। VMS पहले ONVIF द्वारा कैमरा पहचानता है और फिर RTSP द्वारा वीडियो स्ट्रीम करता है।",
  },
  {
    pattern: /\b(?:vms.*nvr|nvr.*vms)\b/i,
    title: "VMS and NVR",
    titleMl: "VMS ഉം NVR ഉം",
    titleHi: "VMS और NVR में अंतर",
    answer: "An NVR is primarily a recorder for IP camera streams. A VMS is software that manages cameras, live viewing, recording policy, search, alerts, access, and evidence workflows. A deployment may use both: the NVR stores footage while the VMS gives operators a wider management and investigation interface.",
    answerMl: "NVR എന്നത് IP ക്യാമറകളുടെ വീഡിയോ റെക്കോർഡ് ചെയ്യുന്ന ഹാർഡ്‌വെയർ ഡിവൈസാണ്. എന്നാൽ VMS (Video Management System) എന്നത് ഒന്നിലധികം ബ്രാഞ്ചുകളിലെ ക്യാമറകൾ, ലൈവ് വാൾ, AI അനലിറ്റിക്സ്, സെർച്ച്, എവിഡൻസ് എന്നിവ കൈകാര്യം ചെയ്യുന്ന സമ്പൂർണ്ണ സോഫ്റ്റ്‌വെയറാണ്.",
    answerHi: "NVR मुख्य रूप से IP कैमरों की रिकॉर्डिंग करने वाला एक हार्डवेयर उपकरण है। जबकि VMS एक उन्नत सॉफ़्टवेयर है जो कैमरों का प्रबंधन, लाइव व्यू, AI एनालिटिक्स, खोज, अलर्ट और डिजिटल साक्ष्य तैयार करने का कार्य करता है।",
  },
  {
    pattern: /\b(?:ip camera.*analog|analog.*ip camera)\b/i,
    title: "IP and analog cameras",
    titleMl: "IP ക്യാമറയും അനലോഗ് ക്യാമറയും",
    titleHi: "IP कैमरा और एनालॉग कैमरा",
    answer: "An IP camera sends encoded video on a network and can often connect directly to a VMS or NVR. An analog camera sends a video signal to a DVR or hybrid recorder, whose channels may then be integrated with the VMS. Check power, cabling, recorder channel support, and the exact integration method.",
    answerMl: "IP ക്യാമറ ഡിജിറ്റൽ വീഡിയോ നെറ്റ്‌വർക്ക് കേബിൾ (RJ45/PoE) വഴി നേരിട്ട് VMS/NVR-ലേക്ക് അയക്കുന്നു. അനലോഗ് ക്യാമറ കോക്സിയൽ കേബിൾ വഴി DVR-ലേക്കാണ് ബന്ധിപ്പിക്കുന്നത്.",
    answerHi: "IP कैमरा डिजिटल वीडियो को नेटवर्क केबल (ईथरनेट/PoE) के जरिए सीधे VMS या NVR को भेजता है। एनालॉग कैमरा वीडियो सिग्नल को कोएक्सियल केबल से DVR में भेजता है।",
  },
  {
    pattern: /\b(?:continuous.*motion|motion.*continuous)\b/i,
    title: "Continuous and motion recording",
    titleMl: "കണ്ടിന്യൂവസ് vs മോഷൻ റെക്കോർഡിംഗ്",
    titleHi: "कंटीन्यूअस बनाम मोशन रिकॉर्डिंग",
    answer: "Continuous recording stores footage throughout the configured schedule. Motion recording stores footage when a motion condition triggers, possibly with pre-event and post-event video if configured. Motion recording can reduce storage use, but missed or false triggers are possible; use the policy that fits the evidence requirement and test it.",
    answerMl: "കണ്ടിന്യൂവസ് റെക്കോർഡിംഗ് മുഴുവൻ സമയവും വീഡിയോ സേവ് ചെയ്യുന്നു. മോഷൻ റെക്കോർഡിംഗ് ചലനം ഉണ്ടാകുമ്പോൾ മാത്രം റെക്കോർഡ് ചെയ്ത് സ്റ്റോറേജ് ലാഭിക്കുന്നു.",
    answerHi: "कंटीन्यूअस रिकॉर्डिंग 24x7 लगातार वीडियो रिकॉर्ड करती है। मोशन रिकॉर्डिंग केवल हलचल होने पर रिकॉर्ड करती है जिससे स्टोरेज की बचत होती है।",
  },
  {
    pattern: /\b(?:vms|video management system|video management software)\b/i,
    title: "VMS software",
    titleMl: "VMS സോഫ്റ്റ്‌വെയർ എന്താണ്?",
    titleHi: "VMS सॉफ़्टवेयर क्या है?",
    answer: "A Video Management System is software that brings cameras, live views, recording rules, playback, search, alerts, user permissions, and evidence export into one place. A camera or NVR supplies video; the VMS organizes how operators view, store, and investigate it. A typical setup is: add cameras or recorders, check live streams, set recording and retention, configure alerts and access, then test playback and export.",
    answerMl: "VMS (വീഡിയോ മാനേജ്‌മെന്റ് സിസ്റ്റം) എന്നത് എല്ലാ CCTV ക്യാമറകളെയും ഒരൊറ്റ കൺട്രോൾ റൂമിലേക്ക് സംയോജിപ്പിക്കുന്ന എന്റർപ്രൈസ് സോഫ്റ്റ്‌വെയറാണ്. ലൈവ് വ്യൂ, റെക്കോർഡിംഗ്, AI അലർട്ടുകൾ, ഇൻസിഡന്റ് മാനേജ്‌മെന്റ് എന്നിവ ഇതിലൂടെ സാധ്യമാകുന്നു.",
    answerHi: "VMS (वीडियो मैनेजमेंट सिस्टम) एक ऐसा सॉफ़्टवेयर है जो सभी सुरक्षा कैमरों, लाइव व्यू, रिकॉर्डिंग नियमों, खोज, अलर्ट्स और साक्ष्य प्रबंधन को एक ही स्क्रीन पर लाता है।",
  },
  {
    pattern: /\b(?:onvif|profile s|profile t|profile g|profile m)\b/i,
    title: "ONVIF",
    titleMl: "ONVIF പ്രോട്ടോക്കോൾ",
    titleHi: "ONVIF प्रोटोकॉल",
    answer: "ONVIF defines interoperable interfaces for IP security devices and clients. Profile S covers basic video streaming, T advanced video streaming, G edge storage and retrieval, and M analytics metadata and events. Matching claimed profiles helps compatibility, but confirm the exact camera and VMS functions using the official ONVIF conformant products list: https://www.onvif.org/conformant-products/.",
    answerMl: "വിവിധ ബ്രാൻഡുകളിലുള്ള CCTV ക്യാമറകളെയും VMS സിസ്റ്റങ്ങളെയും തമ്മിൽ പരസ്പരം ബന്ധിപ്പിക്കാനുള്ള ആഗോള ഇന്റർഫേസ് മാനദണ്ഡമാണ് ONVIF. Profile S സ്ട്രീമിംഗിനും, Profile G എഡ്ജ് സ്റ്റോറേജിനും, Profile M മെറ്റാഡാറ്റ അനലിറ്റിക്സിനും ഉപയോഗിക്കുന്നു.",
    answerHi: "ONVIF विभिन्न ब्रांडों के IP कैमरों और VMS को आपस में जोड़ने का वैश्विक मानक है। Profile S बुनियादी स्ट्रीमिंग, Profile G रिकॉर्डिंग स्टोरेज और Profile M एनालिटिक्स के लिए होता है।",
  },
  {
    pattern: /\b(?:rtsp|streaming protocol|hls)\b/i,
    title: "Video streaming (RTSP)",
    titleMl: "RTSP വീഡിയോ സ്ട്രീമിംഗ്",
    titleHi: "RTSP वीडियो स्ट्रीमिंग",
    answer: "RTSP is commonly used to request a camera or recorder stream. A VMS or media gateway receives the stream and may convert or relay it for browser live view. If live view fails, check reachability, credentials, the correct channel or stream URL, codec support, and the media gateway status.",
    answerMl: "RTSP (Real-Time Streaming Protocol) ക്യാമറയിൽ നിന്നുള്ള തത്സമയ ലൈവ് വീഡിയോ നെറ്റ്‌വർക്ക് വഴി ബ്രൗസറിലേക്കോ വിഎംഎസിലേക്കോ സ്ട്രീം ചെയ്യാൻ ഉപയോഗിക്കുന്നു.",
    answerHi: "RTSP कैमरे से रियल-टाइम वीडियो स्ट्रीम को नेटवर्क पर VMS या ब्राउज़र में लाने के लिए इस्तेमाल होने वाला मुख्य प्रोटोकॉल है।",
  },
  {
    pattern: /\b(?:dvr|nvr|xvr)\b/i,
    title: "DVR and NVR",
    titleMl: "DVR ഉം NVR ഉം",
    titleHi: "DVR और NVR",
    answer: "A DVR normally records analog camera channels; an NVR normally records IP camera streams. Hybrid/XVR recorders may support more than one input type. The VMS can connect to a recorder for live channels or playback if the recorder and integration support those functions. Check the exact model and channel capabilities before setup.",
    answerMl: "DVR അനലോഗ് ക്യാമറകളെ റെക്കോർഡ് ചെയ്യുമ്പോൾ, NVR നെറ്റ്‌വർക്ക് IP ക്യാമറകളെ റെക്കോർഡ് ചെയ്യുന്നു. രണ്ടും KryptonVision VMS പ്ലാറ്റ്‌ഫോമുമായി ഇന്റഗ്രേറ്റ് ചെയ്യാം.",
    answerHi: "DVR एनालॉग कैमरों की रिकॉर्डिंग करता है जबकि NVR डिजिटल IP कैमरों की रिकॉर्डिंग करता है। दोनों को KryptonVision VMS से जोड़ा जा सकता है।",
  },
  {
    pattern: /\b(?:poe|power over ethernet|switch|vlan|bandwidth)\b/i,
    title: "Camera network & PoE",
    titleMl: "PoE നെറ്റ്‌വർക്ക് & പവർ",
    titleHi: "कैमरा नेटवर्क और PoE",
    answer: "PoE can carry data and power to compatible IP cameras through suitable Ethernet equipment. Plan switch power budget, cable distance, network segmentation, and uplink bandwidth. For a connectivity fault, check power and link first, then IP reachability, credentials, and stream access.",
    answerMl: "PoE (Power over Ethernet) വഴി പ്രത്യേക പവർ അഡാപ്റ്റർ ഇല്ലാതെ ഒരൊറ്റ ലാൻ കേബിളിലൂടെ ക്യാമറയ്ക്ക് പവറും ഡാറ്റയും ഒരുമിച്ച് നൽകാം.",
    answerHi: "PoE (Power over Ethernet) के जरिए एक ही नेटवर्क केबल से कैमरे को बिजली और डेटा दोनों मिलते हैं, अलग से पावर केबल की ज़रूरत नहीं होती।",
  },
  {
    pattern: /\b(?:cctv|surveillance camera|security camera)\b/i,
    title: "CCTV Overview",
    titleMl: "CCTV സുരക്ഷാ സംവിധാനം",
    titleHi: "CCTV सुरक्षा प्रणाली",
    answer: "CCTV is a video surveillance system used to observe and review a defined area. Cameras capture video, a recorder or VMS manages live and stored footage, and operators use alerts and playback to investigate events. Good coverage needs appropriate placement, lighting, reliable power/network, recording checks, access controls, and a retention policy.",
    answerMl: "CCTV (Closed-Circuit Television) എന്നത് നിർദ്ദിഷ്ട സ്ഥലങ്ങളുടെ സുരക്ഷ ഉറപ്പാക്കാനും സംഭവങ്ങൾ തത്സമയം വീക്ഷിക്കാനും റെക്കോർഡ് ചെയ്യാനും ഉപയോഗിക്കുന്ന വീഡിയോ നിരീക്ഷണ സംവിധാനമാണ്.",
    answerHi: "CCTV (क्लोज्ड-सर्किट टेलीविज़न) एक सुरक्षा निगरानी प्रणाली है जिसका उपयोग परिसरों की रीयल-टाइम निगरानी और घटना के बाद जांच के लिए किया जाता है।",
  },
];

export function cctvKnowledgeAnswer(query: string): string | null {
  if (/\b(?:how many|show me|current status|right now)\b/i.test(query)) return null;
  if (
    !/\b(?:what|how|why|explain|difference|meaning|guide|troubleshoot|fix|learn|kurich|engane|entha|arivan|ariyanam|kya|kaise|kyu|batao|bataiye|samjhao)\b|[?]|(?:എന്താണ്|എങ്ങനെ|വിശദീകരി|എന്താ|क्या|कैसे|क्यों|समझाएं|अंतर|बताएं)/i.test(
      query
    )
  ) {
    return null;
  }

  const topic = TOPICS.find((entry) => entry.pattern.test(query));
  if (!topic) return null;

  const isMalayalam = /[\u0D00-\u0D7F]/.test(query) || /\b(?:kurich|engane|entha|parayu)\b/i.test(query);
  const isHindi = /[\u0900-\u097F]/.test(query) || /\b(?:kya|kaise|batao|bataiye|samjhao)\b/i.test(query);

  if (isHindi && topic.answerHi) {
    return `**${topic.titleHi || topic.title}**\n\n${topic.answerHi}\n\n*(English: ${topic.answer})*`;
  }

  if (isMalayalam && topic.answerMl) {
    return `**${topic.titleMl || topic.title}**\n\n${topic.answerMl}\n\n*(English: ${topic.answer})*`;
  }

  return `**${topic.title}**\n\n${topic.answer}`;
}

