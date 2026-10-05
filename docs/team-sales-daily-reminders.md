# Team Sales daily reminders

Follow Up Due scheduling and ingress-age rules apply to both Agent and Team Sales. Hourly New reminders apply only to Team Sales. Agent distribution, CALL NOW and eligibility remain unchanged.

- Follow Up Due: Contacted only, 24 hours from the last changed note or entry into Contacted. Leaving Contacted removes the lead; returning starts a new timer.
- Grouped owner-only due push: 09:00, 15:00, 21:00 Asia/Kuala_Lumpur.
- Grouped owner-only New push: hourly 10:00 through 16:00 Asia/Kuala_Lumpur, including 13:00.
- No Admin reminders. Replaces the former 15/60-minute and Admin summary contract.
- More than 15 days from `created_at`: New/Contacted in either mode become Need Follow Up. History and assignment ownership are retained; pending assignments are resolved as Need Follow Up, not as successful contact. Scheduler checks every minute; inactive brands are skipped.
- One outbox row per owner/type/date/hour. A 15-minute slot window permits scheduler recovery without duplicate sends. Delivery and every retry revalidate current owner, assignment revision, status, activity timestamp, active brand/account and slot expiry.
- Push opens the matching Follow Up section. Client-side generic reminders are disabled for production accounts in both modes.

Release migration and notification worker together after PostgreSQL/permissions tests; cancel queued legacy Team Sales reminders. No physical-device push delivery claim can be made from local tests.
