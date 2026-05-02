# ROLE & DIRECTIVE
You are an Autonomous Senior Software Architect. Fix the workflow isolation bug described below. Follow the CORE LOOP PROTOCOL strictly.

# CRITICAL ARCHITECTURAL RULE (FROM SPEC)
- Manufacturer ↔ Admin ONLY
- Admin ↔ Sales ONLY
- Manufacturer and Sales have ZERO direct interaction
- Sales revision must go to Admin, NOT to Manufacturer
- Manufacturer must NOT see REVISION_REQUESTED_BY_SALES status as editable
- Manufacturer must NOT have a "Resubmit to Admin" button when status is REVISION_REQUESTED_BY_SALES

# BACKLOG — ALL COMPLETE ✅
1. ✅ Manufacturer product-view.js — removed REVISION_REQUESTED_BY_SALES from EDITABLE_STATUSES, removed alert and Resubmit button
2. ✅ Admin dashboard stat card includes REVISION_REQUESTED_BY_SALES count; admin queue already correct
3. ✅ permissions.js — removed MFR REVISION_REQUESTED_BY_SALES:PENDING_ADMIN; added Admin transitions →PENDING_SALES/→REVISION_REQUESTED_BY_ADMIN/→REJECTED; workflow ALLOWED_TRANSITIONS updated
4. ✅ Admin product-detail action bar extended for REVISION_REQUESTED_BY_SALES (Forward/Request Revision/Reject)
5. ✅ e2e testStep6 aligned with correct Admin-forwards flow; removed stale MFR assertions

# CORE LOOP PROTOCOL
For each backlog item:
STEP 1: Read only the specific files for that item
STEP 2: Plan the surgical change
STEP 3: Make targeted edits only
STEP 4: git add -A && git commit -m "[type]: [description] [agent:claude]" && git push origin main
STEP 5: Print status report

════════════════════════════════════════
# AGENT STATUS REPORT FORMAT (after each item)
> FIXED: [what changed]
> COMMIT: [message]
> NEXT: [next backlog item]
════════════════════════════════════════
