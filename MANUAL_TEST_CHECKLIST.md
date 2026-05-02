# TuguJewelry PIM — Manual Test Checklist
Date: 2026-05-02

## P0 — Core Workflow (run first)
- [ ] 1. Happy path: MFR creates → submits → ADMIN approves with costs → SALES prices → READY_FOR_ECOMMERCE
- [ ] 2. Admin revision loop: submit → admin requests revision → MFR edits → resubmits → admin approves
- [ ] 3. Sales revision loop: reach PENDING_SALES → sales revision → MFR resubmits → PENDING_ADMIN → admin approves → sales approves
- [ ] 4. SUPER_ADMIN force: reject product → SA override → force to DRAFT → confirm MFR can edit

## P1 — Bug Verification
- [ ] 5. Sales campaign pre-selection: price+campaign → approve → reopen → confirm campaign shows
- [ ] 6. Admin queue thumbnails: 5+ products with images → open admin queue → images show correctly
- [ ] 7. $0 selling price: enter 0 as selling price → confirm it saves without error
- [ ] 8. compareAtPrice warning: set compareAtPrice lower than sellingPrice → confirm warning shows but saves

## P2 — Validation
- [ ] 9. Negative cost blocked: enter -100 material cost → attempt submit → blocked
- [ ] 10. Missing margin blocked: admin approves without Target Margin % → blocked
- [ ] 11. Campaign >100% warning: create 150% discount → confirm warning shown, not blocked

## P3 — Permission System
- [ ] 12. Dynamic toggle: SA removes CREATE_PRODUCT from MFR → MFR cannot create → SA restores
- [ ] 13. Audit log: admin makes changes → SA opens audit log → entries visible with userId

## P4 — New Views
- [ ] 14. SA audit log: Super Admin → Audit Log nav → loads correctly
- [ ] 15. Sales all products: Sales → All Products → shows PENDING_SALES + READY_FOR_ECOMMERCE

## P5 — Edge Cases
- [ ] 16. Empty export: no READY_FOR_ECOMMERCE products → export buttons → no crash
- [ ] 17. Onboarding: clear all products → MFR dashboard shows welcome screen

## Results
Pass: 0/17
Fail: 0
Notes:
