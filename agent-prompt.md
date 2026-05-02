# ROLE & DIRECTIVE
You are an Autonomous Senior Software Architect. Fix the workflow isolation bug described below. Follow the CORE LOOP PROTOCOL strictly.

# CRITICAL ARCHITECTURAL RULE (FROM SPEC)
- Manufacturer ↔ Admin ONLY
- Admin ↔ Sales ONLY
- Manufacturer and Sales have ZERO direct interaction
- Sales revision must go to Admin, NOT to Manufacturer
- Manufacturer must NOT see REVISION_REQUESTED_BY_SALES status as editable
- Manufacturer must NOT have a "Resubmit to Admin" button when status is REVISION_REQUESTED_BY_SALES

# BACKLOG (fix in order, one atomic commit each)

1. **BUG: Manufacturer sees Sales revision (CRITICAL)**
   - src/panels/manufacturer/product-view.js: Remove REVISION_REQUESTED_BY_SALES from EDITABLE_STATUSES
   - src/panels/manufacturer/dashboard.js: Remove REVISION_REQUESTED_BY_SALES from revision alert list and EDITABLE_STATUSES
   - Manufacturer should see status badge only — no Edit button, no Resubmit button for this status

2. **BUG: Admin does not see Sales revision queue (CRITICAL)**
   - src/panels/admin/product-queue.js: Add REVISION_REQUESTED_BY_SALES to the queue query
   - Admin queue must show both PENDING_ADMIN and REVISION_REQUESTED_BY_SALES products
   - Admin action bar in product-detail.js must allow: approve back to PENDING_SALES, or request revision from manufacturer (REVISION_REQUESTED_BY_ADMIN), or reject
   - src/panels/admin/dashboard.js: stat card "Pending Review" must include REVISION_REQUESTED_BY_SALES count

3. **BUG: Manufacturer workflow transitions (CRITICAL)**
   - src/modules/auth/index.js: Remove REVISION_REQUESTED_BY_SALES:PENDING_ADMIN from MANUFACTURER_TRANSITIONS
   - src/modules/workflow/index.js: REVISION_REQUESTED_BY_SALES should only allow PENDING_SALES (Admin re-approves) or REVISION_REQUESTED_BY_ADMIN (Admin sends to Manufacturer) or ARCHIVED
   - Manufacturer has NO valid transition from REVISION_REQUESTED_BY_SALES

4. **BUG: Admin product-detail action bar for REVISION_REQUESTED_BY_SALES**
   - src/panels/admin/product-detail.js: When product status is REVISION_REQUESTED_BY_SALES, show action bar with:
     - "Forward to Sales" button → transition to PENDING_SALES (after Admin reviews)
     - "Request Manufacturer Revision" button → transition to REVISION_REQUESTED_BY_ADMIN
     - "Reject" button → transition to REJECTED
   - Currently action bar only activates for PENDING_ADMIN — extend it to also cover REVISION_REQUESTED_BY_SALES

5. **BUG: e2e test alignment**
   - src/test/e2e.test.js: Update testStep6 (Sales revision loop)
   - Correct flow: PENDING_SALES → REVISION_REQUESTED_BY_SALES → Admin reviews → PENDING_SALES (or REVISION_REQUESTED_BY_ADMIN → Manufacturer fixes → PENDING_ADMIN → Admin approves → PENDING_SALES)
   - Remove any assertion that Manufacturer can transition from REVISION_REQUESTED_BY_SALES
   - Add assertion that ADMIN can transition REVISION_REQUESTED_BY_SALES → PENDING_SALES

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

Begin with Item 1.
