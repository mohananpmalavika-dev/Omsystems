import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# --- COLOR PALETTE (Krypton Modern Dark Tech Theme) ---
BG_COLOR = RGBColor(11, 15, 25)          # Very deep tech dark #0B0F19
CARD_BG = RGBColor(22, 30, 49)           # Elevated dark card #161E31
CARD_BORDER = RGBColor(38, 51, 80)       # Card subtle border #263350
TEXT_MAIN = RGBColor(248, 250, 252)      # Bright white #F8FAFC
TEXT_MUTED = RGBColor(148, 163, 184)     # Slate silver #94A3B8
TEXT_SECONDARY = RGBColor(203, 213, 225) # Soft white #CBD5E1
ACCENT_CYAN = RGBColor(0, 210, 255)      # Krypton Electric Cyan #00D2FF
ACCENT_BLUE = RGBColor(59, 130, 246)     # Cobalt Blue #3B82F6
ACCENT_EMERALD = RGBColor(16, 185, 129)  # Success Emerald #10B981
ACCENT_AMBER = RGBColor(245, 158, 11)    # Amber Warning #F59E0B
ACCENT_ROSE = RGBColor(244, 63, 94)      # Crimson Alert #F43F5E

SCREENSHOTS_DIR = r"c:\Omsystems\Omsystems\docs\manuals\screenshots"
OUTPUT_PPTX = r"c:\Omsystems\Omsystems\KryptonVision_Demo_Presentation.pptx"

def create_deck():
    prs = Presentation()
    # 16:9 widescreen dimensions
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_slide_layout = prs.slide_layouts[6] # completely blank layout

    def add_blank_slide():
        slide = prs.slides.add_slide(blank_slide_layout)
        # Add background fill
        bg = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height
        )
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_COLOR
        bg.line.fill.background()
        return slide

    def add_header(slide, title_text, category_text="KRYPTONVISION ENTERPRISE VMS"):
        # Category Tag / Breadcrumb
        tag_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.35))
        tf_tag = tag_box.text_frame
        tf_tag.word_wrap = True
        tf_tag.margin_left = tf_tag.margin_top = tf_tag.margin_right = tf_tag.margin_bottom = 0
        p_tag = tf_tag.paragraphs[0]
        p_tag.text = category_text.upper()
        p_tag.font.name = "Arial"
        p_tag.font.size = Pt(10)
        p_tag.font.bold = True
        p_tag.font.color.rgb = ACCENT_CYAN

        # Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.72), Inches(11.7), Inches(0.65))
        tf_title = title_box.text_frame
        tf_title.word_wrap = True
        tf_title.margin_left = tf_title.margin_top = tf_title.margin_right = tf_title.margin_bottom = 0
        p_title = tf_title.paragraphs[0]
        p_title.text = title_text
        p_title.font.name = "Arial"
        p_title.font.size = Pt(22)
        p_title.font.bold = True
        p_title.font.color.rgb = TEXT_MAIN

        # Subtle divider line
        line = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.42), Inches(11.733), Inches(0.02)
        )
        line.fill.solid()
        line.fill.fore_color.rgb = CARD_BORDER
        line.line.fill.background()

        # Footer
        footer_box = slide.shapes.add_textbox(Inches(0.8), Inches(7.05), Inches(11.733), Inches(0.3))
        tf_footer = footer_box.text_frame
        tf_footer.margin_left = tf_footer.margin_top = tf_footer.margin_right = tf_footer.margin_bottom = 0
        p_footer = tf_footer.paragraphs[0]
        p_footer.text = "KryptonLogic  |  KryptonVision AI Video Platform  |  Confidential Client Demo"
        p_footer.font.name = "Arial"
        p_footer.font.size = Pt(9)
        p_footer.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 1: TITLE / COVER SLIDE
    # ==========================================
    s1 = add_blank_slide()

    # Top brand bar
    top_bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.1))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = ACCENT_CYAN
    top_bar.line.fill.background()

    # Brand badge
    badge = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(1.2), Inches(3.2), Inches(0.45))
    badge.fill.solid()
    badge.fill.fore_color.rgb = CARD_BG
    badge.line.color.rgb = ACCENT_CYAN
    badge.line.width = Pt(1.5)
    tf_b = badge.text_frame
    tf_b.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_b = tf_b.paragraphs[0]
    p_b.alignment = PP_ALIGN.CENTER
    p_b.text = "KRYPTONLOGIC TECHNOLOGIES"
    p_b.font.name = "Arial"
    p_b.font.size = Pt(11)
    p_b.font.bold = True
    p_b.font.color.rgb = ACCENT_CYAN

    # Main Hero Title
    title_box = s1.shapes.add_textbox(Inches(1.0), Inches(1.9), Inches(11.3), Inches(1.5))
    tf = title_box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = "KRYPTONVISION"
    p1.font.name = "Arial Black"
    p1.font.size = Pt(46)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_MAIN

    p2 = tf.add_paragraph()
    p2.text = "Next-Generation Enterprise AI Vision & Unified Video Management System"
    p2.font.name = "Arial"
    p2.font.size = Pt(20)
    p2.font.color.rgb = ACCENT_CYAN
    p2.space_before = Pt(8)

    # Subtitle / Value Pitch
    sub_box = s1.shapes.add_textbox(Inches(1.0), Inches(3.7), Inches(11.3), Inches(1.3))
    tf_sub = sub_box.text_frame
    tf_sub.word_wrap = True
    tf_sub.margin_left = tf_sub.margin_top = tf_sub.margin_right = tf_sub.margin_bottom = 0
    p_sub = tf_sub.paragraphs[0]
    p_sub.text = "Autonomous Real-Time Threat Detection, Low-Latency Streaming, Visual Automation Rules, and Regulatory Compliance for Banking, NBFCs, Retail & Critical Infrastructure."
    p_sub.font.name = "Arial"
    p_sub.font.size = Pt(14)
    p_sub.font.color.rgb = TEXT_SECONDARY

    # Feature Highlights Row (3 mini cards)
    card_w = Inches(3.55)
    card_h = Inches(1.4)
    y_cards = Inches(5.2)

    highlights = [
        ("Sub-Second Streaming", "Ultra-low-latency HLS/WebRTC with synced multi-camera playback.", ACCENT_CYAN),
        ("Visual Rule Automation", "No-code geometric zone designer with 36+ pre-seeded banking rules.", ACCENT_BLUE),
        ("Anti-Storm AI Engine", "Zero alarm fatigue with Redis fencing tokens & state cooldowns.", ACCENT_EMERALD),
    ]

    for i, (head, desc, col) in enumerate(highlights):
        x = Inches(1.0) + i * Inches(3.9)
        card = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y_cards, card_w, card_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        t_box = s1.shapes.add_textbox(x + Inches(0.2), y_cards + Inches(0.15), card_w - Inches(0.4), card_h - Inches(0.3))
        t_frame = t_box.text_frame
        t_frame.word_wrap = True
        t_frame.margin_left = t_frame.margin_top = t_frame.margin_right = t_frame.margin_bottom = 0

        p_h = t_frame.paragraphs[0]
        p_h.text = head
        p_h.font.name = "Arial"
        p_h.font.size = Pt(13)
        p_h.font.bold = True
        p_h.font.color.rgb = col

        p_d = t_frame.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10)
        p_d.font.color.rgb = TEXT_MUTED
        p_d.space_before = Pt(4)

    # ==========================================
    # SLIDE 2: THE PROBLEM (WHY LEGACY CCTV FAILS)
    # ==========================================
    s2 = add_blank_slide()
    add_header(s2, "The Critical Security Dilemma: Why Traditional CCTV Fails", "MARKET CHALLENGES & OPERATIONAL PAIN POINTS")

    problems = [
        ("95% Footage Unmonitored", "Human Attention Failure", "After just 20 minutes of continuous monitoring, security guards miss over 95% of active scene anomalies due to severe visual fatigue.", ACCENT_ROSE),
        ("Alarm Storms & Noise", "High False Positive Rates", "Legacy motion sensors trigger dozens of false alerts for shadows, insects, or light shifts, forcing SOC operators to disable notifications entirely.", ACCENT_AMBER),
        ("Hours Lost in Forensics", "Delayed Incident Resolution", "Scrubbing through hours of unsynchronized video across isolated cameras delays incident response, evidence gathering, and police reporting.", ACCENT_BLUE),
        ("Regulatory Non-Compliance", "Zero Audit Trail Enforcement", "High-security facilities (Gold Loans, Banks, Vaults) struggle to prove dual-custody access, perimeter integrity, and continuous retention.", ACCENT_CYAN),
    ]

    for i, (title, subtitle, detail, color) in enumerate(problems):
        x = Inches(0.8) + (i % 2) * Inches(5.95)
        y = Inches(1.8) + (i // 2) * Inches(2.4)
        w = Inches(5.75)
        h = Inches(2.15)

        card = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Pill marker
        pill = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, Inches(0.12), h)
        pill.fill.solid()
        pill.fill.fore_color.rgb = color
        pill.line.fill.background()

        tb = s2.shapes.add_textbox(x + Inches(0.35), y + Inches(0.2), w - Inches(0.55), h - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.name = "Arial"
        p1.font.size = Pt(15)
        p1.font.bold = True
        p1.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = subtitle.upper()
        p2.font.name = "Arial"
        p2.font.size = Pt(10)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_MUTED
        p2.space_before = Pt(2)

        p3 = tf.add_paragraph()
        p3.text = detail
        p3.font.name = "Arial"
        p3.font.size = Pt(11)
        p3.font.color.rgb = TEXT_SECONDARY
        p3.space_before = Pt(8)

    # Bottom summary callout
    bot_card = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.05), Inches(11.733), Inches(0.75))
    bot_card.fill.solid()
    bot_card.fill.fore_color.rgb = CARD_BG
    bot_card.line.color.rgb = ACCENT_CYAN
    bot_card.line.width = Pt(1)

    tb_bot = s2.shapes.add_textbox(Inches(1.0), Inches(6.15), Inches(11.3), Inches(0.55))
    tf_bot = tb_bot.text_frame
    tf_bot.word_wrap = True
    tf_bot.margin_left = tf_bot.margin_top = tf_bot.margin_right = tf_bot.margin_bottom = 0
    p_bot = tf_bot.paragraphs[0]
    p_bot.text = "THE KRYPTONVISION SOLUTION: Transform passive, forensic-only cameras into an active, intelligent, deterministic defense and compliance ecosystem."
    p_bot.font.name = "Arial"
    p_bot.font.size = Pt(11.5)
    p_bot.font.bold = True
    p_bot.font.color.rgb = ACCENT_CYAN

    # ==========================================
    # SLIDE 3: SYSTEM ARCHITECTURE & CORE PLATFORM
    # ==========================================
    s3 = add_blank_slide()
    add_header(s3, "KryptonVision High-Assurance System Architecture", "END-TO-END DISTRIBUTED DESIGN")

    # Left text column
    tb_arch = s3.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.2), Inches(5.0))
    tf_arch = tb_arch.text_frame
    tf_arch.word_wrap = True
    tf_arch.margin_left = tf_arch.margin_top = tf_arch.margin_right = tf_arch.margin_bottom = 0

    points = [
        ("Edge Reverse Proxy (Caddy / TLS)", "Enterprise ingress with automatic SSL/TLS termination, rate limiting, and HTTP/2 multiplexing for smooth video transport."),
        ("High-Performance Media Gateway", "Microservices handling ONVIF/RTSP discovery, sub-second HLS transmuxing, and WebRTC streaming across 100+ concurrent cameras."),
        ("Autonomous AI Analytics Engine", "GPU/NPU-accelerated neural networks (YOLOv8, background subtraction) running real-time point-in-polygon & tripwire crossing."),
        ("Distributed Redis 7 & PostgreSQL 16", "Zero process-local state: Stream leases, viewer allocations, and camera ownership coordinated with epoch-based distributed locks."),
        ("Dual-Tier Storage Architecture", "POSIX/NVMe edge recording vault for ultra-fast scrubbing + automated tiered retention to S3/NFS/SMB archives.")
    ]

    for i, (h_txt, b_txt) in enumerate(points):
        p_h = tf_arch.paragraphs[0] if i == 0 else tf_arch.add_paragraph()
        p_h.text = f"{i+1}. {h_txt}"
        p_h.font.name = "Arial"
        p_h.font.size = Pt(12)
        p_h.font.bold = True
        p_h.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p_h.space_before = Pt(10)

        p_b = tf_arch.add_paragraph()
        p_b.text = b_txt
        p_b.font.name = "Arial"
        p_b.font.size = Pt(10.5)
        p_b.font.color.rgb = TEXT_SECONDARY
        p_b.space_before = Pt(2)

    # Right Column: Architecture diagram card
    card_diag = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.3), Inches(1.7), Inches(6.2), Inches(5.0))
    card_diag.fill.solid()
    card_diag.fill.fore_color.rgb = CARD_BG
    card_diag.line.color.rgb = CARD_BORDER
    card_diag.line.width = Pt(1)

    tb_diag = s3.shapes.add_textbox(Inches(6.5), Inches(1.9), Inches(5.8), Inches(4.6))
    tf_diag = tb_diag.text_frame
    tf_diag.word_wrap = True
    tf_diag.margin_left = tf_diag.margin_top = tf_diag.margin_right = tf_diag.margin_bottom = 0

    p_d1 = tf_diag.paragraphs[0]
    p_d1.text = "DATA & EVALUATION PIPELINE"
    p_d1.font.name = "Arial"
    p_d1.font.size = Pt(13)
    p_d1.font.bold = True
    p_d1.font.color.rgb = ACCENT_BLUE

    pipeline_steps = [
        ("[RTSP / ONVIF IP Streams]", "Multi-brand camera feeds ingested securely at edge", ACCENT_MAIN := TEXT_MAIN),
        ("     |", "", TEXT_MUTED),
        ("v  [AI Detectors: YOLOv8 / Edge NPU]", "Detects Persons, Vehicles, Bags, PPE, and Scene Tampering", ACCENT_CYAN),
        ("     |", "", TEXT_MUTED),
        ("v  [Persistent Multi-Object Tracker]", "Assigns persistent Track IDs across frames for temporal continuity", TEXT_MAIN),
        ("     |", "", TEXT_MUTED),
        ("v  [Geometric Zone Engine (Ray-Casting)]", "Calculates Point-in-Polygon (PIP) & directional line crossings", ACCENT_CYAN),
        ("     |", "", TEXT_MUTED),
        ("v  [Compound Rule & Schedule Evaluator]", "Evaluates Boolean conditions (AND/OR/NOT) against IST operating windows", TEXT_MAIN),
        ("     |", "", TEXT_MUTED),
        ("v  [Anti-Storm Deduplication & Cooldown]", "Redis fencing tokens suppress spam; updates evidence clips continuously", ACCENT_EMERALD),
        ("     |", "", TEXT_MUTED),
        ("v  [Multi-Action Dispatcher]", "Dispatches SOC alerts, relays sirens, pushes webhooks & initiates calls", ACCENT_ROSE),
    ]

    for step, desc, col in pipeline_steps:
        p = tf_diag.add_paragraph()
        p.text = step
        p.font.name = "Consolas"
        p.font.size = Pt(10)
        p.font.bold = True
        p.font.color.rgb = col
        p.space_before = Pt(1)
        if desc:
            p_sub = tf_diag.add_paragraph()
            p_sub.text = f"   └─ {desc}"
            p_sub.font.name = "Arial"
            p_sub.font.size = Pt(9)
            p_sub.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 4: UNIFIED COMMAND CENTER & LIVE VIDEO WALL
    # ==========================================
    s4 = add_blank_slide()
    add_header(s4, "Unified Command Center & Live Video Wall", "CORE USER EXPERIENCE — REAL-TIME MONITORING")

    # Left content box
    tb_s4 = s4.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s4 = tb_s4.text_frame
    tf_s4.word_wrap = True
    tf_s4.margin_left = tf_s4.margin_top = tf_s4.margin_right = tf_s4.margin_bottom = 0

    s4_features = [
        ("Sub-Second Streaming Latency (<400ms)", "Live feeds are served with sub-second response times using WebRTC and low-latency HLS transmuxing."),
        ("Dynamic Matrix & Video Wall Grids", "Seamless switching between 1x1, 2x2, 3x3, 4x4, and custom camera wall matrices across multiple monitor outputs."),
        ("Real-Time AI Bounding Overlays", "Live visual indicators, bounding boxes, confidence metrics, and active zone overlays directly on the canvas."),
        ("Instant PTZ & Camera Controls", "Pan, Tilt, and Zoom with presets, instant optical zoom, and one-click forensic snapshot captures."),
        ("Edge Fault Auto-Recovery", "Built-in stream heartbeat detection with zero-flicker automatic reconnection if network bandwidth dips.")
    ]

    for i, (title, desc) in enumerate(s4_features):
        p_t = tf_s4.paragraphs[0] if i == 0 else tf_s4.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s4.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    # Right side: Screenshot card
    img_path = os.path.join(SCREENSHOTS_DIR, "SS-003-live-video-wall.png")
    if os.path.exists(img_path):
        card_img = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        # Place image inside
        s4.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        # Caption
        cap = s4.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "KryptonVision Live Multi-Stream Video Wall (/surveillance/live)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 5: SYNCHRONIZED MULTI-CAMERA PLAYBACK
    # ==========================================
    s5 = add_blank_slide()
    add_header(s5, "Multi-Camera Synchronized Playback & Time-Travel", "FORENSIC INVESTIGATION & EVIDENCE REVIEW")

    tb_s5 = s5.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s5 = tb_s5.text_frame
    tf_s5.word_wrap = True
    tf_s5.margin_left = tf_s5.margin_top = tf_s5.margin_right = tf_s5.margin_bottom = 0

    s5_features = [
        ("Synchronized Multi-Angle Scrubbing", "Scrub up to 16 camera angles simultaneously in perfect millisecond synchronization to follow suspect movement across doors and corridors."),
        ("Multi-Color Activity Heatmap Timeline", "Visual timeline bar instantly differentiates continuous recordings, motion triggers, and high-severity AI compliance alerts."),
        ("Sub-Second Forensic Seek", "Jump directly to the exact timestamp of an incident with zero buffer lag, eliminating hours of manual footage scanning."),
        ("Variable Speed & Jog-Shuttle Control", "Fluid playback speeds from 0.25x slow-motion review up to 32x high-speed scanning with single-frame jog-stepping."),
        ("Instant Evidence Clipping", "Select in/out timeline points directly from the playback view to export digitally signed MP4/MKV evidence clips.")
    ]

    for i, (title, desc) in enumerate(s5_features):
        p_t = tf_s5.paragraphs[0] if i == 0 else tf_s5.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_BLUE
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s5.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    img_path = os.path.join(SCREENSHOTS_DIR, "SS-004-synced-playback.png")
    if os.path.exists(img_path):
        card_img = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        s5.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        cap = s5.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "Synchronized Multi-Camera Playback & Visual Heatmap (/surveillance/playback)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 6: VISUAL ZONE DESIGNER & RULE ENGINE
    # ==========================================
    s6 = add_blank_slide()
    add_header(s6, "Visual Zone Designer & Compound Rule Engine", "NO-CODE CONFIGURATION & AUTOMATION WORKSPACE")

    tb_s6 = s6.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s6 = tb_s6.text_frame
    tf_s6.word_wrap = True
    tf_s6.margin_left = tf_s6.margin_top = tf_s6.margin_right = tf_s6.margin_bottom = 0

    s6_features = [
        ("No-Code Geometric Drawing Canvas", "Administrators can draw Polygons (vaults, counters, restricted zones) and Tripwires (entry lines, barriers) directly over live video."),
        ("Resolution-Independent Normalized Coordinates", "Zones use normalized coordinates (0.0 to 1.0), ensuring detection accuracy even if camera resolution or aspect ratio shifts."),
        ("Compound Boolean Logic (AND / OR / NOT)", "Eliminates false triggers by chaining multi-sensor conditions (e.g., PERSON_COUNT > 2 AND CASH_DRAWER == OPEN)."),
        ("Timezone-Aware Operational Schedules", "Schedules adhere to IST (Asia/Kolkata) with business-hours, after-hours, 24x7, and branch opening/closing dual custody windows."),
        ("Shadow Mode & Rule Simulation", "Test rules against historical video archives in a safe simulation lab before promoting them to live enforcement.")
    ]

    for i, (title, desc) in enumerate(s6_features):
        p_t = tf_s6.paragraphs[0] if i == 0 else tf_s6.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s6.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    img_path = os.path.join(SCREENSHOTS_DIR, "SS-010-ai-rules-automation.png")
    if os.path.exists(img_path):
        card_img = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        s6.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        cap = s6.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "Visual Zone Designer & Rule Configuration Workspace (/analytics/rules)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 7: ANTI-STORM DEDUPLICATION & ALERT TRIAGE
    # ==========================================
    s7 = add_blank_slide()
    add_header(s7, "Anti-Storm Deduplication & Intelligent Alert Dispatch", "ELIMINATING ALARM FATIGUE IN THE SOC")

    tb_s7 = s7.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s7 = tb_s7.text_frame
    tf_s7.word_wrap = True
    tf_s7.margin_left = tf_s7.margin_top = tf_s7.margin_right = tf_s7.margin_bottom = 0

    s7_features = [
        ("The Alert Storm Problem Solved", "Traditional AI systems generate 1,500 redundant alerts/min if a person lingers in a zone. KryptonVision eliminates this completely."),
        ("Distributed Redis Fencing Tokens", "Guarantees that multiple cluster nodes never evaluate the same frame track concurrently, preventing race condition duplicates."),
        ("Configurable Cooldown State Machine", "Rules enter an intelligent cooldown (60s–300s) after firing. Ongoing tracking clips are updated silently without spamming sirens."),
        ("Persistence Duration Filter (durationMs)", "Conditions must hold true continuously for a defined duration (e.g., 3s) before firing, eliminating flickers and false alarms."),
        ("Multi-Channel Instant Escalation", "Configurable dispatch matrix: SOC dashboard alerts, local relay sirens, webhooks, Telegram/WhatsApp alerts, and automated phone calls.")
    ]

    for i, (title, desc) in enumerate(s7_features):
        p_t = tf_s7.paragraphs[0] if i == 0 else tf_s7.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_EMERALD
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s7.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    img_path = os.path.join(SCREENSHOTS_DIR, "SS-006-alert-operations.png")
    if os.path.exists(img_path):
        card_img = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        s7.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        cap = s7.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "SOC Alert Operations & Triage Management (/operations/alerts)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 8: 36+ PRE-SEEDED COMPLIANCE & BANKING RULES
    # ==========================================
    s8 = add_blank_slide()
    add_header(s8, "Pre-Seeded Enterprise & Banking Compliance Engine", "36+ READY-TO-USE REGULATORY RULE TEMPLATES")

    categories = [
        ("Vault & Strongroom Security", "NBFC-R01 to R07", [
            "Dual-Control Solitary Access Alarm (Person count == 1 inside vault)",
            "Vault Over-Occupancy Alarm (>2 persons in strongroom)",
            "Strongroom Door Open Too Long (>180s without closure)",
            "After-Hours Vault Motion Intrusion (Critical severity alert)",
            "Unattended Open Vault (Door unlocked with 0 personnel present)"
        ], ACCENT_ROSE),
        ("Pledge Counters & Cash Halls", "NBFC-R08 to R14", [
            "Customer Crossing Teller Acrylic Barrier line",
            "Cash Counter Crowd Surge (>5 persons in counter area)",
            "Unattended Cash Counter (Drawer unlocked with teller away >120s)",
            "Teller Hall Loitering (>15 mins dwell time without transaction)",
            "Queue SLA Breach Alert (Queue length >8 persons for >3 mins)"
        ], ACCENT_AMBER),
        ("Logistics & Cash Van Security", "NBFC-R15 to R19", [
            "Cash Van Arrival Unmonitored (Armed guard missing from bay)",
            "Cash Transfer Line Crossing (Corridor unauthorized intrusion)",
            "Cash Box Left Unattended in Bay (>30s stationary package)",
            "Cash Van Extended Dwell Time (>30 mins in transfer bay)",
            "Emergency Corridor & Exit Route Obstruction"
        ], ACCENT_BLUE),
        ("Perimeter & Anti-Tamper Integrity", "NBFC-R25 to R36", [
            "Camera Spray / Blinding / Rapid Occlusion (<5s alert)",
            "Camera Lens Displacement / Defocusing attempt",
            "Continuous Recording Gap Exceeds SLA (>30s gap detected)",
            "Branch Shutter / Roof / Skylight Tampering attempt",
            "Edge Gateway Offline Heartbeat Interruption"
        ], ACCENT_CYAN),
    ]

    for i, (title, code, items, col) in enumerate(categories):
        col_idx = i % 2
        row_idx = i // 2
        x = Inches(0.8) + col_idx * Inches(5.95)
        y = Inches(1.7) + row_idx * Inches(2.6)
        w = Inches(5.75)
        h = Inches(2.45)

        card = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Header pill inside card
        tb_h = s8.shapes.add_textbox(x + Inches(0.2), y + Inches(0.15), w - Inches(0.4), Inches(0.4))
        tf_h = tb_h.text_frame
        tf_h.word_wrap = True
        tf_h.margin_left = tf_h.margin_top = tf_h.margin_right = tf_h.margin_bottom = 0
        p_th = tf_h.paragraphs[0]
        p_th.text = f"{title}  [{code}]"
        p_th.font.name = "Arial"
        p_th.font.size = Pt(12)
        p_th.font.bold = True
        p_th.font.color.rgb = col

        tb_b = s8.shapes.add_textbox(x + Inches(0.2), y + Inches(0.6), w - Inches(0.4), h - Inches(0.75))
        tf_b = tb_b.text_frame
        tf_b.word_wrap = True
        tf_b.margin_left = tf_b.margin_top = tf_b.margin_right = tf_b.margin_bottom = 0

        for item in items:
            p_item = tf_b.add_paragraph()
            p_item.text = f"• {item}"
            p_item.font.name = "Arial"
            p_item.font.size = Pt(9.5)
            p_item.font.color.rgb = TEXT_SECONDARY
            p_item.space_before = Pt(3)

    # ==========================================
    # SLIDE 9: INCIDENT RESPONSE & EVIDENCE VAULT
    # ==========================================
    s9 = add_blank_slide()
    add_header(s9, "Incident Response & Tamper-Proof Evidence Vault", "VERIFIABLE CHAIN OF CUSTODY & REGULATORY AUDIT")

    tb_s9 = s9.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s9 = tb_s9.text_frame
    tf_s9.word_wrap = True
    tf_s9.margin_left = tf_s9.margin_top = tf_s9.margin_right = tf_s9.margin_bottom = 0

    s9_features = [
        ("End-to-End Incident Lifecycle", "Seamless progression from live Alert -> Operator Acknowledgment -> Evidence Annotation -> Police / Legal Escalation."),
        ("Cryptographic Evidence Packaging", "One-click export of court-admissible evidence bundles sealed with SHA-256 hashes and digital watermarks to prevent tampering."),
        ("Immutable Audit Ledger", "Every operator interaction, stream view, PTZ motion, configuration change, and video export is written to an immutable log."),
        ("Operator Feedback Loop (Precision Tuning)", "Operators mark detections as True Positive or False Alarm, providing ground-truth data for continuous AI model retraining."),
        ("External Regulatory Reporting", "Generates compliant compliance PDF/CSV reports ready for RBI / Internal Audit inspection within seconds.")
    ]

    for i, (title, desc) in enumerate(s9_features):
        p_t = tf_s9.paragraphs[0] if i == 0 else tf_s9.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_ROSE
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s9.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    img_path = os.path.join(SCREENSHOTS_DIR, "SS-007-incident-response.png")
    if os.path.exists(img_path):
        card_img = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        s9.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        cap = s9.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "Incident Response & Evidence Packaging (/operations/incidents)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 10: CAMERA HEALTH & STORAGE GOVERNANCE
    # ==========================================
    s10 = add_blank_slide()
    add_header(s10, "Central Device Health, Diagnostics & Storage Lifecycle", "INFRASTRUCTURE VISIBILITY & PROACTIVE MAINTENANCE")

    tb_s10 = s10.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s10 = tb_s10.text_frame
    tf_s10.word_wrap = True
    tf_s10.margin_left = tf_s10.margin_top = tf_s10.margin_right = tf_s10.margin_bottom = 0

    s10_features = [
        ("Live Stream Quality Telemetry", "Continuous real-time monitoring of camera FPS, bitrate, jitter, dropped frames, and packet loss across every branch."),
        ("Automated Camera Clock Drift Alerts", "Alerts if a camera's hardware clock diverges from the server NTP by >1000ms, safeguarding legal timestamp validity."),
        ("Automated Maintenance Workorders", "Automatically flags offline cameras, degraded streams, or lens obstructions, generating tickets for field service teams."),
        ("Storage Retention & Capacity Guard", "Monitors storage disk volumes. Automatically triggers retention alerts when volume space drops below 15%."),
        ("Multi-Tier Storage Architecture", "Optimizes cost by writing high-speed recordings to local SSDs while automatically transferring cold archives to cloud S3/NAS.")
    ]

    for i, (title, desc) in enumerate(s10_features):
        p_t = tf_s10.paragraphs[0] if i == 0 else tf_s10.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s10.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    img_path = os.path.join(SCREENSHOTS_DIR, "SS-011-camera-health.png")
    if os.path.exists(img_path):
        card_img = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        s10.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        cap = s10.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "Central Camera Health & Diagnostic Diagnostics (/maintenance/cameras)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 11: MULTI-TENANCY & ENTERPRISE GOVERNANCE
    # ==========================================
    s11 = add_blank_slide()
    add_header(s11, "Multi-Tenant Hierarchy & Enterprise Governance", "SCALABLE ORGANIZATIONAL MANAGEMENT & ACCESS CONTROL")

    tb_s11 = s11.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.0), Inches(5.0))
    tf_s11 = tb_s11.text_frame
    tf_s11.word_wrap = True
    tf_s11.margin_left = tf_s11.margin_top = tf_s11.margin_right = tf_s11.margin_bottom = 0

    s11_features = [
        ("Hierarchical Organizational Tree", "Native multi-tier hierarchy: Tenant (Org) -> Region (North/South) -> Branch (Indiranagar) -> Zone (Vault/Counter) -> Camera."),
        ("Strict Scoped Access (RBAC & ABAC)", "Predefined banking roles: Super Admin, Tenant Admin, SOC Operator, Branch Manager, Auditor, and Maintenance Engineer."),
        ("Branch Onboarding Wizard", "Zero-friction branch provisioning with automated ONVIF network discovery and bulk camera channel assignment in minutes."),
        ("Device-Agnostic Interoperability", "No proprietary camera lock-in. Connects seamlessly with any ONVIF Profile S/G/T or standard RTSP camera (Hikvision, Dahua, Axis, Hanwha, CP Plus)."),
        ("Immutable Security Auditing", "Every login, token grant, permission change, and camera configuration update is recorded forever in an append-only ledger.")
    ]

    for i, (title, desc) in enumerate(s11_features):
        p_t = tf_s11.paragraphs[0] if i == 0 else tf_s11.add_paragraph()
        p_t.text = f"• {title}"
        p_t.font.name = "Arial"
        p_t.font.size = Pt(12)
        p_t.font.bold = True
        p_t.font.color.rgb = ACCENT_BLUE
        if i > 0:
            p_t.space_before = Pt(10)

        p_d = tf_s11.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(2)

    img_path = os.path.join(SCREENSHOTS_DIR, "SS-013-organization-admin.png")
    if os.path.exists(img_path):
        card_img = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.0), Inches(1.7), Inches(6.533), Inches(4.7))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = CARD_BORDER
        card_img.line.width = Pt(1)

        s11.shapes.add_picture(img_path, Inches(6.15), Inches(1.85), width=Inches(6.233))

        cap = s11.shapes.add_textbox(Inches(6.0), Inches(6.45), Inches(6.533), Inches(0.3))
        tf_c = cap.text_frame
        p_c = tf_c.paragraphs[0]
        p_c.alignment = PP_ALIGN.CENTER
        p_c.text = "Organization & Multi-Branch Hierarchy Administration (/admin/organization)"
        p_c.font.name = "Arial"
        p_c.font.size = Pt(9.5)
        p_c.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 12: MEASURABLE ROI & BUSINESS IMPACT
    # ==========================================
    s12 = add_blank_slide()
    add_header(s12, "Measurable Business ROI & Operational Impact", "THE QUANTIFIABLE VALUE DELIVERED BY KRYPTONVISION")

    roi_metrics = [
        (">92% Reduction", "In False Alarms", "Compound boolean rules and intelligent cooldown state machines filter out environmental noise, letting SOC operators focus on genuine security breaches.", ACCENT_EMERALD),
        ("80% Faster", "Incident Investigation", "Multi-camera synchronized playback and visual event heatmaps slash video forensic review times from hours to just minutes.", ACCENT_CYAN),
        ("100% Compliance", "Audit Adherence", "Automated dual-custody verification, strongroom duration controls, and tamper logging ensure effortless regulatory compliance.", ACCENT_BLUE),
        ("4x Operator Scale", "Cost Optimization", "A single SOC operator can effectively monitor over 150+ cameras with intelligent automated triage, versus only 20-30 on traditional VMS.", ACCENT_AMBER)
    ]

    for i, (metric, sub, desc, col) in enumerate(roi_metrics):
        x = Inches(0.8) + i * Inches(2.95)
        y = Inches(1.8)
        w = Inches(2.8)
        h = Inches(3.8)

        card = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = s12.shapes.add_textbox(x + Inches(0.2), y + Inches(0.25), w - Inches(0.4), h - Inches(0.5))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p_m = tf.paragraphs[0]
        p_m.text = metric
        p_m.font.name = "Arial"
        p_m.font.size = Pt(24)
        p_m.font.bold = True
        p_m.font.color.rgb = col

        p_s = tf.add_paragraph()
        p_s.text = sub.upper()
        p_s.font.name = "Arial"
        p_s.font.size = Pt(11)
        p_s.font.bold = True
        p_s.font.color.rgb = TEXT_MAIN
        p_s.space_before = Pt(4)

        p_d = tf.add_paragraph()
        p_d.text = desc
        p_d.font.name = "Arial"
        p_d.font.size = Pt(10.5)
        p_d.font.color.rgb = TEXT_SECONDARY
        p_d.space_before = Pt(14)

    # Bottom comparison summary
    comp_card = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.8), Inches(11.733), Inches(1.0))
    comp_card.fill.solid()
    comp_card.fill.fore_color.rgb = CARD_BG
    comp_card.line.color.rgb = CARD_BORDER
    comp_card.line.width = Pt(1)

    tb_c = s12.shapes.add_textbox(Inches(1.0), Inches(5.92), Inches(11.333), Inches(0.75))
    tf_c = tb_c.text_frame
    tf_c.word_wrap = True
    tf_c.margin_left = tf_c.margin_top = tf_c.margin_right = tf_c.margin_bottom = 0

    p_c1 = tf_c.paragraphs[0]
    p_c1.text = "TOTAL COST OF OWNERSHIP (TCO) ADVANTAGE:"
    p_c1.font.name = "Arial"
    p_c1.font.size = Pt(11)
    p_c1.font.bold = True
    p_c1.font.color.rgb = ACCENT_CYAN

    p_c2 = tf_c.add_paragraph()
    p_c2.text = "KryptonVision works with your existing IP camera infrastructure without requiring expensive proprietary hardware replacements, slashing initial capital expenditures (CAPEX) while drastically reducing ongoing security staffing OPEX."
    p_c2.font.name = "Arial"
    p_c2.font.size = Pt(10)
    p_c2.font.color.rgb = TEXT_SECONDARY
    p_c2.space_before = Pt(2)

    # ==========================================
    # SLIDE 13: LIVE DEMO AGENDA (FOR TOMORROW)
    # ==========================================
    s13 = add_blank_slide()
    add_header(s13, "Live Demonstration Walkthrough Flow", "STRUCTURED AGENDA FOR TODAY'S PRODUCT PRESENTATION")

    steps = [
        ("Step 1: Central Command & Live Video Wall", "Experience sub-second multi-camera video streaming, dynamic grid arrangement, and instant PTZ response.", ACCENT_CYAN),
        ("Step 2: Visual Zone Designer & Rule Creation", "Watch how simple it is to draw a polygon zone over a live stream and activate a compound security rule in under 60 seconds.", ACCENT_BLUE),
        ("Step 3: Real-Time Threat Trigger & Anti-Storm Alert", "Observe live event detection in action with intelligent deduplication, cooldown suppression, and automated dispatch.", ACCENT_EMERALD),
        ("Step 4: Synchronized Playback & Forensic Investigation", "Seamlessly scrub through multi-angle historical video, inspect heatmap markers, and jump precisely to breach moments.", ACCENT_AMBER),
        ("Step 5: Evidence Packaging & Audit Integrity", "Generate a digitally signed, tamper-proof evidence bundle with cryptographic SHA-256 hash sealing.", ACCENT_ROSE),
    ]

    for i, (title, desc, col) in enumerate(steps):
        y = Inches(1.7) + i * Inches(1.0)
        h = Inches(0.85)

        card = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.733), h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Number circle / pill
        pill = s13.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), y, Inches(0.15), h)
        pill.fill.solid()
        pill.fill.fore_color.rgb = col
        pill.line.fill.background()

        tb = s13.shapes.add_textbox(Inches(1.2), y + Inches(0.12), Inches(11.1), h - Inches(0.24))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.name = "Arial"
        p1.font.size = Pt(13)
        p1.font.bold = True
        p1.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.name = "Arial"
        p2.font.size = Pt(10.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(2)

    # ==========================================
    # SLIDE 14: DEPLOYMENT MODELS & INTEGRATION
    # ==========================================
    s14 = add_blank_slide()
    add_header(s14, "Deployment Flexibility & System Compatibility", "ARCHITECTED TO FIT YOUR INFRASTRUCTURE")

    models = [
        ("On-Premises Edge Appliance", "Highest Security & Privacy", [
            "Deploys directly on local branch hardware or edge AI microservers.",
            "Zero continuous cloud bandwidth requirement.",
            "Local video storage with POSIX NVMe indexing.",
            "Ideal for high-security banking branches and air-gapped vaults."
        ], ACCENT_CYAN),
        ("Hybrid Enterprise Architecture", "Best of Both Worlds", [
            "Edge inference & local recording at branch level.",
            "Central cloud management for SOC command center & compliance.",
            "Low WAN bandwidth consumption with metadata-only synchronization.",
            "Clustered multi-branch aggregation across regional offices."
        ], ACCENT_BLUE),
        ("Fully Cloud-Managed VMS", "Maximum Scalability & Agility", [
            "Direct secure gateway streaming to cloud infrastructure (AWS/GCP/Azure).",
            "Unlimited tiered storage retention with automatic S3 archival.",
            "Global accessibility from any authenticated device or SOC terminal.",
            "Instant zero-maintenance updates and elastic scaling."
        ], ACCENT_EMERALD),
    ]

    for i, (title, subtitle, bullets, col) in enumerate(models):
        x = Inches(0.8) + i * Inches(3.95)
        y = Inches(1.8)
        w = Inches(3.75)
        h = Inches(4.9)

        card = s14.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Header accent band
        band = s14.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, Inches(0.08))
        band.fill.solid()
        band.fill.fore_color.rgb = col
        band.line.fill.background()

        tb = s14.shapes.add_textbox(x + Inches(0.25), y + Inches(0.25), w - Inches(0.5), h - Inches(0.5))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.name = "Arial"
        p1.font.size = Pt(14)
        p1.font.bold = True
        p1.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = subtitle.upper()
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_MUTED
        p2.space_before = Pt(3)

        for b in bullets:
            pb = tf.add_paragraph()
            pb.text = f"• {b}"
            pb.font.name = "Arial"
            pb.font.size = Pt(10)
            pb.font.color.rgb = TEXT_SECONDARY
            pb.space_before = Pt(8)

    # ==========================================
    # SLIDE 15: CONCLUSION & CALL TO ACTION (CLOSING)
    # ==========================================
    s15 = add_blank_slide()

    # Top accent bar
    top_bar15 = s15.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.1))
    top_bar15.fill.solid()
    top_bar15.fill.fore_color.rgb = ACCENT_CYAN
    top_bar15.line.fill.background()

    # Center card
    card_end = s15.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.5), Inches(1.2), Inches(10.333), Inches(5.2))
    card_end.fill.solid()
    card_end.fill.fore_color.rgb = CARD_BG
    card_end.line.color.rgb = CARD_BORDER
    card_end.line.width = Pt(1.5)

    tb_end = s15.shapes.add_textbox(Inches(2.0), Inches(1.6), Inches(9.333), Inches(4.4))
    tf_end = tb_end.text_frame
    tf_end.word_wrap = True
    tf_end.margin_left = tf_end.margin_top = tf_end.margin_right = tf_end.margin_bottom = 0

    pe_sub = tf_end.paragraphs[0]
    pe_sub.alignment = PP_ALIGN.CENTER
    pe_sub.text = "KRYPTONLOGIC TECHNOLOGIES"
    pe_sub.font.name = "Arial"
    pe_sub.font.size = Pt(12)
    pe_sub.font.bold = True
    pe_sub.font.color.rgb = ACCENT_CYAN

    pe_title = tf_end.add_paragraph()
    pe_title.alignment = PP_ALIGN.CENTER
    pe_title.text = "Ready to Transform Your Surveillance?"
    pe_title.font.name = "Arial Black"
    pe_title.font.size = Pt(28)
    pe_title.font.bold = True
    pe_title.font.color.rgb = TEXT_MAIN
    pe_title.space_before = Pt(8)

    pe_desc = tf_end.add_paragraph()
    pe_desc.alignment = PP_ALIGN.CENTER
    pe_desc.text = "KryptonVision upgrades existing video surveillance networks into an intelligent, proactive, and compliant security command ecosystem."
    pe_desc.font.name = "Arial"
    pe_desc.font.size = Pt(13)
    pe_desc.font.color.rgb = TEXT_SECONDARY
    pe_desc.space_before = Pt(10)

    # Next steps box
    pe_ns = tf_end.add_paragraph()
    pe_ns.alignment = PP_ALIGN.CENTER
    pe_ns.text = "RECOMMENDED NEXT STEPS: 48-HOUR PILOT / PROOF-OF-CONCEPT"
    pe_ns.font.name = "Arial"
    pe_ns.font.size = Pt(11)
    pe_ns.font.bold = True
    pe_ns.font.color.rgb = ACCENT_EMERALD
    pe_ns.space_before = Pt(20)

    pe_ns_desc = tf_end.add_paragraph()
    pe_ns_desc.alignment = PP_ALIGN.CENTER
    pe_ns_desc.text = "Deploy KryptonVision on 5-10 existing cameras in your live environment with zero disruption. Experience real-time alerts, visual rules, and synchronized playback within 48 hours."
    pe_ns_desc.font.name = "Arial"
    pe_ns_desc.font.size = Pt(10.5)
    pe_ns_desc.font.color.rgb = TEXT_MUTED
    pe_ns_desc.space_before = Pt(4)

    pe_contact = tf_end.add_paragraph()
    pe_contact.alignment = PP_ALIGN.CENTER
    pe_contact.text = "Thank You! Let's Proceed to the Live Product Demo & Q/A"
    pe_contact.font.name = "Arial"
    pe_contact.font.size = Pt(15)
    pe_contact.font.bold = True
    pe_contact.font.color.rgb = ACCENT_CYAN
    pe_contact.space_before = Pt(24)

    # Save presentation
    prs.save(OUTPUT_PPTX)
    print(f"Presentation successfully created at: {OUTPUT_PPTX}")

if __name__ == "__main__":
    create_deck()
