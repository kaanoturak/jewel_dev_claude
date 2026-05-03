# TuguJewelry PIM — Manual Test Checklist
Date: 2026-05-04

## P0 — Cloud & Multi-User Sync (NEW)
- [ ] 1. Firebase Login: Enter valid Email/Password → loads correct role panel.
- [ ] 2. Real-time Sync: Open app in two tabs (Tab A: MFR, Tab B: Admin) → MFR creates product → Admin queue updates without refresh.
- [ ] 3. Media Cloud Storage: Upload image in MFR form → Save → Inspect Firebase Storage console (should see image in `media/` folder).
- [ ] 4. Offline Persistence: Disable internet → Create a Draft product → Refresh app → Product should still exist in list (Firestore Cache).
- [ ] 5. Media URL Consistency: Open Admin Detail for product with image → Inspect image URL (should be `firebasestorage.googleapis.com` not `blob:`).

## P1 — Core Workflow
- [ ] 6. Happy path: MFR creates → submits → ADMIN approves with costs → SALES prices → READY_FOR_ECOMMERCE
- [ ] 7. Admin revision loop: submit → admin requests revision → MFR edits → resubmits → admin approves
- [ ] 8. Sales revision loop: reach PENDING_SALES → sales revision → MFR resubmits → PENDING_ADMIN → admin approves → sales approves
- [ ] 9. SUPER_ADMIN force: reject product → SA override → force to DRAFT → confirm MFR can edit

## P2 — Bug Verification
- [ ] 10. Sales campaign pre-selection: price+campaign → approve → reopen → confirm campaign shows
- [ ] 11. Admin queue thumbnails: 5+ products with images → open admin queue → images show correctly (Cloud URLs)
- [ ] 12. $0 selling price: enter 0 as selling price → confirm it saves without error
- [ ] 13. compareAtPrice warning: set compareAtPrice lower than sellingPrice → confirm warning shows but saves

## P3 — Validation
- [ ] 14. Negative cost blocked: enter -100 material cost → attempt submit → blocked
- [ ] 15. Missing margin blocked: admin approves without Target Margin % → blocked
- [ ] 16. Campaign >100% warning: create 150% discount → confirm warning shown, not blocked

## P4 — Permission System
- [ ] 17. Dynamic toggle: SA removes CREATE_PRODUCT from MFR → MFR cannot create → SA restores
- [ ] 18. Audit log: admin makes changes → SA opens audit log → entries visible with userId (Firebase UID)

## P5 — Edge Cases
- [ ] 19. Empty export: no READY_FOR_ECOMMERCE products → export buttons → no crash
- [ ] 20. Onboarding: clear all Firestore collections → MFR dashboard shows welcome screen

## Results
Pass: 0/20
Fail: 0
Notes:
