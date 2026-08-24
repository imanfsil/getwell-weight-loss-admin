# Getwell Weight Loss Admin — Fixed Build

This build addresses the current issues reported for the admin system.

## Main fixes

- Google Sheets remote storage is enabled using the existing Getwell Apps Script deployment.
- Appointment Doctor is now a dropdown controlled from Settings.
- Appointment Edit now works.
- Visit charges use dynamic `+ Add Item` blocks for:
  - Injection
  - Medication
  - Treatment
  - Additional
- Charge items and default prices are managed from **Settings → Doctors & Charges**.
- Arboleaf PDFs are read in the browser using PDF.js and common body-composition metrics are extracted into **Body Composition**.
- **Files & Photos** now shows uploaded Arboleaf PDFs and visit photos.
- Patient **Appointments** tab now displays appointment history and doctor.
- Global search now finds patients and opens the patient profile.
- Panel names are driven from Settings and **MiCare** is normalized.
- Panel claims no longer have to stay below the visit total.
- Claims can be entered against a previous visit or with **No specific visit**, including on dates when the patient did not attend.
- Panel balances can now show an **overclaimed** amount instead of being forced to RM 0.

## Google Sheets

The frontend is pointed to the existing deployed Apps Script Web App used by the previous Getwell build. The existing backend stores new visit/appointment fields through `extraJson`, so the new dynamic charge, Arboleaf and photo metadata can be persisted without changing the main sheet columns.

If the Apps Script deployment has been replaced, update the `GETWELL_SHEETS_API_URL` constant in `app.js` with the active Web App `/exec` URL.

## Notes

Arboleaf extraction works best when the PDF contains selectable text. If an Arboleaf report is image-only/scanned, the PDF will still be recorded, but automatic metric extraction may not find values.
