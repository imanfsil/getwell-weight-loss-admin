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

`Patients`, `Appointments`, `Visits`, `Charges`, `Claims`, `Files`

Each has a stable ID in column A and an `UpdatedAt` column.
Any extra columns you add to the right are never read or
written, so they are safe for your own notes.

## How the two-way sync behaves

- **Web → Sheets.** Every save posts the store and the backend
  **upserts by ID**: a matching row is updated in place, a new
  ID is appended. Nothing is ever cleared, so rows and columns
  you maintain by hand survive.
- **Sheets → Web.** The app polls every 30 seconds and on load.
  Records are **merged per patient**, not wholesale replaced.
- **Conflicts** are resolved by `UpdatedAt`. The web app stamps
  it on save; the installable `onEdit` trigger stamps it when a
  human edits the sheet. Newest wins, in both directions.
- **Failures are reported.** A save that does not reach Sheets
  raises a red on-screen message and a console error. It is
  never silent.

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
