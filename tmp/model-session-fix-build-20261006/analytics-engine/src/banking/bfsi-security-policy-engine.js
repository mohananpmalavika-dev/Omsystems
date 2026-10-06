export class BfsiSecurityPolicyEngine {
    goldCustody = new Map();
    evaluate(input) {
        if (!input.verifiedSource || input.confidence < 0.8)
            return [];
        const action = (type, severity, code, message) => ({
            type, severity, code, message, ...(input.evidenceReference ? { evidenceReference: input.evidenceReference } : {}),
        });
        const output = [];
        if (input.zone === "atm" && input.signal === "face_concealment") {
            output.push(action("alert", "P1", "ATM_FACE_CONCEALMENT", "Face concealment detected in ATM kiosk"));
            output.push(action("speaker_warning", "P2", "ATM_DETERRENCE", "Please remove face-covering equipment and leave the ATM kiosk."));
        }
        if (input.zone === "atm" && input.signal === "person_count" && (input.count ?? 0) > 1)
            output.push(action("alert", "P1", "ATM_MULTI_PERSON", "More than one person is inside ATM kiosk"));
        if (input.zone === "atm" && ["atm_tamper", "atm_skimming", "fire"].includes(input.signal))
            output.push(action("silent_panic", "P1", `ATM_${input.signal.toUpperCase()}`, "Critical ATM physical-security signal"));
        if (input.signal === "weapon")
            output.push(action("silent_panic", "P1", "WEAPON_DETECTED", "Potential weapon detected; operator confirmation required"), action("human_review", "P1", "WEAPON_REVIEW", "Verify weapon detection immediately"));
        if (input.signal === "hands_up")
            output.push(action("silent_panic", "P1", "HOSTAGE_POSTURE", "Hands-up/hostage posture detected"));
        if (input.zone === "guard_post" && ["sleeping", "guard_absent"].includes(input.signal) && (input.durationSeconds ?? 0) >= 60)
            output.push(action("alert", "P2", "GUARD_DUTY_VIOLATION", "Guard inactivity or absence exceeds policy duration"));
        if (input.zone === "cash_counter" && input.signal === "cashier_reach_over")
            output.push(action("alert", "P2", "CASH_COUNTER_REACH_OVER", "Person crossed cash-counter exclusion boundary"));
        if (["vault", "branch_entry"].includes(input.zone) && input.signal === "door_open" && (input.authorizedStaffCount ?? 0) < 2)
            output.push(action("alert", "P1", "TWO_PERSON_PROTOCOL", "Opening/closing activity without two authorized staff"));
        if (input.zone === "shutter" && input.signal === "shutter_motion")
            output.push(action("silent_panic", "P1", "SHUTTER_TAMPER", "Rolling-shutter tampering signal detected"));
        if (["glass_break", "gunshot", "scream"].includes(input.signal))
            output.push(action("silent_panic", "P1", `AUDIO_${input.signal.toUpperCase()}`, "Critical acoustic security event"));
        if (input.zone === "gold_transit" && input.signal === "gold_pouch" && input.trackId) {
            const previous = this.goldCustody.get(input.trackId);
            if (previous && input.observedAt.getTime() - previous.lastAt > 60_000)
                output.push(action("alert", "P1", "GOLD_CUSTODY_GAP", "Gold pouch custody observation gap exceeds one minute"));
            this.goldCustody.set(input.trackId, { lastCameraId: input.cameraId, lastAt: input.observedAt.getTime() });
        }
        return output;
    }
}
