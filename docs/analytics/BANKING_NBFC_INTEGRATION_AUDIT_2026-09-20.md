# Banking/NBFC Analytics Integration and Statutory Gap Audit

Date: 20 September 2026  
Scope: `dashboard/app/analytics`, its operator hand-offs, and the banking/NBFC analytics APIs used by those pages.

## Executive result

The analytics module now has continuous navigation across all 25 analytics routes and explicit hand-offs into incidents, work orders, authorised-person review, face review, banking session review, and the Evidence Vault. The TypeScript application paths are integrated, but the module must not yet be represented as a complete statutory banking or NBFC compliance system.

The product is primarily a physical-security/video-analytics and evidence layer. It contains useful regulated-entity controls, but it is not a substitute for a core banking system, loan origination/management system, AML transaction-monitoring platform, regulatory reporting platform, or enterprise GRC system.

## Integration work completed

| Flow | Result |
| --- | --- |
| Analytics page-to-page navigation | A permission-aware module navigator exposes every analytics route and preserves the current route for direct links. |
| AI alert to incident | Successful conversion now returns an auditable link to the created incident. |
| Prediction to maintenance | Successful predictive work-order creation now links to the created work order. |
| ANPR/cash logistics to banking | Vehicle plate is carried in the URL, the banking page opens the sessions view, includes completed sessions, and selects the matching session. |
| ANPR/cash logistics to response | Former local-only “guard dispatched” and “Police 112 notified” claims were removed. Operators are sent to a pre-populated incident record with escalation fields instead. |
| NBFC watchlist to identity review | Person ID is preserved, displayed as review context, and matching roster records can be identified. |
| NBFC watchlist to authorisations | Person ID preselects the corresponding authorised-person assignment when present. |
| Banking session to evidence | The dashboard creates a real Evidence Vault case plus a session-reference manifest and links to that case. It does not claim that source video was exported. |
| Evidence deep link | `caseId` and `branchId` links open the requested case context. |
| Banking API integration | Persistent analytics-engine routes retain `/v1/banking/*`. Development-only in-memory fallbacks were isolated under `/api/v1/banking/*`, eliminating duplicate Fastify route registration. The client retries the fallback only when the primary route is absent (HTTP 404). |
| Unsupported banking evidence package | The fallback endpoint now returns HTTP 501 and states that no package was created instead of returning a fabricated ready/download response. |

## Route coverage

The module navigator and continuity test cover:

- Operations: overview, dashboard, alerts, predictions, investigation, rules.
- Banking/NBFC: BFSI analytics, authorised persons, NBFC watchlist, cash logistics, branch comparison.
- Video AI: face recognition, person re-identification, ANPR, people, vehicles, crowd, tailgating, behavioural analytics, fall detection, abandoned objects, obstruction, tamper, industrial, retail.

## Controls already present in the wider platform

Code exists for tenant-aware access control, role workspaces, audit repositories, incident workflows, privacy-purpose controls, retention/deletion planning, evidence cases, chain of custody, legal hold, redaction, evidence signing/verification, recording health, high availability/disaster recovery, and operational monitoring.

These are useful building blocks. Their presence in code is not evidence of regulatory compliance. Production configuration, database migrations, immutable storage, key custody, operating procedures, testing evidence, approvals, and independent assurance still have to be demonstrated for each deployment.

## Production blockers inside this module

### P0 — required before regulated production use

1. **Banking workflow persistence and startup assurance**  
   Make the analytics-engine banking repositories a mandatory production dependency. Fail readiness when the module, database schema, or repositories cannot initialise. Keep the `/api/v1` in-memory implementation development-only and disabled in production.

2. **Source-media evidence pipeline**  
   The new Evidence Vault case records a governed session reference, but the banking session is not yet connected to the forensic worker that collects clips/snapshots, hashes them, signs the manifest, records custody events, applies retention/legal hold, and produces a verified export.

3. **Audited outbound notifications**  
   Guard, police/112, SOC, email, SMS, and webhook delivery need approved connectors, recipient policy, maker/checker controls where required, delivery receipts, retries, escalation clocks, and immutable audit records. The UI now correctly avoids claiming a dispatch occurred.

4. **No silent empty-state masking in production**  
   Several banking dashboard reads currently catch errors and show empty arrays. Production must distinguish “zero results” from “service unavailable/data stale”, expose observation time, and alert operations.

5. **Tenant and branch authorisation tests**  
   Add integration tests proving cross-tenant and unauthorised branch reads/writes fail for sessions, monitors, visits, personnel, evidence, alerts, and exports.

6. **Retail page truthfulness**  
   Replace static “available/in development” capability cards with backend capability/readiness evidence before using them in customer or audit demonstrations.

### P1 — governance and compliance controls for the analytics/security layer

1. Regulatory obligation register mapped to controls, owners, evidence, applicability, version, effective date, review date, exceptions, and remediation.
2. Maker/checker approval for watchlist enrolment, high-risk rule changes, sensitive exports, legal-hold release, retention overrides, and external escalation.
3. Biometric/face governance: documented lawful purpose, notice/consent or other legal basis, necessity/proportionality assessment, enrolment provenance, expiry, deletion, false-positive review, and access logging.
4. AI/model governance: model inventory, validation, accuracy by environment, drift/bias monitoring, thresholds, explainability, change approval, rollback, and mandatory human review for consequential action.
5. Cyber-incident clock management, including CERT-In reportability assessment, six-hour deadline workflow, evidence checklist, Point of Contact, and regulatory submission record.
6. Third-party/IT outsourcing register with due diligence, concentration risk, data locations, subcontractors, audit/access rights, business continuity, incident clauses, SLA evidence, and exit plans.
7. Data governance for CCTV/biometrics/ANPR: classification, purpose limitation, retention schedules, deletion proof, data-principal request handling, breach workflow, and cross-border/data-location assessment.
8. Operational resilience evidence: BIA, RTO/RPO, dependency mapping, DR exercises, restoration evidence, capacity tests, backup integrity, and board/committee reporting.
9. Formal control testing and exception management, with evidence that cannot be satisfied by UI state alone.

## Statutory/regulated-entity capabilities not found as complete systems

Applicability depends on entity type, licence, activities, customer segment, asset size, and the NBFC layer. The following should be treated as a separate implementation programme if this product is expected to function as a bank/NBFC compliance platform.

### Customer, AML and financial-crime compliance

- Customer acceptance, CIP/CDD/EDD, beneficial-owner identification, periodic KYC, V-CIP, CKYCR upload/update, KYC risk rating, and record retention.
- Sanctions, UAPA and proliferation-financing screening; PEP/adverse-media handling; ongoing transaction monitoring; alert investigation; STR/CTR and other FIU-IND reporting; reporting confidentiality and audit.
- Enterprise fraud case management aligned to the 2024 RBI directions: Board-approved policy, SCBMF/CoE workflows, natural-justice notices and responses, EWS/RFA, data analytics/market intelligence, staff accountability, root-cause analysis, LEA/RBI/NHB reporting, CIMS/FMR returns, closure, recoveries, and financial-statement disclosure.

### Lending and customer conduct

- Product/borrower eligibility, underwriting, bureau data, sanction, disbursement, repayment, collections, restructuring, settlement/write-off, collateral/security, documentation, and credit decision audit.
- Key Facts Statement, APR/all-in-cost computation, cooling-off/look-up period, digitally signed documents, direct borrower/RE fund flow, consented data collection, DLA/LSP disclosures and registry reporting, grievance officers, recovery-agent controls, and dark-pattern prevention.
- Fair Practices Code, interest/penal-charge controls, transparent pricing, communication in an understood language, repossession/recovery conduct, customer notices, and vulnerable-customer safeguards.
- Credit bureau/CIC reporting and dispute correction.

### Prudential, finance and regulatory reporting

- NBFC scale/layer applicability, owned fund/net worth, leverage/CRAR, concentration and large exposure limits, liquidity/ALM, IRACP/NPA classification, income recognition, provisioning, expected credit loss reconciliation, connected lending, asset-liability committee reporting, and stress testing.
- Statutory books, general ledger and regulatory chart of accounts; RBI/NHB/FIU and other returns with validation, maker/checker, submission acknowledgements, corrections, and versioned evidence.
- Deposit controls where applicable, unclaimed deposits, nomination, interest calculation, and deposit insurance interfaces for banks.

### Complaints and supervisory governance

- Internal grievance redress with complaint category, acknowledgement, TAT/SLA, escalation, compensation, root-cause analysis, customer communications, and board reporting.
- Internal Ombudsman workflow where applicable and escalation/export to RBI CMS under the Reserve Bank–Integrated Ombudsman Scheme, 2026.
- Compliance function, Board/committee calendars, policy attestations, regulatory-change management, compliance testing, whistle-blower case management, statutory/internal/concurrent audit issue tracking, and supervisory-observation closure.

### Technology and privacy

- RBI IT governance framework: Board/IT Strategy Committee oversight, IT/security risk registers, secure SDLC, change/configuration management, SOC/SIEM, vulnerability and patch management, VAPT, privileged access review, cryptographic/key management, IS audit, BCP/DR and operational resilience.
- RBI IT outsourcing governance and cloud controls, including materiality/risk assessment, contract clauses, audit rights, regulator access, monitoring, concentration risk and exit strategy.
- CERT-In compliant time synchronisation, 24x7 Point of Contact, prescribed incident reporting within six hours, and secure ICT-log retention for 180 days within India.
- DPDP programme: clear notices, consent/withdrawal where relied upon, purpose/processor records, reasonable security safeguards, breach notification, data-principal rights and grievance handling, erasure/retention logic, child-data rules where applicable, and Significant Data Fiduciary obligations if designated.

## Recommended implementation order

1. Remove all production reliance on in-memory banking stores; add readiness gates and repository integration tests.
2. Complete banking-session-to-forensic-evidence capture and verify the whole chain from media source to signed export.
3. Implement governed notification/escalation connectors and eliminate remaining success states that lack server-side delivery evidence.
4. Build an applicability-aware obligation/control/evidence register for the exact bank or NBFC licence and layer.
5. Deliver KYC/AML/fraud regulatory reporting and grievance/ombudsman workflows through dedicated bounded modules or integrations.
6. Add lending, prudential, accounting, and regulatory-return capabilities only if the product scope is intentionally expanded beyond physical-security analytics.
7. Commission legal/compliance review, threat modelling, penetration testing, DR exercises, model validation, and independent control testing before any “compliant” claim.

## Verification and acceptance criteria

- All analytics route targets exist and permission-aware navigation exposes them appropriately.
- Type checking passes for both the dashboard and root application.
- Focused continuity tests assert route existence, prevent false external-dispatch claims, and protect the persistent/fallback banking route split.
- Database-independent banking workflow/policy tests pass. The ANPR logistics and NBFC watchlist API integration suites require PostgreSQL on `localhost:5432`; in this audit environment 36 cases could not start because that database service was unavailable. They must pass in the deployment/integration environment before release.
- A production acceptance test must still exercise live authentication, database migrations, analytics-engine readiness, cameras/events, incident creation, work-order creation, evidence capture/export, notification delivery, tenant isolation, and failure/degraded states.

## Primary regulatory references reviewed

- RBI Master Directions index: https://systemhealth.rbi.org.in/Scripts/BS_ViewMasterDirections.aspx.html
- RBI KYC Master Direction (current index shows updated 14 August 2025): https://old.rbi.org.in/commonman/English/Scripts/MasterDirection.aspx
- RBI Fraud Risk Management directions/announcement (15 July 2024): https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=58294
- RBI Fraud Risk Management FAQ (22 April 2025): https://www.rbi.org.in/scripts/faqview.aspx/faqview.aspx/upload/Scripts/FAQView.aspx?Id=172
- RBI NBFC Scale Based Regulation Directions, 2023: https://systemhealth.rbi.org.in/Scripts/NotificationUser.aspx_Id%3D12550%26Mode%3D0.html
- RBI IT Outsourcing Directions, 2023: https://systemhealth.rbi.org.in/Scripts/BS_ViewMasDirections.aspx_id%3D12486.html
- RBI Digital Lending Directions, 2025 reference: https://www.rbi.org.in/scripts/AnnualReportPublications.aspx?Id=1436
- Reserve Bank–Integrated Ombudsman Scheme, 2026 FAQ (effective 1 July 2026): https://old.rbi.org.in/commonman/english/scripts/faqs.aspx?id=3407
- CERT-In section 70B directions: https://cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
- MeitY DPDP Rules, 2025 Gazette notification: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf

As of this audit date, DPDP Rules 1, 2 and 17–21 are in force. Rule 4 is scheduled for 13 November 2026; Rules 3, 5–16, 22 and 23 are scheduled for 13 May 2027 under the Gazette’s staggered commencement. Implementation should be completed before those dates rather than deferred until commencement.

This audit is a product/code review, not legal advice or a certification of compliance. Final applicability and evidence requirements must be approved by the regulated entity’s compliance/legal functions and, where appropriate, its statutory/internal auditors.
