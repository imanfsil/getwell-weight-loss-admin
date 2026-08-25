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

### Sheets it creates

`Patients`, `Appointments`, `Visits`, `Charges`, `Claims`, `Files`, `Settings`

Each has a stable ID in column A and an `UpdatedAt` column.
Any extra columns you add to the right are never read or
written, so they are safe for your own notes.

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
panels, charge items and prices, appointment statuses, patient
statuses, patient ID format, follow-up thresholds, and which
Dashboard/Report sections are shown. There are no separate
hardcoded lists on individual pages.

## Panel claims

Claims are deliberately **not** capped at the value of a single
visit. A claim can be split across several dates, backdated,
future-dated, linked to a visit or entered with **No specific
visit** on a day the patient did not attend.

## Working offline

The app runs from `localStorage` and stays fully usable when
Google is unreachable; it syncs when the connection returns.
