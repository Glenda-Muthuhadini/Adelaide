# Adelaide bookings

Project: `zhezlhajzdzdyronuxao` (Adelaide wellness spa).

## Use the website

Serve this directory over HTTP for development and HTTPS in production. Start at `booking.html` for account-free customer bookings or `admin-login.html` for staff. Opening the files directly is unsuitable for authentication and recovery redirects.

The owner account is `adivhahomudau3@gmail.com`. It has been created with email already confirmed, as requested. Its generated initial password is supplied privately in the chat handoff and is never saved in the repository. Sign in, open the account avatar, and change the initial password. Changing a password signs out the session. Customers have no registration flow; the old signup URL explains owner-managed access.

## Profile display names

Dashboard floating confirmation notifications have been removed completely. Successful changes update their table or form directly; errors remain visible inline.

Sign-in uses the user returned by Supabase's password response and then checks live staff membership. Dashboard startup runs its fresh identity check, membership check and protected data request concurrently, then renders only after all succeed. No permission result is cached. Admin/auth loaders skip the fixed 300ms wait and 500ms removal delay; public-page loaders keep their existing animation. The sign-in button immediately shows **Signing in…** and prevents duplicate submissions. `node .qa/check-login-speed.cjs` verifies request sequencing, permission rejection, retry feedback and loader timing with mocked network responses. Actual response time still depends on the connection and Supabase.

Click the account avatar in the dashboard header, open **Profile settings**, enter **Your name**, and click **Save name**. The name is saved in Supabase and updates the avatar initials, personalised dashboard greeting, Staff table, Staff reports and public-page profile tooltip. Owners retain the Owner role. Staff can also edit their own display name; neither can change another account, email, role or status through this form. Blank names and names longer than 100 characters are rejected. Unsaved name edits remain in the form during background refreshes.

## Scheduling rules

Public **Book now** links open a shared, accessible booking dialog on every public page. Service cards preselect their treatment, and offer cards preselect their promotion. The dedicated `booking.html` URL remains available for direct links and browsers without dialog support. The form and review are separate screens, Back preserves details, and confirmed receipts offer an optional WhatsApp link plus the spa number to save. Opening WhatsApp does not automatically subscribe the customer or add a contact.

Single-option services and offers show their treatment duration and price as fixed text; options remain selectable when there are multiple choices. This applies equally to the header's general booking form and preselected service cards. Ultimate Relaxation is configured as a 60-minute treatment at its existing R450 advertised price, as specified by the owner. The extra introductory, availability-success and review instructions have been removed.

After confirmation, a separate **Keep in touch** dialog appears above the receipt, with Open WhatsApp, Maybe later and Close actions. Dismissing it leaves the confirmed booking and reference visible. Popup scrollbars are hidden while scrolling remains enabled. Clicking outside dialogs dismisses them through their existing cancellation guards; an in-flight or interrupted booking confirmation stays protected until its outcome is known.

The customer APIs (`spa_customer_catalogue`, `spa_customer_availability`, `spa_customer_quote`, `spa_customer_submit`) read active catalogue data, validate linked extras and calculate all prices in the database. Promotion price rows contain their underlying treatment/duration; configure that in **Specials & Promotions → Edit → Bookable treatment & duration**. Couples Specials offer Swedish (R500/couple) or Hot Stone (R700/couple), plus linked extras. Existing optional extras take place within the advertised treatment time, as confirmed by the owner. Add-on flat prices apply once per booking; Sip & Paint is per person. Quotes and selected add-ons are saved with the appointment and shown in its admin detail view.

Group Wellness uses its advertised group price tiers, combining groups of four plus the remainder for larger parties. Exactly 10 guests receive 20% off that treatment total: R1,600 + R1,600 + R900 = R4,100, less 20% = **R3,280**. Physical sessions still follow live capacity, independent of the pricing calculation. Services without a configured duration direct customers to contact the spa rather than reserving an invented treatment time.

- The entire spa can treat **four people total**, across all services. Each service also has a four-person ceiling. These limits cannot be increased through the dashboard.
- Starts and occupancy checks use a 30-minute grid, in `Africa/Johannesburg`.
- Individual bookings and parties of up to four remain together. Groups over four are split into consecutive sessions using the capacity available throughout each session. If a required consecutive session has no spaces, the whole request fails; it never silently skips to another time.
- Treatment options support 30, 60 and 90 minutes. All sessions and preparation must fit operating hours: Monday–Saturday 09:00–17:00 and Sunday 09:00–14:00, in South African time.
- Preparation is **provisionally zero minutes**, because the actual requirement is unknown. Admins can configure the spa default and service overrides in 30-minute increments. Preparation reserves each person's space; later sessions start after that preparation. Existing reservations keep their original preparation allocation when settings change.
- Customer bookings are **confirmed immediately** when the full requested schedule is available. No administrator approval is required, and confirmed bookings do not expire as pending holds. Date, service, duration and group changes automatically refresh available starting times. If a time fills after review, the database rejects the booking without a partial reservation; the customer sees the problem immediately and can choose another available time or date without losing contact details.
- Staff-created telephone, WhatsApp and walk-in appointments use a two-step dialog flow: enter details, then review the client, complete group schedule and total price in a separate pop-up. **Confirm and schedule** calls `spa_admin_schedule`, which reserves and confirms all sessions in one database transaction. Back/Escape preserves the draft. Review alone never reserves capacity, and capacity or price changes must pass the database check again at confirmation. Interrupted confirmation retries reuse the same request ID.
- Pending-hold and expiry support remains for legacy/internal pending records only. New customer submissions use the `online` source and are inserted as confirmed inside the capacity-reservation transaction. If a network response is lost, the customer retries the same immutable booking payload and UUID before changing details, preventing duplicates when the first attempt actually succeeded.
- Rejection and cancellation immediately release capacity. Completion is allowed only after all treatment sessions have ended. Completed reservations retain their historical time allocation.
- Rescheduling excludes only the booking being moved, checks every new session, then replaces its allocations in the same transaction. A failure rolls back the whole change. The agreed booking price is retained.

## Catalogue and pricing

**Services**, **Add-ons** and **Specials & Promotions** now open as tables with Add buttons and Edit/Delete actions. A single dialog form opens for the selected item. **Staff** is a table of actual authorised accounts, currently the owner only. The Calendar and Availability navigation tabs and the dashboard's schedule panel are removed. The dashboard shows summary cards first, quick-action cards directly below, and then the full-width appointments list.

Service forms cover name, category, description, inclusions, photo upload, advertised price, individual 30/60/90-minute price options, preparation time and status. Prices can cover one or two people. Removing a duration disables that option while preserving historical booking references. Deleting a service removes it from the live catalogue and disables its booking options, retains historical records, and refuses deletion while active reservations exist. Deleted services no longer appear in the admin table. Adding the same service again restores its catalogue identity and keeps its appointment history.

Services and specials/promotions use **Upload an image** with a device file picker and preview, rather than a path/URL textbox. JPG, PNG and WebP files up to 5 MB are uploaded when Save is pressed. Editing keeps the existing photo unless a replacement is selected or Remove photo is pressed. Supabase's public `spa-catalogue` bucket serves marketing images; uploads require active staff membership and a live Auth session. The bucket enforces size and MIME restrictions. Files receive unique names, so replacements do not overwrite shared photos or retain an old cached image. A successful upload is reused if the catalogue save needs retrying. Existing public service and promotion cards load their saved photos from the catalogue, retaining template photos when the catalogue request fails. Removing a photo clears its catalogue association; older stored objects are retained to avoid breaking shared references.

`node .qa/check-image-upload-api.cjs` checks binary requests, signature/type/size validation, authentication and upload failures with mocked HTTP. `node .qa/check-image-upload-ui.cjs` checks service/offer file pickers, previews, replacements, removal, failed uploads and save retries, mobile forms, and public card photo updates with mock APIs. `.qa/image-upload-permissions.sql` verifies bucket restrictions and owner/staff/customer/guest/revoked-session access in a rolled-back live database transaction.

Add-on forms cover name, description, one or more price options, status, standalone treatment availability, applicable services and applicable promotions. The three published add-on therapies and four optional promotion extras are imported with their original prices. No service compatibility is invented: published standalone therapies are marked standalone, while extras are linked to the promotions that actually advertise them. Add-on selection and charging in customer bookings are not connected yet.

Promotion forms cover name, description, inclusions, photo path, multiple labelled prices or percentage discounts, optional start/end dates and status. All four website promotions are imported, including couples price variants and every Group Wellness price tier and its 20% group-of-ten discount. Optional extras are kept in the add-on catalogue rather than mixed into the promotion's base price options.

The database contains the published standard service names. Only known duration/price pairs can be booked online. Treatments without a published duration remain WhatsApp enquiries until an admin adds an option. Couples Retreat prices cover two people and require even group sizes; other seeded prices are per person.

Special promotions are enquiries on the offers page until their full treatment schedules and pricing rules are configured. The standard booking flow uses the live database catalogue. Public marketing cards retain their supplied text and prices; when changing the catalogue, update those static marketing cards too.

## Database and access

All application tables have RLS. Public clients can read active catalogue entries and call narrowly scoped availability, quote and submission functions. They cannot read booking records, customer contacts, staff membership, blocked-time reasons or private notes, and cannot write tables directly.

Public RPC wrappers use `SECURITY INVOKER`. Privileged implementations live in the unexposed `spa_private` schema with fixed empty search paths, fully qualified relations and explicit execution grants. Admin operations check both owner-managed membership in `spa_admins` and an existing Supabase Auth session. User metadata cannot grant access. Revoking membership or deleting a session blocks later database requests immediately.

Every reservation, status change, reschedule and configuration mutation locks the same settings row before reading capacity. Direct browser DML is revoked even for authorised admins. The planner and inserts execute in one transaction. Quote fingerprints require renewed review when price, preparation, hold duration or the group schedule changes. UUID request identifiers make interrupted submission retries idempotent, with payload validation to reject changed requests.

The frontend uses the project's **publishable** key only. Auth tokens are held in tab-scoped `sessionStorage`, refreshed through Supabase Auth, and removed on logout. No passwords, customer records or secret/service-role keys are saved in files. Auth session tokens remain subject to normal browser script security: serve only trusted site scripts over HTTPS.

## Staff provisioning

The signed-in owner can open **Staff → Add staff** and enter the staff member's name, email and an initial password of at least 12 characters. New accounts are created with email already confirmed; no invitation or confirmation email is sent. Staff sign in with that email/password and can change their password through their account avatar. If the email already belongs to an Auth account, the owner can grant it staff access while retaining its existing password. The form explicitly explains this behaviour.

Only the owner sees the Add staff button. Other staff see the staff table without account-management actions. Creation calls the deployed `manage-staff` Edge Function, which verifies the caller's Supabase Auth session and live owner membership. The Auth Admin key stays in the function environment. The membership RPC checks owner permission again and always grants the non-owner `admin` role. Neither customers nor ordinary staff can grant access or become an owner by changing browser state or user metadata.

Authorised owners and staff see a profile icon in all seven public-page headers. It links back to `admin-dashboard.html` after checking database membership and the current Auth session. Guests and authenticated users without staff membership see no icon. Navigation, logout, tab focus and session changes recheck or clear the icon; stale asynchronous checks cannot restore it after sign-out.

As a trusted database-owner fallback, membership can still be granted to an existing Auth user through the SQL editor:

```sql
insert into public.spa_admins(user_id, role)
select id, 'admin' from auth.users
where lower(email) = lower('STAFF_EMAIL_HERE')
on conflict(user_id) do update set active = true;
```

To remove access, set that membership's `active` field to `false` in the trusted SQL editor. Public registration cannot grant staff permissions. The dashboard's staff creation action is restricted to owners; it cannot create or promote another owner.

## Password recovery and production setup

The preconfirmed owner can sign in immediately without clicking a confirmation email. Forgotten-password recovery still uses an email link, because it must prove control of the mailbox.

The final Supabase security advisor reported no application-table or function security findings. It did report that [leaked-password protection is disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This account-level Auth setting must be enabled in the Supabase dashboard if available on the project's plan; the connected tools do not expose an Auth-configuration update operation. The generated owner password is random rather than a reused password. Performance advice only identifies indexes not yet used on the empty new tables; retain the foreign-key and scheduling indexes as bookings begin.

Before public launch, set the real HTTPS site URL and allow `https://YOUR_DOMAIN/admin-reset-password.html` in Supabase **Authentication → URL Configuration**. Configure SMTP for reliable recovery email delivery. No recovery email was sent during testing. An invalid or missing recovery link leaves the reset form disabled.

Customer and staff booking flows confirm appointments directly after checking availability. Staff contact the customer using the stored phone/email details if changes are needed; automatic booking email/SMS delivery is not configured. No customer messages are sent by the current code.

## Reports and PDF exports

The Reports tab contains **Appointments, Clients, Services, Add-ons, Specials & Promotions and Staff**. Each category has a table preview and a Download PDF button. Download all reports combines the six categories into one PDF. Reports cover all records currently available to the authorised staff member; clients are deduplicated from booking email/phone contact details.

Exports include full group session schedules, stored totals, catalogue prices and duration variants, promotion discounts and inclusions, add-on associations, and staff names/emails/roles/status. They do not include passwords or private appointment notes. Deleted catalogue entries stay out of current-catalogue reports; historical appointments keep their stored treatment names and prices.

Before every download, the site refreshes the protected admin data to revalidate the staff session. PDF generation runs entirely in the browser and sends no report records to another service. PDFs use branded, paginated pages and a searchable Unicode text layer, with repeated table headers and continuation support for long rows. The combined export starts each category on a new page.

## Verification

`.qa/profile-name.sql` verifies saving names for owner/staff, shared identity and report values, Unicode names, validation, unchanged permissions, own-account-only updates and rejection of guests, customers and revoked sessions. It rolls back all fixtures. `node .qa/check-profile-name.cjs` tests the profile form, saved-name feedback, avatar/greeting/table/report updates, reload, preserved drafts, escaping and 320/390/768/1440px layouts using a mock API.

`node .qa/check-reports.cjs` verifies six report previews, six native individual PDF downloads, the combined download, PDF object offsets, group schedules, multi-page rows, Unicode text, promotion prices and staff records, mobile layouts and export rejection after session revocation. It uses mock customer records. The sample `.qa/reports-all.pdf` and `.qa/report-pagination.pdf` contain test data only.

`.qa/automatic-booking.sql` verifies immediate guest confirmation, group allocations, lost-response retries, confirmed capacity retention, full-slot rejection, alternative times and cancellation. `node .qa/check-automatic-booking.cjs` tests automatic availability, immediate feedback, preserved contact details, confirmed receipts, interrupted-connection recovery and the themed Appointments search field using a mock API. The optional extra live HTTP concurrency run was not executed because automatic approval review hit its usage limit; the live-database transaction tests and browser checks passed.

`.qa/staff-booking-review.sql` verifies atomic confirmed staff bookings, complete group allocations, safe retries, cancelled-request protection, capacity changes after review, automatic customer confirmation and staff permissions. `node .qa/check-appointment-review.cjs` verifies the separate review pop-up, Back/Escape, reviewed-value submission, inline errors, double-click prevention and 8px dashboard buttons at 320, 390, 768 and 1440 pixels, using a mock API. Review screenshots are saved as `.qa/appointment-review-*.png`.

`.qa/staff-permissions.sql` verifies live owner-only grants, staff/customer denial, user-metadata spoofing resistance, viewer-role flags, public identity and logout revocation inside a rolled-back transaction. `node .qa/check-staff-edge.cjs` tests the function handler with mocked Auth responses. `node .qa/check-staff-api.cjs` reads owner QA credentials through hidden stdin and tests real account creation, immediate sign-in, denied staff/guest creation, retry behaviour and logout. Its temporary account has been removed after the recorded successful run. `node .qa/check-staff-ui.cjs` verifies owner/staff button visibility and public-header icons for owners, staff, customers and guests across nine viewport widths; it uses mocked session identities.

`.qa/catalogue-database.sql` tests the imported catalogue, owner listing, service/add-on/promotion writes, discounts, deletion, history preservation and admin permissions inside a rolled-back transaction. `node .qa/check-catalogue.cjs` tests tables, add/edit/delete dialogs and association validation with a mock API and a snapshot of the imported catalogue at 320, 390, 768 and 1440 pixels. Screenshots are saved as `.qa/catalogue-*.png`. `check-addons.cjs` now delegates to this newer catalogue test. The older `.qa/addons-database.sql` remains usable for the original add-on permission scenarios.

`.qa/booking-database.sql` runs integration scenarios inside a transaction and rolls back all fixtures. It covers durations, individuals, couples, large groups, partial slots, shared capacity, overlapping intervals, closing times, preparation, expiry, cancellation, rejection, retry integrity, blocked times, private notes, admin permissions, session revocation and atomic rescheduling.

`.qa/check-booking.cjs` drives installed Chrome against a temporary local HTTP server and the real Supabase API. Supply `{ "email": "...", "password": "..." }` over its hidden stdin, never command arguments or repository files. It tests guest review/submission, admin login/actions, mobile overflow, logout and recovery-link validation. Its identifiable booking fixtures use `qa-browser@example.invalid`; remove those test rows through the trusted database connection after a run. Browser screenshots and results are stored in `.qa/` without passwords.

The simultaneous submission test sends two independently issued requests against the same last four spaces; exactly one must succeed. Its temporary reservations are removed after verification.

`.qa/customer-popups.sql` verifies both Couples choices, linked add-on prices, unchanged treatment length, confirmed submission, safe retries, private records, shared capacity, group tiers/discounts and closing times in a rolled-back live transaction. `node .qa/check-customer-popups.cjs` verifies header/service/offer entry points, service preselection, optional extras, separate review, Back, group sessions, mobile layouts at 320/390/768/1440px, interrupted confirmation retries, immediate capacity rejection and the optional WhatsApp action with a mock API. The new customer submit API was also checked with competing three-person requests: only one was accepted; fixtures were removed.

Earlier `check-auth.cjs` and `check-dashboard.cjs` target the former frontend-only preview and are historical tests. Use the new live booking tests for authentication and booking behaviour. The old `js/admin-dashboard.js` is retained as preview source and is not loaded by the live dashboard.
