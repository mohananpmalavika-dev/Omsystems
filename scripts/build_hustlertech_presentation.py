import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# --- COLOR PALETTE (HustlerTech Modern Dark Executive Theme) ---
BG_COLOR = RGBColor(11, 15, 25)          # Very deep tech dark #0B0F19
CARD_BG = RGBColor(22, 30, 49)           # Elevated dark card #161E31
CARD_BORDER = RGBColor(38, 51, 80)       # Card subtle border #263350
TEXT_MAIN = RGBColor(248, 250, 252)      # Bright white #F8FAFC
TEXT_MUTED = RGBColor(148, 163, 184)     # Slate silver #94A3B8
TEXT_SECONDARY = RGBColor(203, 213, 225) # Soft white #CBD5E1
ACCENT_CYAN = RGBColor(0, 210, 255)      # Electric Cyan #00D2FF
ACCENT_BLUE = RGBColor(59, 130, 246)     # Cobalt Blue #3B82F6
ACCENT_EMERALD = RGBColor(16, 185, 129)  # Success Emerald #10B981
ACCENT_AMBER = RGBColor(245, 158, 11)    # Amber Warning #F59E0B
ACCENT_ROSE = RGBColor(244, 63, 94)      # Crimson Alert #F43F5E
COLOR_WHITE = RGBColor(255, 255, 255)

SCREENSHOTS_DIR = r"c:\Omsystems\Omsystems\docs\manuals\screenshots"
HUSTLERTECH_LOGO = os.path.join(SCREENSHOTS_DIR, "hustlertech_logo.jpg")
OUTPUT_PPTX = r"c:\Omsystems\Omsystems\HustlerTech_Sales_Presentation.pptx"

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_slide_layout = prs.slide_layouts[6]

    def add_blank_slide():
        slide = prs.slides.add_slide(blank_slide_layout)
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_COLOR
        bg.line.fill.background()
        return slide

    def add_header(slide, title_text, category_text="HUSTLERTECH ENTERPRISE VMS"):
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

        line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.42), Inches(11.733), Inches(0.02))
        line.fill.solid()
        line.fill.fore_color.rgb = CARD_BORDER
        line.line.fill.background()

        footer_box = slide.shapes.add_textbox(Inches(0.8), Inches(7.05), Inches(11.733), Inches(0.3))
        tf_footer = footer_box.text_frame
        tf_footer.margin_left = tf_footer.margin_top = tf_footer.margin_right = tf_footer.margin_bottom = 0
        p_footer = tf_footer.paragraphs[0]
        p_footer.text = "HustlerTech Technologies  |  Enterprise AI Vision & Video Management System  |  Confidential Client Presentation"
        p_footer.font.name = "Arial"
        p_footer.font.size = Pt(9)
        p_footer.font.color.rgb = TEXT_MUTED

    # ==========================================
    # SLIDE 1: TITLE / COVER SLIDE
    # ==========================================
    s1 = add_blank_slide()

    top_bar = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.1))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = ACCENT_CYAN
    top_bar.line.fill.background()

    # HustlerTech Logo top right
    if os.path.exists(HUSTLERTECH_LOGO):
        logo_bg = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.6), Inches(0.55), Inches(1.9), Inches(1.9))
        logo_bg.fill.solid()
        logo_bg.fill.fore_color.rgb = COLOR_WHITE
        logo_bg.line.color.rgb = CARD_BORDER
        logo_bg.line.width = Pt(1)
        s1.shapes.add_picture(HUSTLERTECH_LOGO, Inches(10.7), Inches(0.65), Inches(1.7), Inches(1.7))

    # Brand badge
    badge = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(0.6), Inches(2.8), Inches(0.42))
    badge.fill.solid()
    badge.fill.fore_color.rgb = CARD_BG
    badge.line.color.rgb = ACCENT_CYAN
    badge.line.width = Pt(1.5)
    tf_b = badge.text_frame
    tf_b.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_b = tf_b.paragraphs[0]
    p_b.alignment = PP_ALIGN.CENTER
    p_b.text = "HUSTLERTECH ENTERPRISE AI"
    p_b.font.name = "Arial"
    p_b.font.size = Pt(10.5)
    p_b.font.bold = True
    p_b.font.color.rgb = ACCENT_CYAN

    # Main Hero Title
    title_box = s1.shapes.add_textbox(Inches(1.0), Inches(1.2), Inches(9.4), Inches(1.4))
    tf = title_box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p1 = tf.paragraphs[0]
    p1.text = "HUSTLERTECH VISION"
    p1.font.name = "Arial Black"
    p1.font.size = Pt(44)
    p1.font.bold = True
    p1.font.color.rgb = TEXT_MAIN

    p2 = tf.add_paragraph()
    p2.text = "Next-Generation Enterprise AI Vision & Unified Video Management System"
    p2.font.name = "Arial"
    p2.font.size = Pt(18)
    p2.font.color.rgb = ACCENT_CYAN
    p2.space_before = Pt(6)

    # Subtitle / Value Pitch
    sub_box = s1.shapes.add_textbox(Inches(1.0), Inches(2.65), Inches(9.4), Inches(0.9))
    tf_sub = sub_box.text_frame
    tf_sub.word_wrap = True
    tf_sub.margin_left = tf_sub.margin_top = tf_sub.margin_right = tf_sub.margin_bottom = 0
    p_sub = tf_sub.paragraphs[0]
    p_sub.text = "Autonomous Real-Time Threat Detection, Low-Latency Streaming, Visual Automation Rules, and Regulatory Compliance for Banking, NBFCs, Retail & Critical Infrastructure."
    p_sub.font.name = "Arial"
    p_sub.font.size = Pt(13)
    p_sub.font.color.rgb = TEXT_SECONDARY

    # Executive Presenter & Solutions Lead Card
    card_pres = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(3.65), Inches(11.333), Inches(1.3))
    card_pres.fill.solid()
    card_pres.fill.fore_color.rgb = CARD_BG
    card_pres.line.color.rgb = ACCENT_CYAN
    card_pres.line.width = Pt(1.5)

    tb_pres = s1.shapes.add_textbox(Inches(1.25), Inches(3.78), Inches(10.8), Inches(1.05))
    tf_pres = tb_pres.text_frame
    tf_pres.word_wrap = True
    tf_pres.margin_left = tf_pres.margin_top = tf_pres.margin_right = tf_pres.margin_bottom = 0

    p_p1 = tf_pres.paragraphs[0]
    p_p1.text = "HUSTLERTECH PRESENTATION  |  SOLUTIONS & BUSINESS DEVELOPMENT LEAD"
    p_p1.font.name = "Arial"
    p_p1.font.size = Pt(10)
    p_p1.font.bold = True
    p_p1.font.color.rgb = ACCENT_CYAN

    p_p2 = tf_pres.add_paragraph()
    p_p2.text = "Josphine Sololo — Business Development & Solutions Engineering Lead"
    p_p2.font.name = "Arial"
    p_p2.font.size = Pt(14)
    p_p2.font.bold = True
    p_p2.font.color.rgb = TEXT_MAIN
    p_p2.space_before = Pt(3)

    p_p3 = tf_pres.add_paragraph()
    p_p3.text = "Direct Contact: +254 727 417410   |   Email: jmweshsololo@gmail.com"
    p_p3.font.name = "Arial"
    p_p3.font.size = Pt(11.5)
    p_p3.font.bold = True
    p_p3.font.color.rgb = ACCENT_EMERALD
    p_p3.space_before = Pt(3)

    # Feature Highlights Row (3 mini cards)
    card_w = Inches(3.55)
    card_h = Inches(1.55)
    y_cards = Inches(5.15)

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

        t_box = s1.shapes.add_textbox(x + Inches(0.2), y_cards + Inches(0.2), card_w - Inches(0.4), card_h - Inches(0.4))
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
        y = Inches(1.8) + (i // 2) * Inches(2.05)
        w = Inches(5.75)
        h = Inches(1.9)

        card = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        pill = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, Inches(0.12), h)
        pill.fill.solid()
        pill.fill.fore_color.rgb = color
        pill.line.fill.background()

        tb = s2.shapes.add_textbox(x + Inches(0.35), y + Inches(0.18), w - Inches(0.55), h - Inches(0.36))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.name = "Arial"
        p1.font.size = Pt(14)
        p1.font.bold = True
        p1.font.color.rgb = color

        p2 = tf.add_paragraph()
        p2.text = subtitle.upper()
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_MUTED
        p2.space_before = Pt(2)

        p3 = tf.add_paragraph()
        p3.text = detail
        p3.font.name = "Arial"
        p3.font.size = Pt(10.5)
        p3.font.color.rgb = TEXT_SECONDARY
        p3.space_before = Pt(6)

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
    p_bot.text = "THE HUSTLERTECH SOLUTION: Transform passive, forensic-only cameras into an active, intelligent, deterministic defense and compliance ecosystem."
    p_bot.font.name = "Arial"
    p_bot.font.size = Pt(11.5)
    p_bot.font.bold = True
    p_bot.font.color.rgb = ACCENT_CYAN

    # ==========================================
    # SLIDE 3: SYSTEM ARCHITECTURE & CORE PLATFORM
    # ==========================================
    s3 = add_blank_slide()
    add_header(s3, "HustlerTech High-Assurance System Architecture", "END-TO-END DISTRIBUTED DESIGN")

    tb_arch = s3.shapes.add_textbox(Inches(0.8), Inches(1.7), Inches(5.2), Inches(5.0))
    tf_arch = tb_arch.text_frame
    tf_arch.word_wrap = True
    tf_arch.margin_left = tf_arch.margin_top = tf_arch.margin_right = tf_arch.margin_bottom = 0

    points = [
        ("Edge Reverse Proxy (Caddy / TLS)", "Enterprise ingress with automatic SSL/TLS termination, rate limiting, and HTTP/2 multiplexing for smooth video transport."),
        ("FastAPI / Go High-Throughput Core", "Microservices processing live metadata, WebRTC signaling, ONVIF discovery, and multi-tenant security enforcement at <20ms latency."),
        ("Distributed Redis & Celery Cluster", "Asynchronous task queue handles real-time alert deduplication, siren relay automation, and push escalations with zero lock contention."),
        ("Multi-Tier Hybrid Storage Architecture", "Hot NVMe local indexing for instant seek, paired with cold S3 compliance archiving ensuring complete regulatory retention at 1/5th cloud storage cost."),
    ]

    for i, (title, desc) in enumerate(points):
        p1 = tf_arch.paragraphs[0] if i == 0 else tf_arch.add_paragraph()
        p1.text = f"{i+1}. {title}"
        p1.font.name = "Arial"
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_arch.add_paragraph()
        p2.text = desc
        p2.font.name = "Arial"
        p2.font.size = Pt(10)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # Right Architecture Diagram Cards
    arch_cards = [
        ("INSPECTION LAYER", "YOLOv8 Edge Detectors • RTSP/ONVIF Feeds • Hardware Accelerated Decoders", ACCENT_BLUE),
        ("ARBITRATION LAYER", "Redis Fencing Tokens • Anti-Storm De-duplication • Spatial Ray-Casting", ACCENT_EMERALD),
        ("PRESENTATION LAYER", "Sub-Second WebRTC Video Matrix • React SOC Console • Mobile App Hub", ACCENT_CYAN),
        ("COMPLIANCE VAULT", "SHA-256 Audit Trail Ledger • Tamper-Proof Incident Bundles • Court-Ready", ACCENT_AMBER),
    ]

    for i, (layer, details, col) in enumerate(arch_cards):
        y = Inches(1.7) + i * Inches(1.22)
        c = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.3), y, Inches(6.233), Inches(1.1))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = col
        c.line.width = Pt(1.5)

        tb_c = s3.shapes.add_textbox(Inches(6.5), y + Inches(0.15), Inches(5.8), Inches(0.8))
        tf_c = tb_c.text_frame
        tf_c.word_wrap = True
        tf_c.margin_left = tf_c.margin_top = tf_c.margin_right = tf_c.margin_bottom = 0

        p1 = tf_c.paragraphs[0]
        p1.text = layer
        p1.font.name = "Arial"
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = col

        p2 = tf_c.add_paragraph()
        p2.text = details
        p2.font.name = "Arial"
        p2.font.size = Pt(10)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(4)

    # ==========================================
    # SLIDE 4: LIVE VIDEO WALL (SCREENSHOT 1)
    # ==========================================
    s4 = add_blank_slide()
    add_header(s4, "Real-Time Multi-Stream Command Wall (3x3 / Dynamic Matrix)", "SURVEILLANCE OPERATIONS")

    ss1_path = os.path.join(SCREENSHOTS_DIR, "SS-003-live-video-wall.png")
    if os.path.exists(ss1_path):
        s4.shapes.add_picture(ss1_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s4 = s4.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s4 = tb_s4.text_frame
    tf_s4.word_wrap = True
    tf_s4.margin_left = tf_s4.margin_top = tf_s4.margin_right = tf_s4.margin_bottom = 0

    caps_s4 = [
        ("Sub-Second WebRTC Streaming", "Live ultra-low latency streams delivered to browsers without plugins or heavy desktop client software."),
        ("Multi-Site Channel Switching", "Switch dynamically between HQ, branches, remote vault rooms, and ATMs within 200 milliseconds."),
        ("Integrated HUD Metadata", "Direct visual bounding boxes display detected personnel, badges, queue lengths, and directional paths."),
        ("Adaptive Bandwidth Scaling", "Dynamic sub-stream negotiation ensures flawless multi-view even across constrained 4G branch links.")
    ]

    for i, (head, body) in enumerate(caps_s4):
        p1 = tf_s4.paragraphs[0] if i == 0 else tf_s4.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s4.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 5: SYNCHRONIZED FORENSIC PLAYBACK (SCREENSHOT 2)
    # ==========================================
    s5 = add_blank_slide()
    add_header(s5, "Multi-Angle Synchronized Forensic Playback", "INCIDENT INVESTIGATION & EVIDENCE")

    ss2_path = os.path.join(SCREENSHOTS_DIR, "SS-004-synced-playback.png")
    if os.path.exists(ss2_path):
        s5.shapes.add_picture(ss2_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s5 = s5.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s5 = tb_s5.text_frame
    tf_s5.word_wrap = True
    tf_s5.margin_left = tf_s5.margin_top = tf_s5.margin_right = tf_s5.margin_bottom = 0

    caps_s5 = [
        ("Frame-Accurate Clock Synchronization", "Play back up to 4 camera angles simultaneously with sub-frame time lock across different physical NVRs."),
        ("Visual AI Event Heatmap", "Instantly jump directly to breach points, door openings, or perimeter motion without scrubbing dead footage."),
        ("One-Click Cryptographic Export", "Export court-admissible signed MP4 evidence packages sealed with verifiable SHA-256 integrity hashes."),
        ("Variable Playback Control", "High-speed scrubbing from 0.25x up to 32x speed with instantaneous reverse play and frame stepping.")
    ]

    for i, (head, body) in enumerate(caps_s5):
        p1 = tf_s5.paragraphs[0] if i == 0 else tf_s5.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_EMERALD
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s5.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 6: VISUAL RULE BUILDER & ZONE DESIGNER (SCREENSHOT 3)
    # ==========================================
    s6 = add_blank_slide()
    add_header(s6, "Visual No-Code Zone Designer & Compound Automation", "ENTERPRISE INTELLIGENCE ENGINE")

    ss3_path = os.path.join(SCREENSHOTS_DIR, "SS-010-ai-rules-automation.png")
    if os.path.exists(ss3_path):
        s6.shapes.add_picture(ss3_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s6 = s6.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s6 = tb_s6.text_frame
    tf_s6.word_wrap = True
    tf_s6.margin_left = tf_s6.margin_top = tf_s6.margin_right = tf_s6.margin_bottom = 0

    caps_s6 = [
        ("Geometric Polygon Canvas", "Draw precise restricted zones, tripwires, teller counter boundaries, and vault perimeters with pixel-level ray-casting."),
        ("Compound Boolean Logic", "Combine signals: IF [Zone = 'Vault'] AND [Staff_Count < 2] AND [Dwell > 10s] THEN trigger critical alert."),
        ("Multi-Action Dispatch Orchestrator", "Simultaneously sound on-site sirens, trigger SOC popup alerts, dispatch Telegram/WhatsApp notices, and place automated IVR calls."),
        ("Operational Schedule Constraints", "Enforce business-hour schedules (e.g., active during branch closing 18:30 to 09:30 only).")
    ]

    for i, (head, body) in enumerate(caps_s6):
        p1 = tf_s6.paragraphs[0] if i == 0 else tf_s6.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_BLUE
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s6.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 7: ANTI-STORM ALERT CENTER (SCREENSHOT 4)
    # ==========================================
    s7 = add_blank_slide()
    add_header(s7, "Anti-Storm Alert Operations & Intelligent Triage", "SOC INCIDENT PREVENTION")

    ss4_path = os.path.join(SCREENSHOTS_DIR, "SS-006-alert-operations.png")
    if os.path.exists(ss4_path):
        s7.shapes.add_picture(ss4_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s7 = s7.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s7 = tb_s7.text_frame
    tf_s7.word_wrap = True
    tf_s7.margin_left = tf_s7.margin_top = tf_s7.margin_right = tf_s7.margin_bottom = 0

    caps_s7 = [
        ("The Alert Storm Problem Solved", "Traditional AI systems generate 1,500 redundant alerts/min if a person lingers in a zone. HustlerTech eliminates this completely."),
        ("Distributed Redis Fencing Tokens", "Applies dynamic state cooldowns (e.g. 120s window) suppressing repeated notifications while keeping state active."),
        ("Guaranteed Human SLA (<60s)", "Triaged alerts automatically escalate to backup supervisors if not acknowledged within predefined SLA thresholds."),
        ("99.1% Operational Noise Reduction", "Operators focus exclusively on genuine security exceptions rather than clearing repetitive false alarms.")
    ]

    for i, (head, body) in enumerate(caps_s7):
        p1 = tf_s7.paragraphs[0] if i == 0 else tf_s7.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_AMBER
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s7.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 8: 36+ PRE-SEEDED BANKING/FINANCE SCENARIOS
    # ==========================================
    s8 = add_blank_slide()
    add_header(s8, "Out-of-the-Box Security Rules for Banking & NBFCs", "PRE-SEEDED REGULATORY COMPLIANCE")

    scenarios = [
        ("Dual-Custody Vault Access", "Vault & Strongroom", "Alerts immediately if only 1 individual enters the vault room without a verified second keyholder.", ACCENT_ROSE),
        ("Cash Counter Acrylic Jumping", "Teller / Cash Area", "Detects customer crossing over teller partitions into restricted teller cash drawers.", ACCENT_AMBER),
        ("Armored Cash Van Unattended Dwell", "Loading Bay / Gate", "Triggers high-priority escalation if cash vehicle is left unattended for >15 minutes.", ACCENT_BLUE),
        ("Night Movement in Strongroom", "Vault (Post-Hours)", "Instantaneous P1 critical siren and SOC dispatch for any motion detected after 18:30 closing.", ACCENT_ROSE),
        ("Camera Tampering / Occlusion", "All Branch Cameras", "Detects camera spraying, lens obscuring, defocusing, or directional displacement within 3 seconds.", ACCENT_CYAN),
        ("After-Hours Guard Absence / Sleeping", "Branch Security Post", "Monitors mandatory physical guard presence and alerts if guard is absent during night shift.", ACCENT_EMERALD),
    ]

    for i, (title, loc, desc, col) in enumerate(scenarios):
        x = Inches(0.8) + (i % 3) * Inches(3.95)
        y = Inches(1.8) + (i // 3) * Inches(2.4)
        w = Inches(3.75)
        h = Inches(2.15)

        c = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        c.line.width = Pt(1)

        pill = s8.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, Inches(0.08))
        pill.fill.solid()
        pill.fill.fore_color.rgb = col
        pill.line.fill.background()

        tb = s8.shapes.add_textbox(x + Inches(0.2), y + Inches(0.2), w - Inches(0.4), h - Inches(0.35))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = title
        p1.font.name = "Arial"
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = f"ZONE: {loc.upper()}"
        p2.font.name = "Arial"
        p2.font.size = Pt(9)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_MUTED
        p2.space_before = Pt(2)

        p3 = tf.add_paragraph()
        p3.text = desc
        p3.font.name = "Arial"
        p3.font.size = Pt(10)
        p3.font.color.rgb = TEXT_SECONDARY
        p3.space_before = Pt(6)

    # ==========================================
    # SLIDE 9: INCIDENT MANAGEMENT & EVIDENCE VAULT (SCREENSHOT 5)
    # ==========================================
    s9 = add_blank_slide()
    add_header(s9, "Incident Management & Cryptographic Evidence Vault", "FORENSIC INTEGRITY & POLICE DISPATCH")

    ss5_path = os.path.join(SCREENSHOTS_DIR, "SS-007-incident-response.png")
    if os.path.exists(ss5_path):
        s9.shapes.add_picture(ss5_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s9 = s9.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s9 = tb_s9.text_frame
    tf_s9.word_wrap = True
    tf_s9.margin_left = tf_s9.margin_top = tf_s9.margin_right = tf_s9.margin_bottom = 0

    caps_s9 = [
        ("Immutable SHA-256 Hashes", "Every video clip and incident record receives an unalterable SHA-256 cryptographic seal ensuring court admissibility."),
        ("End-to-End Investigation Lifecycle", "Transition smoothly from Initial Triage -> Under Investigation -> Law Enforcement Escalation -> Resolved."),
        ("One-Click Police Evidence Dossier", "Generate automated PDF evidence packages with embedded timestamps, operator signatures, and video download links."),
        ("Zero-Tamper Chain of Custody", "Strict RBAC controls and audit logging protect video evidence against accidental or malicious internal deletion.")
    ]

    for i, (head, body) in enumerate(caps_s9):
        p1 = tf_s9.paragraphs[0] if i == 0 else tf_s9.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_CYAN
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s9.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 10: CAMERA & STORAGE HEALTH (SCREENSHOT 6)
    # ==========================================
    s10 = add_blank_slide()
    add_header(s10, "Central Device Health, Telemetry & Storage Lifecycle", "HIGH AVAILABILITY INFRASTRUCTURE")

    ss6_path = os.path.join(SCREENSHOTS_DIR, "SS-011-camera-health.png")
    if os.path.exists(ss6_path):
        s10.shapes.add_picture(ss6_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s10 = s10.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s10 = tb_s10.text_frame
    tf_s10.word_wrap = True
    tf_s10.margin_left = tf_s10.margin_top = tf_s10.margin_right = tf_s10.margin_bottom = 0

    caps_s10 = [
        ("Real-Time Camera Uptime Monitoring", "Continuous heartbeat telemetry across thousands of channels detects offline cameras within 5 seconds."),
        ("Sub-Millisecond Clock Drift Sync", "Maintains NTP synchronization (<3ms drift) across all branch NVRs to guarantee legal validity of recordings."),
        ("Tiered Retention Management", "Automatic pruning and lifecycle rotation: 30 days local NVMe + 90 days cold S3 archival compliant with central banking norms."),
        ("Bitrate & Thermal Diagnostics", "Monitors edge encoder health, stream packet loss, and operating temperatures to preemptively replace faulty units.")
    ]

    for i, (head, body) in enumerate(caps_s10):
        p1 = tf_s10.paragraphs[0] if i == 0 else tf_s10.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_EMERALD
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s10.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 11: MULTI-TENANT & BRANCH ONBOARDING (SCREENSHOT 7)
    # ==========================================
    s11 = add_blank_slide()
    add_header(s11, "Multi-Tenant Hierarchy & 15-Minute Branch Onboarding", "SCALABILITY & ENTERPRISE GOVERNANCE")

    ss7_path = os.path.join(SCREENSHOTS_DIR, "SS-013-organization-admin.png")
    if os.path.exists(ss7_path):
        s11.shapes.add_picture(ss7_path, Inches(0.8), Inches(1.6), Inches(8.2), Inches(5.12))

    tb_s11 = s11.shapes.add_textbox(Inches(9.2), Inches(1.6), Inches(3.333), Inches(5.12))
    tf_s11 = tb_s11.text_frame
    tf_s11.word_wrap = True
    tf_s11.margin_left = tf_s11.margin_top = tf_s11.margin_right = tf_s11.margin_bottom = 0

    caps_s11 = [
        ("Geographic Tenant Hierarchy", "Organize security operations across National HQ -> Regional Clusters -> Hubs -> Individual Branch Cameras."),
        ("Automated ONVIF Discovery", "Scan local branch subnets and ingest existing Hikvision, Dahua, Axis, and CP Plus cameras with zero manual IP config."),
        ("Granular Role-Based Access (RBAC)", "Assign distinct roles: Branch Managers view local streams only; National SOC teams oversee all zones."),
        ("Edge Agent Zero-Touch Provisioning", "Branch gateways configure automatically using encrypted deployment tokens in under 15 minutes.")
    ]

    for i, (head, body) in enumerate(caps_s11):
        p1 = tf_s11.paragraphs[0] if i == 0 else tf_s11.add_paragraph()
        p1.text = f"• {head}"
        p1.font.name = "Arial"
        p1.font.size = Pt(11.5)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_BLUE
        if i > 0:
            p1.space_before = Pt(12)

        p2 = tf_s11.add_paragraph()
        p2.text = body
        p2.font.name = "Arial"
        p2.font.size = Pt(9.5)
        p2.font.color.rgb = TEXT_SECONDARY
        p2.space_before = Pt(3)

    # ==========================================
    # SLIDE 12: BUSINESS ROI & OPERATIONAL VALUE
    # ==========================================
    s12 = add_blank_slide()
    add_header(s12, "Measurable Business ROI & Operational Impact", "THE QUANTIFIABLE VALUE DELIVERED BY HUSTLERTECH")

    roi_metrics = [
        ("85%", "Reduction in False Alarms", "Eliminate alarm fatigue with deterministic Redis anti-storm token filtering.", ACCENT_EMERALD),
        ("70%", "Faster Incident Resolution", "Scrub multi-camera synchronized timeline instead of hunting across isolated DVRs.", ACCENT_CYAN),
        ("100%", "Regulatory Audit Compliance", "Immutable SHA-256 hashes & automated dual-custody verification satisfy all banking audits.", ACCENT_BLUE),
        ("4x", "Increase in Guard Productivity", "Automate routine perimeter monitoring so on-site guards focus exclusively on real verified threats.", ACCENT_AMBER),
    ]

    for i, (val, title, desc, col) in enumerate(roi_metrics):
        x = Inches(0.8) + i * Inches(2.95)
        y = Inches(1.8)
        w = Inches(2.8)
        h = Inches(3.0)

        c = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        c.line.width = Pt(1)

        b = s12.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, Inches(0.08))
        b.fill.solid()
        b.fill.fore_color.rgb = col
        b.line.fill.background()

        tb = s12.shapes.add_textbox(x + Inches(0.2), y + Inches(0.3), w - Inches(0.4), h - Inches(0.5))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = val
        p1.font.name = "Arial Black"
        p1.font.size = Pt(40)
        p1.font.bold = True
        p1.font.color.rgb = col

        p2 = tf.add_paragraph()
        p2.text = title
        p2.font.name = "Arial"
        p2.font.size = Pt(12)
        p2.font.bold = True
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

        p3 = tf.add_paragraph()
        p3.text = desc
        p3.font.name = "Arial"
        p3.font.size = Pt(10)
        p3.font.color.rgb = TEXT_MUTED
        p3.space_before = Pt(6)

    # Bottom ROI Callout Card
    card_bot2 = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(5.15), Inches(11.733), Inches(1.65))
    card_bot2.fill.solid()
    card_bot2.fill.fore_color.rgb = CARD_BG
    card_bot2.line.color.rgb = ACCENT_CYAN
    card_bot2.line.width = Pt(1)

    tb_c2 = s12.shapes.add_textbox(Inches(1.1), Inches(5.35), Inches(11.1), Inches(1.25))
    tf_c2 = tb_c2.text_frame
    tf_c2.word_wrap = True
    tf_c2.margin_left = tf_c2.margin_top = tf_c2.margin_right = tf_c2.margin_bottom = 0

    p_c1 = tf_c2.paragraphs[0]
    p_c1.text = "ZERO HARDWARE REPLACEMENT REQUIRED"
    p_c1.font.name = "Arial"
    p_c1.font.size = Pt(13)
    p_c1.font.bold = True
    p_c1.font.color.rgb = ACCENT_CYAN

    p_c2 = tf_c2.add_paragraph()
    p_c2.text = "HustlerTech works with your existing IP camera infrastructure without requiring expensive proprietary hardware replacements, slashing initial capital expenditures (CAPEX) while drastically reducing ongoing security staffing OPEX."
    p_c2.font.name = "Arial"
    p_c2.font.size = Pt(11)
    p_c2.font.color.rgb = TEXT_SECONDARY
    p_c2.space_before = Pt(4)

    # ==========================================
    # SLIDE 13: 48-HOUR RAPID ONBOARDING PROCESS
    # ==========================================
    s13 = add_blank_slide()
    add_header(s13, "Turnkey Deployment in Under 48 Hours", "SEAMLESS ADOPTION WORKFLOW")

    steps = [
        ("Step 1: Network Ingestion & Camera Discovery", "Connect edge gateway to local LAN; auto-scan ONVIF feeds and map existing cameras into organizational hierarchy.", ACCENT_CYAN),
        ("Step 2: Visual Zone & Compliance Rule Configuration", "Draw physical zones on high-risk cameras; activate pre-seeded banking templates (vault, acrylic barrier, after-hours motion).", ACCENT_BLUE),
        ("Step 3: Alert Notification & Siren Relay Integration", "Configure notification channels (SOC dashboards, SMS/WhatsApp gateways, automated IVR, physical strobe relays).", ACCENT_EMERALD),
        ("Step 4: Central SOC Command Activation", "Begin live multi-branch surveillance, synchronized forensic playback, and court-admissible incident tracking.", ACCENT_AMBER),
    ]

    for i, (title, desc, col) in enumerate(steps):
        y = Inches(1.7) + i * Inches(1.22)
        h = Inches(1.05)

        card = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), y, Inches(11.733), h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        pill = s13.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), y, Inches(0.15), h)
        pill.fill.solid()
        pill.fill.fore_color.rgb = col
        pill.line.fill.background()

        tb = s13.shapes.add_textbox(Inches(1.2), y + Inches(0.18), Inches(11.1), h - Inches(0.36))
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
        p2.space_before = Pt(4)

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

    top_bar15 = s15.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.1))
    top_bar15.fill.solid()
    top_bar15.fill.fore_color.rgb = ACCENT_CYAN
    top_bar15.line.fill.background()

    card_end = s15.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.5), Inches(0.7), Inches(10.333), Inches(6.1))
    card_end.fill.solid()
    card_end.fill.fore_color.rgb = CARD_BG
    card_end.line.color.rgb = CARD_BORDER
    card_end.line.width = Pt(1.5)

    # HustlerTech Logo at top of closing card
    if os.path.exists(HUSTLERTECH_LOGO):
        logo_c_bg = s15.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(5.85), Inches(0.95), Inches(1.6), Inches(1.6))
        logo_c_bg.fill.solid()
        logo_c_bg.fill.fore_color.rgb = COLOR_WHITE
        logo_c_bg.line.color.rgb = ACCENT_CYAN
        logo_c_bg.line.width = Pt(1)
        s15.shapes.add_picture(HUSTLERTECH_LOGO, Inches(5.95), Inches(1.05), Inches(1.4), Inches(1.4))

    tb_end = s15.shapes.add_textbox(Inches(2.0), Inches(2.7), Inches(9.333), Inches(3.9))
    tf_end = tb_end.text_frame
    tf_end.word_wrap = True
    tf_end.margin_left = tf_end.margin_top = tf_end.margin_right = tf_end.margin_bottom = 0

    pe_sub = tf_end.paragraphs[0]
    pe_sub.alignment = PP_ALIGN.CENTER
    pe_sub.text = "HUSTLERTECH ENTERPRISE VISION SYSTEMS"
    pe_sub.font.name = "Arial"
    pe_sub.font.size = Pt(11)
    pe_sub.font.bold = True
    pe_sub.font.color.rgb = ACCENT_CYAN

    pe_title = tf_end.add_paragraph()
    pe_title.alignment = PP_ALIGN.CENTER
    pe_title.text = "Ready to Transform Your Surveillance?"
    pe_title.font.name = "Arial Black"
    pe_title.font.size = Pt(26)
    pe_title.font.bold = True
    pe_title.font.color.rgb = TEXT_MAIN
    pe_title.space_before = Pt(4)

    pe_desc = tf_end.add_paragraph()
    pe_desc.alignment = PP_ALIGN.CENTER
    pe_desc.text = "HustlerTech upgrades existing video surveillance networks into an intelligent, proactive, and compliant security command ecosystem."
    pe_desc.font.name = "Arial"
    pe_desc.font.size = Pt(12)
    pe_desc.font.color.rgb = TEXT_SECONDARY
    pe_desc.space_before = Pt(6)

    # Executive Contact Box
    pe_contact_title = tf_end.add_paragraph()
    pe_contact_title.alignment = PP_ALIGN.CENTER
    pe_contact_title.text = "DIRECT CONTACT / BUSINESS DEVELOPMENT & SOLUTIONS LEAD"
    pe_contact_title.font.name = "Arial"
    pe_contact_title.font.size = Pt(10.5)
    pe_contact_title.font.bold = True
    pe_contact_title.font.color.rgb = ACCENT_EMERALD
    pe_contact_title.space_before = Pt(14)

    pe_person = tf_end.add_paragraph()
    pe_person.alignment = PP_ALIGN.CENTER
    pe_person.text = "Josphine Sololo — Business Development & Solutions Engineering Lead"
    pe_person.font.name = "Arial"
    pe_person.font.size = Pt(14)
    pe_person.font.bold = True
    pe_person.font.color.rgb = TEXT_MAIN
    pe_person.space_before = Pt(3)

    pe_phone_email = tf_end.add_paragraph()
    pe_phone_email.alignment = PP_ALIGN.CENTER
    pe_phone_email.text = "Phone: +254 727 417410    |    Email: jmweshsololo@gmail.com"
    pe_phone_email.font.name = "Arial"
    pe_phone_email.font.size = Pt(12.5)
    pe_phone_email.font.bold = True
    pe_phone_email.font.color.rgb = ACCENT_CYAN
    pe_phone_email.space_before = Pt(4)

    pe_ns = tf_end.add_paragraph()
    pe_ns.alignment = PP_ALIGN.CENTER
    pe_ns.text = "Recommended Next Steps: 48-Hour Live Proof-of-Concept Pilot  •  Zero Disruption Deployment"
    pe_ns.font.name = "Arial"
    pe_ns.font.size = Pt(10.5)
    pe_ns.font.color.rgb = TEXT_MUTED
    pe_ns.space_before = Pt(8)

    pe_closing = tf_end.add_paragraph()
    pe_closing.alignment = PP_ALIGN.CENTER
    pe_closing.text = "Thank You! Let's Proceed to the Live Product Demo & Q/A"
    pe_closing.font.name = "Arial"
    pe_closing.font.size = Pt(13)
    pe_closing.font.bold = True
    pe_closing.font.color.rgb = ACCENT_AMBER
    pe_closing.space_before = Pt(12)

    prs.save(OUTPUT_PPTX)
    print(f"Presentation successfully created at: {OUTPUT_PPTX}")

if __name__ == "__main__":
    create_deck()
