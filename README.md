# Getwell Weight Loss Admin

Vanilla HTML/CSS/JS admin system for the Getwell weight-loss
programme, backed by Google Sheets + Google Drive through a
Google Apps Script web app.

## Files

| File | Purpose |
|---|---|
| `index.html` | Dashboard |
| `patients.html` | Patient list + Add Patient |
| `patient-profile.html` | One patient: visits, charges, body composition, files, appointments, claims |
| `appointments.html` | Appointment list + Add/Edit Appointment |
| `panel.html` | Panel/insurance claim tracking |
| `reports.html` | Monthly performance report + PDF export |
| `settings.html` | All configurable data |
| `app.js` | Shared logic: storage, sync, settings readers, shell/sidebar/header |
| `styles.css` | All styling |
| `Code.gs` | **Google Apps Script backend** (see below) |

## Stability build — 26 August 2026

This build intentionally disables automatic 30-second Google Sheets polling in the browser. The application must never interrupt a staff member who is navigating, typing into a form, or working inside a modal. Existing create/edit/delete actions continue to use the Google Sheets backend.

Use `getwellManualSync()` from the browser console when an explicit remote refresh is required. The frontend no longer performs a background page refresh or automatic cross-tab re-render while staff are working.

## 2026-08-28 — Verified writes (Google Sheets is the record)

### What was wrong

A visit was written to `localStorage`, posted to Apps Script, and
then announced as saved **without anyone checking that a row had
appeared in the `Visits` sheet**. Two separate defects:

1. **`saveVisit()` ignored the result.** `upsertPatient()` returns
   the outcome of the Sheets write. `patient-profile.html` threw
   that value away and showed the green *"Visit saved
   successfully."* toast unconditionally.

2. **`ok:true` was treated as proof, and it is not.** The old
   `doPost()` answered `ok:true` as soon as it had run to the end,
   whatever it had actually written. A deployment that is behind
   this file, that writes to a differently-named tab, or that runs
   out of execution time after the `Patients` sheet all answer
   `ok:true` — which is exactly the reported symptom: the patient
   appears, the visit does not, and nothing complains.

Then a third defect turned the failed save into data loss:

3. **The browser trusted its own copy as the baseline.**
   `saveStore()` called `getwellSetRemoteBaseline(snapshot)` with
   local, unconfirmed data. On the next 30-second poll the
   synchroniser saw a visit that "used to be in the sheet" and was
   no longer there, concluded it had been deleted, and removed it
   from `localStorage` too. That is why the visit appeared briefly
   and then vanished.

### What changed

| Piece | Behaviour |
|---|---|
| `verifyIds()` in `Code.gs` | After writing, reads the ID column back **off the sheet** and returns which IDs are genuinely on a row. |
| `doPost` → `save` | `ok:true` now means *every record you sent was read back off a row*. Anything less is `ok:false` plus a `missing` map. |
| `getSheetContext()` | Sheets are found case-insensitively and trimmed, and **columns are addressed by header text**, not by array position — so a renamed tab or a reordered/inserted column no longer writes into the wrong place or silently creates a duplicate tab. |
| `upsertRows()` | Reports records with a blank ID instead of dropping them; leaves rows whose values are unchanged completely untouched (large sheets no longer risk the execution-time limit). |
| `getwellVerifyRemoteSave()` | The browser compares the IDs it sent against `verified` and refuses to call the save successful otherwise. |
| The outbox (`GETWELL_UNCONFIRMED_V1`) | Records written here but not yet confirmed on a row. They are retried on every sync and **can never be removed by the synchroniser**. |
| Baselines are tagged | Only a snapshot that genuinely came back out of Google Sheets (`source:"remote"`) may authorise removing anything. |
| `getwellAnnounceSave()` | Every "…saved successfully" message in the app goes through one function that checks the result first. |

### Is `localStorage` still used?

Yes, as a **cache and an outbox** — never as the database.

- **Cache** so pages render instantly and the clinic keeps working
  when Google is unreachable.
- **Outbox** so a write that failed is retried rather than lost.
- Administrator profile, activity log, session lock and theme stay
  local by design; none of that is clinical data.

Clear the browser's storage and the complete patient, visit,
charge, appointment and claim history is rebuilt from the sheets.

### Redeployment is required

`Code.gs` changed, so the deployed script must be updated or the
app will (correctly) refuse to confirm any save:

1. Sheet → **Extensions → Apps Script**, replace `Code.gs`, Save.
2. Run **`setupGetwell()`** once.
3. **Deploy → Manage deployments → edit → Version: New version**.
4. Open the `/exec` URL with `?action=diagnose` — it should report
   `"version": "2026-08-28.verified-writes.1"` and list your tabs.

In the browser console, `getwellDiagnose()` prints the same thing
plus anything still queued in the outbox.

## Setting up the Google Sheets backend

`Code.gs` is the backend. It was missing from earlier builds,
which is why the front end and the deployed script could drift
apart. Install it like this:

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with the file from this
   project. Save.
3. Run **`setupGetwell()`** once from the editor and grant the
   permissions it requests. This creates the six sheets, their
   header rows, and the `onEdit` trigger.
4. **Deploy → New deployment → Web app**
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**

   "Anyone" is required. With "Only myself" the browser gets a
   Google login page instead of JSON and every save fails.
5. Copy the `/exec` URL into `GETWELL_SHEETS_API_URL` near the
   top of the Google Sheets section of `app.js`.
6. After any later change to `Code.gs`, re-deploy with
   **Manage deployments → edit → Version: New version**, or the
   old code keeps serving.

### One-time step after this update

Re-paste `Code.gs`, run **`setupGetwell()`** once, then
**re-deploy the web app** (Manage deployments → edit → Version:
New version). `setupGetwell()` now also switches the calendar-date
columns (`Patients.DOB`, `Patients.StartDate`, `Appointments.Date`,
`Visits.Date`, `Claims.ClaimDate`) to plain-text format and repairs
any cell an earlier version stored as a real date or an ISO
timestamp.

`repairGetwellDates()` does the repair on its own and is safe to
re-run at any time. Nothing else on a row is touched and
`UpdatedAt` is deliberately left alone, so the repair does not
make every record look newer than the copies in staff browsers.

The front end repairs the same values on its own as it reads
them, so the app is correct even before you run this — the
Apps Script step is what stops the Sheet itself from
re-introducing the shift.

### Sheets it creates

`Patients`, `Appointments`, `Visits`, `Charges`, `Claims`, `Files`, `Settings`

Each has a stable ID in column A and an `UpdatedAt` column.
Any extra columns you add to the right are never read or
written, so they are safe for your own notes.

## Background synchronisation never reloads the page

Synchronisation is unchanged in what it does — it still reads
the Sheet on load and every 30 seconds, merges per record, and
pushes local-only records back. What changed is **how the
result reaches the screen**.

It used to call `location.reload()`. That threw the whole
document away, so an open Add Visit / Edit Patient / Add
Appointment / Add Claim / Panel Detail modal disappeared
mid-typing, the active patient tab reset to Overview, and
search boxes cleared. Worse, the equal-timestamp branch of the
merge compared records with a raw `JSON.stringify()`, and a
record that has merely round-tripped through the Sheet is never
byte-identical to the local one (the Sheet does not store
`visit.injection`, `visit.dose`, `visit.medication`,
`visit.additionalTreatment`, `visit.otherName`,
`appointment.source`, `appointment.autoGenerated`,
`appointment.followUpDays`, `appointment.sourceVisitId` or
`appointment.manuallyEdited`, and it adds
`ProfilePhotoDriveID` / `ProfilePhotoUrl`). The merge therefore
reported "the remote copy changed" on **every single poll**, so
the page reloaded every 30 seconds whether or not anything had
actually changed.

Both halves are fixed:

| Piece | What it does |
|---|---|
| `getwellCanonicalPatient()` | Projects a record down to exactly the fields that survive a Sheet round-trip, in stable order and stable types. `getwellSameRecord()` uses it, so a sync reports a change only when the data genuinely differs. |
| `getwell:data-updated` | Fired on `document` after a merge. Every page listens and re-renders its own lists in place. No reload anywhere. |
| `getwell:settings-updated` | Same idea for configuration changes, including the cross-tab `storage` listener that used to reload. |
| `getwellUiBusy()` | True while a modal is open or a form control has focus. |
| `getwellRequestUiRefresh()` | **The guard.** If the user is busy, the merged data is still written to `localStorage` but the re-render is *queued*, never run. It replays the moment the modal closes or focus leaves — driven by `focusout`, `click`, Escape and a `MutationObserver` on class changes, not a timer. |
| `getwellRefreshInPlace()` | Restores the scroll offset around a re-render so the page never jumps. |

What each page preserves through a background sync:

- **Patient profile** — open modal and every field in it, the
  active tab (Overview / Visits / Body Composition / Files &
  Photos / Appointments / Panel Claims).
- **Patients** — the search box text and the filtered rows.
- **Appointments** — the search box, the date filter, and the
  Add/Edit Appointment and Follow Up Now modals.
- **Panel** — the panel filter, the search box and the Panel
  Detail modal.
- **Reports** — the selected report period.
- **Dashboard** — the Programme Overview period.
- **Settings** — everything. `settings.html` is the settings
  *editor*, so it is the one page a sync never re-renders and
  never overwrites; it shows a one-line notice and the user
  chooses when to pick the change up with Cancel.

## How the two-way sync behaves

- **Web → Sheets.** Saves upsert records by stable ID. Existing rows are updated in place; new rows are appended. Unrelated rows are never cleared.
- **Sheets → Web.** The app reads the current Sheets snapshot on load and every 30 seconds.
- **Sheets deletion → Web.** The browser keeps the last successful authoritative Sheets snapshot. If a patient, appointment, visit or claim existed in that snapshot and is now absent from a successful Sheets response, the corresponding active local record is removed from the frontend and localStorage. A failed request is never treated as deletion.
- **Web deletion → Sheets.** Web deletes are diffed against the last successful/persisted snapshot and sent as explicit ID-based deletion requests. The Apps Script deletes only those matching rows, including child rows belonging to a deleted patient.
- **Conflicts.** Existing `UpdatedAt` timestamps remain the conflict mechanism for records present on both sides. The Sheet remains the shared persistent backend.
- **Settings.** System settings, including appointment types and follow-up configuration, are also synchronized through the `Settings` sheet.
- **Failures.** Failed writes are surfaced to the user and local data is retained until synchronization succeeds.

## ID series

| Record | Format |
|---|---|
| Patient | `GW-0001` (prefix and width configurable in Settings) |
| Appointment | `APT-000001` |
| Visit | `VIS-000001` |
| Claim | `CLM-000001` |
| File | `FILE-…` |

## Files and photos

Photos and Arboleaf PDFs are uploaded to a Google Drive folder
named **Getwell Patient Files**; only `{id, name, url}` is
stored in the sheet. This is deliberate: a Sheets cell holds at
most 50,000 characters, so base64 images stored inline would
break the save entirely.

If Drive is unreachable the file is kept in this browser only
and is clearly badged **This device only** in Files & Photos.


## Administrator menu ("A" avatar, top right)

| Item | What it does |
|---|---|
| **My Profile** | Name, role, email, phone and a photo or initials for the administrator. The avatar, sidebar card and menu all follow it. |
| **Notifications** | One combined feed: follow-up due, follow-up overdue, upcoming appointments (next 7 days), panel balance still to claim, suspended panel patients and Google Sheets sync problems. Every patient-related alert opens that patient. |
| **Activity Log** | Add / edit / delete of patients, appointments, visits and claims, plus Settings saves and administrator changes. Date-time, user, action, record and detail, with record-type, action and free-text filters. |
| **Account Settings** | The administrator account only — name, email, phone, role, notification preferences, appearance (theme + density) and an optional local screen passcode. The system-wide `settings.html` page is unchanged. |
| **Logout** | Asks for confirmation, then locks the screen. It writes a session flag only: no patient record, Google Sheet row or Drive file is touched, and signing back in restores everything. |

All of this lives in `localStorage` under `GETWELL_ADMIN_*`, `GETWELL_ACTIVITY_LOG_V1`
and `GETWELL_SESSION_V1`. None of it is written to the Google Sheet, so the sheet
schema is exactly as before.

## Navigation

Every page renders the same sidebar through `shell()` in `app.js`:

```
MAIN         🏠 Dashboard   👤 Patients   📅 Appointments
MANAGEMENT   🏥 Panel       📊 Reports    ⚙️ Settings
```

The active page stays highlighted. Modules switched off in
Settings → Features are still hidden, as before.

## Responsive behaviour

- Below 900 px the sidebar becomes a slide-out drawer opened by the ☰ button,
  with a backdrop, an X, Escape and auto-close on navigation.
- Below 640 px (and in phone landscape) the search box collapses to a ⌕ button
  that opens a full-width search bar; notifications, theme and the A avatar stay
  in the header at all times.
- Forms use 44 px controls and 16 px text on touch widths so iOS does not zoom
  on focus.
- Modals are flex columns: the header and footer stay put and only the body
  scrolls, so a modal always fits inside the screen, including a phone in
  landscape.
- Tables scroll inside `.table-wrap`; the page itself never scrolls sideways.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding keeps content clear
  of notches and home indicators.


## Patient profile photos

Every patient can have a profile picture. It is uploaded
through the **same Apps Script `uploadFile` action** the visit
photos and Arboleaf PDFs already use, so it lands in the
existing **Getwell Patient Files** folder in Google Drive.

| Field on the patient | Synced to Sheets | Holds |
|---|---|---|
| `photoDriveId` | yes → `ProfilePhotoDriveID` | Drive file ID |
| `photoUrl` | yes → `ProfilePhotoUrl` | Drive direct-view URL |
| `photoLocal` | **never** | data-URL fallback, this device only |

The image itself is never written to a Sheets cell. Before any
request leaves the browser, `getwellSanitizeForRemote()` strips
`photoLocal` (and any leftover base64 on visit photos) out of
the payload.

If Drive is unreachable the photo is kept in this browser and
badged **This device only**; uploading again once Drive is back
replaces it with a Drive-hosted copy.

Controls live in two places, both driven by the same code:
the pencil button on the patient hero, and the **Profile Photo**
block at the top of Edit Patient. Removing a photo clears the
reference and the patient's initials come back. The Drive file
itself is left in place, exactly as visit photos behave.

### Two new columns

`Code.gs` adds `ProfilePhotoDriveID` and `ProfilePhotoUrl` to the
**Patients** sheet. They are appended **after** `UpdatedAt` on
purpose, so every column that already exists keeps its position
and no existing row has to be rewritten. Patients saved before
this change simply read back with two empty values.

Run **`setupGetwell()`** once after updating `Code.gs` to write
the two new headers, then re-deploy the web app. Your own extra
columns should now start to the right of column T.

## Settings

Everything in Settings feeds the rest of the app: doctors,
**visit types**, charge items and prices, panels, appointment
statuses, patient statuses, patient ID format, follow-up
thresholds, and which Dashboard/Report sections are shown.
There are no separate hardcoded lists on individual pages.

### Visit types

**Settings → Doctors & Charges → Visit Types** feeds the Visit
Type dropdown on Add Visit. It is stored as `settings.visitTypes`
inside the existing configuration object, so it travels through
the same `Settings` sheet (one JSON blob under the key `SYSTEM`)
as everything else — **no schema change and no new sheet**.

Each entry is `{id, name, enabled}`, the same shape as a charge
item. The toggle hides a type from *new* visits; Delete removes
it from the list. Neither touches a visit already saved with
that type, because a visit stores the type **name** on its own
row in the `Visits` sheet.

### Removing a charge item or a visit type

Historical data is never rewritten. A visit's charges carry
their own `itemName` and `price` in the `Charges` sheet, so a
past visit keeps showing `Tirzepatide 2.5mg` after that item is
removed from Settings. When such a visit is reopened for
editing, the dropdown re-adds the stored value labelled
*(disabled in Settings)* or *(not in Settings)* rather than
resetting the field to blank — which is what used to erase the
name on the next save.

## Calendar dates

Visit Date, Date of Birth, Program Start Date, Appointment Date
and Claim Date are **calendar dates**, stored everywhere as
plain `YYYY-MM-DD` strings.

They are never converted into a JavaScript `Date` and then
serialised with `toISOString()`. In Malaysia (GMT+8) that turns
`2025-11-13` into `2025-11-12T16:00:00.000Z` — the previous day.
`getwellDateKey()` in `app.js` is the single normaliser; it also
converts any value already stored as an ISO timestamp back to
the calendar day the user originally picked, and `store()` runs
it over the whole store on every read.

On the Sheets side, `Code.gs` forces the date columns to
plain-text (`@`) number format before writing, so Google Sheets
cannot re-parse `"2025-11-13"` into a date/time value, and
`toDateKey()` formats using the **spreadsheet's** timezone
rather than the script project's.

## Panel claims

Claims are deliberately **not** capped at the value of a single
visit. A claim can be split across several dates, backdated,
future-dated, linked to a visit or entered with **No specific
visit** on a day the patient did not attend.

## Working offline

The app runs from `localStorage` and stays fully usable when
Google is unreachable; it syncs when the connection returns.


## 2026-08-26 Save/Synchronization Stability Update

The frontend no longer blocks a normal visit/patient/appointment save when the deployed Google Apps Script is missing or behind on the `deleteRecords` action. The current state is saved first; failed deletion synchronization is queued locally for retry instead of producing the misleading red error that previously appeared after a successful save.

The included `Code.gs` supports the `deleteRecords` action. If the Google Apps Script deployment is older than this file, redeploy the script as a **New version** so queued deletions can synchronize normally.

### Financial Summary — Miscellaneous
The patient financial summary now includes **Total Miscellaneous**, calculated from visit charges in the existing **Additional** category. This keeps the existing charge-category structure unchanged while making miscellaneous charges visible in the patient financial breakdown.



Financial summary update: Total Miscellaneous is calculated from visit charges in the Additional category and is displayed as a fifth breakdown card. The breakdown uses a responsive 5-column layout on desktop and wraps on smaller screens.

## 2026-09-03 — Editable "Next Expected" with a Confirmed status

### What changed

The **Next Expected** column on the Appointments page was read-only
and always showed `last visit + follow-up interval`. Staff had no way
to record a date a patient had actually agreed to.

That automatic calculation is unchanged. What is new is that a staff
member can override it, and the override is marked **Confirmed**.

| | Before | After |
|---|---|---|
| Date | `2026-10-28` | `2026-10-30` |
| Label | Expected | Confirmed |

### How it works

Two **optional** fields were added to the patient record:

| Field | Sheet column | Values |
|---|---|---|
| `patient.nextExpectedDate` | `NextExpectedDate` | `"YYYY-MM-DD"` or empty |
| `patient.nextExpectedStatus` | `NextExpectedStatus` | `"confirmed"` or empty |

`getwellPatientNextExpected()` in `app.js` is the single place that
decides which date is shown:

* no override → the automatic date, labelled **Expected**
* `nextExpectedStatus === "confirmed"` → `nextExpectedDate`, labelled **Confirmed**

`nextExpectedStatus` is only ever **set**, never cleared, so a date
that has been confirmed stays Confirmed however many times it is
later rescheduled. The automatic calculation never writes over a
confirmed date, so recording a new visit cannot silently drag a
staff-confirmed date back to an expected one.

### Backward compatibility

The two sheet columns are appended to the right of `ProfilePhotoUrl`.
`getSheetContext()` in `Code.gs` already adds any canonical column the
sheet does not have yet, to the right of everything already present, so
an existing spreadsheet gains them without a single existing column
moving and without any row being rewritten. A patient row saved before
this change reads back with both cells empty, which means "no override"
— it keeps its automatic date and is **not** marked Confirmed.

### Not to be confused with Upcoming Appointment

They are separate and stay separate:

* **Next Expected** — the follow-up expectation, on the patient record.
* **Upcoming Appointment** — a real booked row in `patient.appointments`.

`getwellSaveNextExpectedDate()` touches neither `patient.appointments`
nor `patient.visits`, and nothing in the appointment flow writes the
two Next Expected fields.

### Persistence

Editing the date goes through the existing verified-write path —
`getwellSaveNextExpectedDate()` → `upsertPatient()` → `saveStore()` →
`getwellRemoteSave()` — so the table is only updated after Google Sheets
has read the row back and confirmed it. `localStorage` remains a cache
and an outbox, never the record of truth.

If the deployed Apps Script is older than these columns it will answer
`ok:true` while quietly dropping the two fields. The front end detects
that from the backend version string and reports the save as failed
rather than pretending it worked. **Re-paste `Code.gs`, run
`setupGetwell()`, and re-deploy as a New version.**

## 2026-09-05 — Excel history import

The historical workbook *GW M2 & R3 COST* is loaded through a new
page, `import.html`, fed by a generated data file, `import-data.js`.
Two files were touched: `app.js` gained one sidebar entry, and the
`?v=` cache-busting stamp on every page moved to
`20260905-excel-import` so browsers actually pick up the new
`app.js`. Nothing else in the application changed.

### Why a page and not a script

Google Sheets is the database. A record only exists once
`verifyIds()` has read its ID back off a row, and that check lives
in the browser. So the import runs where every other write runs —
through `upsertPatient()` → `saveStore()` → `getwellRemoteSave()`.
There is no second storage path and no bulk back door.

### What the import writes

| Workbook column | Becomes |
|---|---|
| VISIT DATE | the visit's date, and the claim date |
| INVOICE | the **Visit Total** |
| CLAIMED | a **Panel Claim** on the patient |
| INJECTION | *ignored* |
| GRAND TOTAL / TOTAL CLAIMED / BALANCE | *ignored* — the app computes its own |

The workbook does not say how an invoice splits between medication,
consultation and injection, and `visitTotal()` is the sum of a
visit's charges. So the whole amount goes onto **one** charge line
named *"Imported invoice total — breakdown not yet entered"*. The
visit therefore shows the right total immediately, and the line is
an ordinary charge: open the visit, split it, delete the
placeholder. Nothing is read-only and no breakdown was invented.

`CLAIMED` deliberately does **not** go into the visit's Panel /
Self-Pay fields. A claim can exist with no invoice, an invoice with
no claim, and the two amounts routinely differ, so claims are their
own records — 211 of the imported claims have no invoice on their
row.

### Running it twice is safe

Every imported visit and claim carries a stable key in its Notes,
e.g. `[XL41-R10-V]` — workbook patient 41, sheet row 10, Visit.
Notes round-trip to the Sheet, so the key survives sync, a browser
reset and a different computer. The importer reads those keys back
out of the store before it plans anything, so a second run has
nothing to do. Two legitimate visits on the same date are *not*
collapsed — they have different keys.

### Existing patients

A workbook name that matches a patient already in the system is
never created again and never overwritten. It is listed under
*Possible duplicates* and nothing happens to it unless you tick its
box, and even then only visits and claims whose key is absent are
appended. Existing personal details, visits, claims and patient IDs
are not read, rewritten or renumbered.

### ID allocation

`getwellNextVisitId()` and friends re-parse the whole store on
every call to find the highest number in use — correct for one
visit typed at a desk, unworkable for ~1,900 of them, and the
patient allocator would also hand the same `GW-XXXX` to two
patients inside one unsaved chunk. `makeAllocator()` in
`import.html` finds the highest number once per chunk from the
working copy and continues the same series, using the same
prefixes, widths and Settings-driven patient format. The IDs are
indistinguishable from ones the forms produce, and
`getwellAdvancePatientNumber()` is called exactly as
`patients.html` calls it.

### Chunking

`saveStore()` posts the whole store, so the import is applied eight
patients at a time and each chunk is verified against Google Sheets
before the next starts. A chunk that fails stops the run and says
why; everything already verified stays saved, and its keys make the
re-run skip it.

### Dates

Roughly half the visit dates had already been parsed by Excel, some
of them reading a typed `DD/MM` as `MM/DD`. Each one was resolved
against that patient's own visit chronology: 378 were corrected
with proof, 21 were confirmed already correct, and 78 that
chronology could not separate were flagged rather than silently
decided. `IMPORT_REPORT.md` lists every single one.

## 2026-09-05 — import fix (build .2)

Two defects in build .1, both found against the live Sheet.

### 1. The backend was never deployed

`Code.gs` lives inside the Apps Script project, not on GitHub Pages.
Uploading the ZIP updated the frontend only, so the deployed backend
was still the old `doPost()` that answers a save with
`{ok:true, savedAt:...}` and no `verified` map. `getwellVerifyRemoteSave()`
correctly refuses to call that a successful write, so **every** save
failed — the import and any visit typed in by hand. The fix is a
deployment step, not a code change: paste `Code.gs`, run
`setupGetwell()`, deploy a new version.

`GETWELL_SHEETS_API_URL` in `app.js` now points at the redeployed
endpoint. A *new* deployment gets a new `/exec` URL; editing the
existing deployment instead would have kept the old one.

### 2. Name matching created duplicates of existing patients

The workbook holds short names, the app holds full legal names:

| App | Workbook |
|---|---|
| MAHMOOD SALLEHUDDIN AL-RAZI BIN RAZI | 1. MAHMOOD SALLEHUDDIN |
| FARAH NABILAH BINTI MOHD ZOLKAFLY | 2. FARAH NABILAH |

Matching on the exact string missed all five patients already in the
system and would have created a duplicate of each. `matchExistingPatients()`
now also matches when the workbook name is the start of the full name,
or when every word of it appears in the full name in order. More than
one candidate is never guessed at — it is listed under *Needs your
decision* and skipped.

Those five patients were typed in by hand, so their visits carry no
import key. `existingRecordCounts()` therefore also treats a workbook
visit as already present when the patient holds a visit on the same day
for the same total, and a claim when the date and amount match. Dates
go through `getwellDateKey()` on both sides, because rows written before
the date-only fix hold a full UTC timestamp — `2025-11-12T16:00:00.000Z`
is 13 November in GMT+8, and comparing the raw strings reports every
visit as new.

Verified against a replica of the live data: 116 patients created, 5
matched and appended to, 68 records correctly skipped as already
present, 0 duplicates, 0 ambiguous. Re-running adds nothing.
