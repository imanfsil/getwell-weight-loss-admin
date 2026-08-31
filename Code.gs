/* =========================================================
   GETWELL WEIGHT LOSS ADMIN
   GOOGLE APPS SCRIPT BACKEND  (Code.gs)

   This file did not exist in the project. The web app was
   calling an Apps Script deployment whose source was not in
   the repository, so the contract between the two could not
   be verified. This is that contract, written explicitly.

   ---------------------------------------------------------
   WHAT IT GUARANTEES
   ---------------------------------------------------------

   1. UPSERT, NEVER CLEAR-AND-REWRITE.
      Every save matches on the stable ID column and updates
      that single row, or appends if the ID is new. Rows the
      web app did not send are left completely untouched, so
      columns and records you maintain by hand survive.

   2. TWO-WAY.
      doGet() reassembles the sheets into the nested shape the
      front end expects, so a row typed by hand in Google
      Sheets appears in the web app on the next sync.

   3. LAST-WRITE-WINS, BOTH DIRECTIONS.
      Every row carries UpdatedAt. The web app stamps it on
      save; the installable onEdit trigger stamps it when a
      human edits the sheet. The front end merges per record
      using that stamp, so neither side silently wins.

   4. NO SILENT FAILURE.
      Every response is JSON with an explicit ok:true/false
      and a human-readable error string.

   ---------------------------------------------------------
   INSTALLATION
   ---------------------------------------------------------

   1. Open your Google Sheet -> Extensions -> Apps Script.
   2. Replace the contents of Code.gs with this file. Save.
   3. Run setupGetwell() once from the editor and grant the
      permissions it asks for. This creates the sheets, the
      header rows and the onEdit trigger.
   4. Deploy -> New deployment -> Web app.
        Execute as:      Me
        Who has access:  Anyone
      "Anyone" is required. With "Only myself" the browser
      receives a Google login page instead of JSON and every
      save fails.
   5. Copy the /exec URL into GETWELL_SHEETS_API_URL at the
      top of the Google Sheets section in app.js.
   6. Re-deploy (Manage deployments -> edit -> Version: New)
      after any change to this file, or the old code keeps
      serving.
========================================================= */


/* ---------------------------------------------------------
   CONFIGURATION
--------------------------------------------------------- */

/*
  Bumped whenever the contract with the front end changes. The
  web app reads it back on every save; if it is absent or older
  than the build the front end expects, the front end says so
  instead of pretending the record was stored. This is what
  makes "the deployment is behind the code" a visible error
  rather than a silent one.
*/
var GETWELL_BACKEND_VERSION = "2026-08-31.verified-writes.3";

var GETWELL_DRIVE_FOLDER = "Getwell Patient Files";

var SHEETS = {
  PATIENTS:     "Patients",
  APPOINTMENTS: "Appointments",
  VISITS:       "Visits",
  CHARGES:      "Charges",
  CLAIMS:       "Claims",
  FILES:        "Files",
  SETTINGS:     "Settings"
};

/*
  Column order is fixed by these header arrays. Extra columns
  you add to the right of them are never read and never
  written, so they are safe for your own notes.
*/
var HEADERS = {
  Patients: [
    "PatientID","Name","Initials","Status","PanelProvider","OtherPanelName",
    "PanelStatus","PanelSuspensionNote","Phone","DOB","Gender","Height",
    "StartingWeight","CurrentWeight","GoalWeight","StartDate","Doctor",
    "UpdatedAt",

    /*
      PROFILE PHOTO — added 2026-08.

      Deliberately appended AFTER UpdatedAt so that every
      column already in the sheet keeps its exact position and
      no existing row has to be rewritten. Rows saved before
      this change simply read back with two empty values,
      which the front end treats as "no photo yet".

      Only the Drive ID and the Drive URL are stored. The
      image itself lives in the Getwell Patient Files folder
      in Google Drive, exactly like visit photos, because a
      Sheets cell holds at most 50,000 characters.
    */
    "ProfilePhotoDriveID","ProfilePhotoUrl"
  ],
  Appointments: [
    "AppointmentID","PatientID","Date","Time","Doctor","Type","Status",
    "Notes","UpdatedAt"
  ],
  Visits: [
    "VisitID","PatientID","Date","VisitNumber","Type","Weight",
    "InvoiceReference","Notes","PanelAmount","SelfPayAmount","Status",
    "PdfName","PdfFileId","PdfUrl","ArboleafMetricsJson","ArboleafText",
    "UpdatedAt"
  ],
  Charges: [
    "ChargeID","VisitID","PatientID","Category","ItemID","ItemName","Price",
    "Notes","UpdatedAt"
  ],
  Claims: [
    "ClaimID","PatientID","ClaimDate","Amount","VisitID","Status","Notes",
    "UpdatedAt"
  ],
  Files: [
    "FileID","PatientID","VisitID","Name","MimeType","DriveFileID","Url",
    "UploadedAt"
  ],
  Settings: [
    "Key","Value","UpdatedAt"
  ]
};


/*
  CALENDAR-DATE COLUMNS.

  ROOT CAUSE OF THE ONE-DAY SHIFT
  ---------------------------------------------------------
  These columns hold a calendar date, not an instant in time.
  The web app sends the exact string the user picked, e.g.
  "2025-11-13". Writing that into a cell whose number format
  is "Automatic" makes Google Sheets PARSE it and store a real
  date/time value instead. Reading it back then hands this
  script a Date object, and rendering that Date in any
  timezone other than the one the sheet used produces the day
  before -- which is how "2025-11-13" came back as
  "2025-11-12T16:00:00.000Z" in GMT+8.

  Every column listed here is forced to plain-text ("@")
  format before it is written, so the string that goes in is
  byte-for-byte the string that comes out. toDateKey() below
  still repairs any value that was stored as a real date by an
  earlier version of this script.
*/
var DATE_COLUMNS = {
  Patients:     ["DOB","StartDate"],
  Appointments: ["Date"],
  Visits:       ["Date"],
  Claims:       ["ClaimDate"]
};


/*
  The timezone the SHEET used when it parsed a date cell.
  Session.getScriptTimeZone() is the Apps Script project's
  timezone, which is not necessarily the spreadsheet's; when
  the two differ, formatting a cell Date with the script's
  timezone is exactly what moves the day.
*/
function getBookTimeZone(){
  try{
    return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()
      || Session.getScriptTimeZone();
  }catch(error){
    return Session.getScriptTimeZone();
  }
}


/* Forces the calendar-date columns of one sheet to plain text.
   Columns are located by header TEXT, so this still works after
   somebody inserts or reorders a column. */
function applyDateColumnFormat(name){
  var columns = DATE_COLUMNS[name];
  if(!columns || !columns.length) return;

  var context = getSheetContext(name);
  var sheet   = context.sheet;
  var rows    = Math.max(sheet.getMaxRows() - 1, 1);

  columns.forEach(function(column){
    var position = context.map[column];
    if(!position) return;
    sheet.getRange(2, position, rows, 1).setNumberFormat("@");
  });
}


/* ---------------------------------------------------------
   SETUP
--------------------------------------------------------- */

function setupGetwell(){
  /*
    getSheetContext() creates the sheet if it is missing, writes
    the header row if the sheet is blank, and appends any
    canonical column this sheet does not have yet to the RIGHT of
    the existing ones. Columns that already exist are never
    moved, renamed or reordered, so no existing row is disturbed.
  */
  Object.keys(HEADERS).forEach(function(name){
    getSheetContext(name);
  });

  /*
    Force every calendar-date column to plain text so Sheets
    stops re-parsing "2025-11-13" into a date/time value, and
    repair any cell an earlier version already stored that way.
  */
  Object.keys(DATE_COLUMNS).forEach(function(name){
    repairDateColumns(name);
  });

  installGetwellEditTrigger();

  return "Getwell setup complete. Sheets, date columns and the onEdit trigger are ready.";
}


/*
  ONE-TIME REPAIR, safe to run again at any time.

  Reads each calendar-date column, converts whatever is there
  (a real Date value, a full ISO timestamp, a dd/mm/yyyy
  string) into a plain "YYYY-MM-DD" string, switches the column
  to plain-text format and writes the clean values back.

  Nothing else on the row is touched, and UpdatedAt is left
  alone so the repair does not make every record look newer
  than the copies in staff browsers.
*/
function repairDateColumns(name){
  var columns = DATE_COLUMNS[name];
  if(!columns || !columns.length) return {repaired:0};

  var context = getSheetContext(name);
  var sheet   = context.sheet;
  var lastRow = sheet.getLastRow();

  applyDateColumnFormat(name);

  if(lastRow < 2) return {repaired:0};

  var repaired = 0;

  columns.forEach(function(column){
    var position = context.map[column];
    if(!position) return;

    var range  = sheet.getRange(2, position, lastRow - 1, 1);
    var values = range.getValues();
    var next   = [];
    var touched = false;

    for(var i = 0; i < values.length; i++){
      var original = values[i][0];
      var clean    = original === "" || original === null ? "" : toDateKey(original);
      if(clean !== original){ touched = true; repaired++; }
      next.push([clean]);
    }

    if(touched) range.setValues(next);
  });

  return {repaired:repaired};
}


/* Repairs every date column in the whole workbook. */
function repairGetwellDates(){
  var total = 0;
  Object.keys(DATE_COLUMNS).forEach(function(name){
    total += repairDateColumns(name).repaired;
  });
  return "Repaired " + total + " calendar-date cell(s) to YYYY-MM-DD.";
}


function installGetwellEditTrigger(){
  var book = SpreadsheetApp.getActiveSpreadsheet();

  var already = ScriptApp.getProjectTriggers().some(function(trigger){
    return trigger.getHandlerFunction() === "getwellOnEdit";
  });

  if(already) return;

  ScriptApp.newTrigger("getwellOnEdit")
    .forSpreadsheet(book)
    .onEdit()
    .create();
}


/*
  Stamps UpdatedAt when a human edits a row, so a manual sheet
  edit wins over an older copy cached in a browser. Without
  this, hand-edited rows would look stale to the merge and get
  overwritten on the next save.
*/
function getwellOnEdit(event){
  try{
    var sheet = event.range.getSheet();
    var name  = sheet.getName();
    var headers = HEADERS[name];

    if(!headers) return;

    var stampColumn = headers.indexOf("UpdatedAt") + 1;
    if(stampColumn < 1) return;

    var row = event.range.getRow();
    if(row === 1) return;

    /* Do not recurse when the script itself wrote the stamp. */
    if(event.range.getColumn() === stampColumn) return;

    sheet.getRange(row, stampColumn).setValue(new Date().toISOString());
  }catch(error){
    console.error("getwellOnEdit failed: " + error);
  }
}


/* ---------------------------------------------------------
   SHEET RESOLUTION  (requirement 8: sheet name detection)

   getSheetByName() is exact and case-sensitive, so a tab that
   a human renamed to "visits" or that carries a stray trailing
   space used to look MISSING. The old code then quietly created
   a SECOND sheet and wrote to that one, which is one way the
   tab you are looking at stays empty while the script reports
   success. Resolution is now exact-first, then trimmed and
   case-insensitive.
--------------------------------------------------------- */

function findSheetByName(name){
  var book  = SpreadsheetApp.getActiveSpreadsheet();
  var exact = book.getSheetByName(name);
  if(exact) return exact;

  var wanted = String(name).trim().toLowerCase();
  var all    = book.getSheets();

  for(var i = 0; i < all.length; i++){
    if(String(all[i].getName()).trim().toLowerCase() === wanted) return all[i];
  }

  return null;
}


function getSheet(name){
  var sheet = findSheetByName(name);
  if(sheet) return sheet;

  var book = SpreadsheetApp.getActiveSpreadsheet();
  sheet = book.insertSheet(name);
  sheet.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
  sheet.getRange(1, 1, 1, HEADERS[name].length).setFontWeight("bold");
  sheet.setFrozenRows(1);

  return sheet;
}


/* ---------------------------------------------------------
   COLUMN MAPPING  (requirement 9: header/column mapping)

   The old code addressed columns by their POSITION in the
   HEADERS array. That silently writes into the wrong columns
   the moment somebody inserts a column, reorders two of them,
   or renames one. Every read and write now resolves columns by
   the header TEXT actually present in row 1.

   A canonical column the sheet does not have yet is appended to
   the RIGHT of everything that is already there, so existing
   columns never move and no existing row has to be rewritten.
--------------------------------------------------------- */

function getSheetContext(name){
  var canonical = HEADERS[name];
  if(!canonical) throw new Error("Unknown sheet requested: " + name);

  var sheet = getSheet(name);
  var width = sheet.getLastColumn();

  var actual = width
    ? sheet.getRange(1, 1, 1, width).getValues()[0].map(function(value){
        return String(value === null || value === undefined ? "" : value).trim();
      })
    : [];

  var hasHeader = actual.some(function(value){ return value !== ""; });

  if(!hasHeader){
    sheet.getRange(1, 1, 1, canonical.length).setValues([canonical]);
    sheet.getRange(1, 1, 1, canonical.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    actual = canonical.slice();
  }

  var map = {};
  actual.forEach(function(header, position){
    if(header && !(header in map)) map[header] = position + 1;
  });

  var missing = canonical.filter(function(header){ return !map[header]; });

  if(missing.length){
    var start  = Math.max(actual.length, sheet.getLastColumn()) + 1;
    var needed = start + missing.length - 1;

    if(sheet.getMaxColumns() < needed){
      sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
    }

    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    sheet.getRange(1, start, 1, missing.length).setFontWeight("bold");

    missing.forEach(function(header, offset){ map[header] = start + offset; });
    actual = actual.concat(missing);
  }

  return {
    name:      name,
    sheet:     sheet,
    map:       map,
    headers:   canonical,
    idHeader:  canonical[0],
    idColumn:  map[canonical[0]],
    width:     Math.max(actual.length, sheet.getLastColumn(), canonical.length)
  };
}


function readSheet(name){
  var context = getSheetContext(name);
  var sheet   = context.sheet;
  var lastRow = sheet.getLastRow();

  if(lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, context.width).getValues();

  return values
    .map(function(row){
      var record = {};
      context.headers.forEach(function(header){
        var column = context.map[header];
        record[header] = column ? row[column - 1] : "";
      });
      return record;
    })
    .filter(function(record){
      /* Skip blank rows left behind by deletions. */
      return String(record[context.idHeader] === null || record[context.idHeader] === undefined
        ? "" : record[context.idHeader]).trim() !== "";
    });
}


/*
  UPSERT, NEVER CLEAR-AND-REWRITE.

  Three things changed here, all of them about not failing
  silently:

  1. Columns are addressed through the header map, not by array
     position, so data can no longer land in the wrong column.

  2. A record whose ID cell is empty used to be dropped with
     `if(!id) return;` and no trace. It is now REPORTED back to
     the caller, which turns it into a visible error instead of
     a row that never appears.

  3. Rows whose values are already identical are left untouched
     and counted as `unchanged`. The web app posts the WHOLE
     store on every save, so the old code rewrote every row of
     every sheet each time; on a busy sheet that is what pushes
     the script towards its execution-time limit, and a script
     that dies part-way writes Patients (first) and never
     reaches Visits (third) -- which is exactly the shape of the
     reported bug.
*/
function upsertRows(name, records){
  var context = getSheetContext(name);
  var sheet   = context.sheet;
  var headers = context.headers;

  var result = {updated:0, created:0, unchanged:0, written:[], rejected:[]};
  if(!records || !records.length) return result;

  /*
    Plain-text format FIRST, so "2025-11-13" is stored as the
    literal string and never re-parsed by Sheets into a
    date/time value.
  */
  applyDateColumnFormat(name);

  var width    = context.width;
  var lastRow  = sheet.getLastRow();
  var existing = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  var rowOf = {};
  for(var i = 0; i < existing.length; i++){
    var existingId = String(existing[i][context.idColumn - 1] || "").trim();
    if(existingId && rowOf[existingId] === undefined) rowOf[existingId] = i;
  }

  var appended    = [];
  var appendedIds = [];
  var appendAt    = {};

  var fill = function(row, record){
    var changed = false;
    headers.forEach(function(header){
      var column = context.map[header];
      if(!column) return;

      var value = record[header];
      value = (value === undefined || value === null) ? "" : value;

      var before = row[column - 1];
      before = (before === undefined || before === null) ? "" : before;

      if(String(before) !== String(value)){
        row[column - 1] = value;
        changed = true;
      }
    });
    return changed;
  };

  records.forEach(function(record){
    var id = String(record[context.idHeader] === null || record[context.idHeader] === undefined
      ? "" : record[context.idHeader]).trim();

    if(!id){
      result.rejected.push(name + ": a record arrived with no " + context.idHeader + " and was not written.");
      return;
    }

    /* The same ID twice in one payload: update the pending row. */
    if(appendAt[id] !== undefined){
      fill(appended[appendAt[id]], record);
      return;
    }

    if(rowOf[id] !== undefined){
      var position = rowOf[id];
      var current  = existing[position].slice();

      if(fill(current, record)){
        sheet.getRange(position + 2, 1, 1, width).setValues([current]);
        existing[position] = current;
        result.updated++;
      }else{
        result.unchanged++;
      }

      result.written.push(id);
      return;
    }

    var row = [];
    for(var c = 0; c < width; c++) row.push("");
    fill(row, record);

    appendAt[id] = appended.length;
    appended.push(row);
    appendedIds.push(id);
  });

  if(appended.length){
    sheet
      .getRange(sheet.getLastRow() + 1, 1, appended.length, width)
      .setValues(appended);

    result.created = appended.length;
    result.written = result.written.concat(appendedIds);
  }

  return result;
}


/*
  VERIFY THE WRITE.

  upsertRows() reporting "created 1" is not proof. This reads
  the ID column back out of the sheet AFTER the write and says
  which of the IDs the web app sent are genuinely on a row now.
  Everything the front end trusts is built on this.
*/
function verifyIds(name, ids){
  var unique = [];
  var seen   = {};

  (ids || []).forEach(function(id){
    var key = String(id === null || id === undefined ? "" : id).trim();
    if(key && !seen[key]){ seen[key] = true; unique.push(key); }
  });

  if(!unique.length) return {expected:0, present:[], missing:[]};

  var context = getSheetContext(name);
  var sheet   = context.sheet;
  var lastRow = sheet.getLastRow();
  var have    = {};

  if(lastRow >= 2){
    var column = sheet.getRange(2, context.idColumn, lastRow - 1, 1).getValues();
    for(var i = 0; i < column.length; i++){
      var value = String(column[i][0] || "").trim();
      if(value) have[value] = true;
    }
  }

  var present = [];
  var missing = [];

  unique.forEach(function(id){
    if(have[id]) present.push(id); else missing.push(id);
  });

  return {expected:unique.length, present:present, missing:missing};
}


function toText(value){
  return value === undefined || value === null ? "" : String(value);
}

function toNumber(value){
  var number = Number(value);
  return isFinite(number) ? number : 0;
}

/*
  Normalises any stored value back to a plain calendar date.

  - Date object (a cell an older build let Sheets coerce)
      -> formatted in the SPREADSHEET's timezone, which is the
         timezone that produced the value in the first place.
  - "2025-11-13"                -> unchanged.
  - "2025-11-12T16:00:00.000Z"  -> "2025-11-13" (converted back
         to the calendar day the user actually picked, instead
         of blindly slicing off the first ten characters, which
         would keep the off-by-one error forever).
  - "13/11/2025"                -> "2025-11-13".
*/
function toDateKey(value){
  if(value instanceof Date){
    return Utilities.formatDate(value, getBookTimeZone(), "yyyy-MM-dd");
  }

  var text = toText(value).trim();
  if(!text) return "";

  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  /* ISO datetime carrying a timezone: re-render as a local day. */
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(text)){
    var parsed = new Date(text);
    if(!isNaN(parsed.getTime())){
      return Utilities.formatDate(parsed, getBookTimeZone(), "yyyy-MM-dd");
    }
    return text.slice(0, 10);
  }

  /* ISO datetime with no timezone: the date part is already local. */
  if(/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);

  var dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(dmy){
    return dmy[3] + "-" + pad2(dmy[2]) + "-" + pad2(dmy[1]);
  }

  var ymd = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(ymd){
    return ymd[1] + "-" + pad2(ymd[2]) + "-" + pad2(ymd[3]);
  }

  return text.slice(0, 10);
}


function pad2(value){
  var text = String(value);
  return text.length < 2 ? "0" + text : text;
}

function toTimeKey(value){
  if(value instanceof Date){
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  return toText(value);
}

function parseJsonOr(value, fallback){
  var text = toText(value).trim();
  if(!text) return fallback;
  try{ return JSON.parse(text); }
  catch(error){ return fallback; }
}


/* ---------------------------------------------------------
   READ   (Sheets -> Web)
--------------------------------------------------------- */

function buildStore(){
  var patientRows     = readSheet(SHEETS.PATIENTS);
  var appointmentRows = readSheet(SHEETS.APPOINTMENTS);
  var visitRows       = readSheet(SHEETS.VISITS);
  var chargeRows      = readSheet(SHEETS.CHARGES);
  var claimRows       = readSheet(SHEETS.CLAIMS);
  var fileRows        = readSheet(SHEETS.FILES);

  var chargesByVisit = {};
  chargeRows.forEach(function(row){
    var visitId = toText(row.VisitID);
    if(!chargesByVisit[visitId]) chargesByVisit[visitId] = [];
    chargesByVisit[visitId].push({
      id:       toText(row.ChargeID),
      category: toText(row.Category),
      itemId:   toText(row.ItemID),
      itemName: toText(row.ItemName),
      price:    toNumber(row.Price),
      notes:    toText(row.Notes)
    });
  });

  var filesByVisit = {};
  fileRows.forEach(function(row){
    var visitId = toText(row.VisitID);
    if(!filesByVisit[visitId]) filesByVisit[visitId] = [];
    filesByVisit[visitId].push({
      id:      toText(row.FileID),
      name:    toText(row.Name),
      driveId: toText(row.DriveFileID),
      url:     toText(row.Url),
      storage: "drive"
    });
  });

  var visitsByPatient = {};
  visitRows.forEach(function(row){
    var patientId = toText(row.PatientID);
    var visitId   = toText(row.VisitID);
    var charges   = chargesByVisit[visitId] || [];

    var sum = function(category){
      return charges
        .filter(function(charge){ return charge.category === category; })
        .reduce(function(total, charge){ return total + toNumber(charge.price); }, 0);
    };

    var pdfId  = toText(row.PdfFileId);
    var pdfUrl = toText(row.PdfUrl);

    if(!visitsByPatient[patientId]) visitsByPatient[patientId] = [];

    visitsByPatient[patientId].push({
      id:               visitId,
      dateKey:          toDateKey(row.Date),
      visit:            toText(row.VisitNumber),
      type:             toText(row.Type),
      weight:           toText(row.Weight) || "—",
      invoiceReference: toText(row.InvoiceReference),
      notes:            toText(row.Notes),
      status:           toText(row.Status) || "Completed",
      pdfName:          toText(row.PdfName),
      pdfFile:          (pdfId || pdfUrl)
                          ? {name:toText(row.PdfName), driveId:pdfId, url:pdfUrl, storage:"drive"}
                          : null,
      arboleafText:     toText(row.ArboleafText),
      arboleafMetrics:  parseJsonOr(row.ArboleafMetricsJson, {}),
      photos:           filesByVisit[visitId] || [],
      charges:          charges,
      billing: {
        injection:  {price:sum("Injection"),  notes:""},
        medication: {price:sum("Medication"), notes:""},
        treatment:  {price:sum("Treatment"),  notes:""},
        other:      {price:sum("Additional"), notes:""},
        panel:      toNumber(row.PanelAmount),
        selfPay:    toNumber(row.SelfPayAmount)
      }
    });
  });

  var appointmentsByPatient = {};
  appointmentRows.forEach(function(row){
    var patientId = toText(row.PatientID);
    if(!appointmentsByPatient[patientId]) appointmentsByPatient[patientId] = [];
    appointmentsByPatient[patientId].push({
      id:        toText(row.AppointmentID),
      date:      toDateKey(row.Date),
      time:      toTimeKey(row.Time),
      doctor:    toText(row.Doctor),
      type:      toText(row.Type),
      status:    toText(row.Status),
      notes:     toText(row.Notes),
      updatedAt: toText(row.UpdatedAt)
    });
  });

  var claimsByPatient = {};
  claimRows.forEach(function(row){
    var patientId = toText(row.PatientID);
    if(!claimsByPatient[patientId]) claimsByPatient[patientId] = [];
    claimsByPatient[patientId].push({
      id:        toText(row.ClaimID),
      claimDate: toDateKey(row.ClaimDate),
      amount:    toNumber(row.Amount),
      visitId:   toText(row.VisitID),
      status:    toText(row.Status),
      notes:     toText(row.Notes)
    });
  });

  /*
    A patient's UpdatedAt is the newest stamp across the
    patient row and all of its child rows, so editing an
    appointment by hand in the sheet correctly makes the
    whole patient record look newer to the merge.
  */
  var newestChildStamp = function(patientId){
    var newest = "";
    var consider = function(rows, key){
      rows.forEach(function(row){
        if(toText(row.PatientID) !== patientId) return;
        var stamp = toText(row[key]);
        if(stamp > newest) newest = stamp;
      });
    };
    consider(appointmentRows, "UpdatedAt");
    consider(visitRows,       "UpdatedAt");
    consider(claimRows,       "UpdatedAt");
    consider(chargeRows,      "UpdatedAt");
    return newest;
  };

  var patients = patientRows.map(function(row){
    var patientId = toText(row.PatientID);
    var own = toText(row.UpdatedAt);
    var child = newestChildStamp(patientId);

    return {
      id:                  patientId,
      name:                toText(row.Name),
      initials:            toText(row.Initials),
      status:              toText(row.Status) || "Active",
      panelProvider:       toText(row.PanelProvider) || "SELF_PAY",
      otherPanelName:      toText(row.OtherPanelName),
      panelStatus:         toText(row.PanelStatus) || "Active",
      panelSuspensionNote: toText(row.PanelSuspensionNote),
      phone:               toText(row.Phone),
      dob:                 toDateKey(row.DOB),
      gender:              toText(row.Gender),
      height:              toText(row.Height),
      startingWeight:      toNumber(row.StartingWeight),
      currentWeight:       toNumber(row.CurrentWeight),
      goalWeight:          toNumber(row.GoalWeight),
      startDate:           toDateKey(row.StartDate),
      doctor:              toText(row.Doctor),
      photoDriveId:        toText(row.ProfilePhotoDriveID),
      photoUrl:            toText(row.ProfilePhotoUrl),
      visits:              visitsByPatient[patientId] || [],
      appointments:        appointmentsByPatient[patientId] || [],
      claims:              claimsByPatient[patientId] || [],
      measurements:        [],
      updatedAt:           (child > own ? child : own)
    };
  });

  return {
    patients: patients,
    settings: readSettingsFromSheet(),
    dataVersion: patients.length ? "OK" : "EMPTY"
  };
}


/* ---------------------------------------------------------
   WRITE   (Web -> Sheets)
--------------------------------------------------------- */


function saveSettingsToSheet(settings){
  var sheet=getSheet(SHEETS.SETTINGS);
  var existing=readSheet(SHEETS.SETTINGS);
  var rowMap={};
  existing.forEach(function(row,index){
    var key=toText(row.Key).trim();
    if(key) rowMap[key]=index+2;
  });
  var updatedAt=toText(settings&&settings.updatedAt)||new Date().toISOString();
  var value=JSON.stringify(settings||{});
  if(rowMap.SYSTEM){
    sheet.getRange(rowMap.SYSTEM,1,1,3).setValues([["SYSTEM",value,updatedAt]]);
    return {updated:1,created:0};
  }
  sheet.getRange(sheet.getLastRow()+1,1,1,3).setValues([["SYSTEM",value,updatedAt]]);
  return {updated:0,created:1};
}

function readSettingsFromSheet(){
  var rows=readSheet(SHEETS.SETTINGS);
  var system=rows.find(function(row){return toText(row.Key)==="SYSTEM";});
  if(!system) return null;
  var value=parseJsonOr(system.Value,null);
  if(!value || typeof value!=="object") return null;
  value.updatedAt=toText(system.UpdatedAt)||toText(value.updatedAt);
  return value;
}

function saveStoreToSheets(data){
  var patients = (data && data.patients) || [];

  var patientRows     = [];
  var appointmentRows = [];
  var visitRows       = [];
  var chargeRows      = [];
  var claimRows       = [];
  var fileRows        = [];

  var stamp    = new Date().toISOString();
  var rejected = [];

  patients.forEach(function(patient){
    var patientId = toText(patient.id);
    if(!patientId){
      rejected.push("A patient arrived with no PatientID and was not written.");
      return;
    }

    var patientStamp = toText(patient.updatedAt) || stamp;

    patientRows.push({
      PatientID:           patientId,
      Name:                toText(patient.name),
      Initials:            toText(patient.initials),
      Status:              toText(patient.status),
      PanelProvider:       toText(patient.panelProvider),
      OtherPanelName:      toText(patient.otherPanelName),
      PanelStatus:         toText(patient.panelStatus),
      PanelSuspensionNote: toText(patient.panelSuspensionNote),
      Phone:               toText(patient.phone),
      DOB:                 toDateKey(patient.dob),
      Gender:              toText(patient.gender),
      Height:              toText(patient.height),
      StartingWeight:      toNumber(patient.startingWeight),
      CurrentWeight:       toNumber(patient.currentWeight),
      GoalWeight:          toNumber(patient.goalWeight),
      StartDate:           toDateKey(patient.startDate),
      Doctor:              toText(patient.doctor),
      UpdatedAt:           patientStamp,

      /* Pointers only. patient.photoLocal is a device-only
         fallback and is never written to the sheet. */
      ProfilePhotoDriveID: toText(patient.photoDriveId),
      ProfilePhotoUrl:     toText(patient.photoUrl)
    });

    (patient.appointments || []).forEach(function(appointment){
      var id = toText(appointment.id);
      if(!id){
        rejected.push("An appointment on " + patientId + " arrived with no AppointmentID.");
        return;
      }
      appointmentRows.push({
        AppointmentID: id,
        PatientID:     patientId,
        Date:          toDateKey(appointment.date),
        Time:          toText(appointment.time),
        Doctor:        toText(appointment.doctor),
        Type:          toText(appointment.type),
        Status:        toText(appointment.status),
        Notes:         toText(appointment.notes),
        UpdatedAt:     patientStamp
      });
    });

    (patient.visits || []).forEach(function(visit){
      var visitId = toText(visit.id);
      if(!visitId){
        rejected.push("A visit on " + patientId + " arrived with no VisitID and was not written.");
        return;
      }

      var billing = visit.billing || {};
      var pdfFile = visit.pdfFile || {};

      visitRows.push({
        VisitID:             visitId,
        PatientID:           patientId,
        Date:                toDateKey(visit.dateKey),
        VisitNumber:         toText(visit.visit),
        Type:                toText(visit.type),
        Weight:              toText(visit.weight),
        InvoiceReference:    toText(visit.invoiceReference),
        Notes:               toText(visit.notes),
        PanelAmount:         toNumber(billing.panel),
        SelfPayAmount:       toNumber(billing.selfPay),
        Status:              toText(visit.status),
        PdfName:             toText(visit.pdfName),
        PdfFileId:           toText(pdfFile.driveId),
        PdfUrl:              toText(pdfFile.url),
        /*
          A Sheets cell holds 50,000 characters. Metrics are
          small JSON; the extracted text is capped so a long
          PDF can never make the whole save fail.
        */
        ArboleafMetricsJson: JSON.stringify(visit.arboleafMetrics || {}).slice(0, 40000),
        ArboleafText:        toText(visit.arboleafText).slice(0, 40000),
        UpdatedAt:           patientStamp
      });

      (visit.charges || []).forEach(function(charge){
        var chargeId = toText(charge.id);
        if(!chargeId){
          rejected.push("A charge on visit " + visitId + " arrived with no ChargeID.");
          return;
        }
        chargeRows.push({
          ChargeID:  chargeId,
          VisitID:   visitId,
          PatientID: patientId,
          Category:  toText(charge.category),
          ItemID:    toText(charge.itemId),
          ItemName:  toText(charge.itemName),
          Price:     toNumber(charge.price),
          Notes:     toText(charge.notes),
          UpdatedAt: patientStamp
        });
      });

      (visit.photos || []).forEach(function(photo, position){
        /* Only Drive-backed files are recorded; base64 never reaches the sheet. */
        if(!photo || !photo.driveId) return;
        fileRows.push({
          FileID:      toText(photo.id) || ("FILE-" + visitId + "-" + (position + 1)),
          PatientID:   patientId,
          VisitID:     visitId,
          Name:        toText(photo.name),
          MimeType:    toText(photo.mimeType) || "image/jpeg",
          DriveFileID: toText(photo.driveId),
          Url:         toText(photo.url),
          UploadedAt:  patientStamp
        });
      });
    });

    (patient.claims || []).forEach(function(claim){
      var claimId = toText(claim.id);
      if(!claimId){
        rejected.push("A claim on " + patientId + " arrived with no ClaimID.");
        return;
      }
      claimRows.push({
        ClaimID:   claimId,
        PatientID: patientId,
        ClaimDate: toDateKey(claim.claimDate),
        Amount:    toNumber(claim.amount),
        VisitID:   toText(claim.visitId),
        Status:    toText(claim.status),
        Notes:     toText(claim.notes),
        UpdatedAt: patientStamp
      });
    });
  });

  /*
    ---------------------------------------------------------
    WRITE, THEN PROVE THE WRITE.
    ---------------------------------------------------------
    The old version returned upsertRows()' own counters and the
    front end treated ok:true as "the visit is in the sheet".
    It is not proof: a backend that ignores visits entirely,
    that writes them to a different tab, or that dies part-way
    through the six sheets all produce a perfectly cheerful
    ok:true.

    So every sheet is now read BACK after the write and the IDs
    the web app sent are checked against what is actually on a
    row. `verified` is that proof; `missing` is what did not
    make it. doPost() refuses to answer ok:true unless `missing`
    is empty for every sheet.
  */
  var plan = [
    {key:"patients",     sheet:SHEETS.PATIENTS,     rows:patientRows,     id:"PatientID"},
    {key:"appointments", sheet:SHEETS.APPOINTMENTS, rows:appointmentRows, id:"AppointmentID"},
    {key:"visits",       sheet:SHEETS.VISITS,       rows:visitRows,       id:"VisitID"},
    {key:"charges",      sheet:SHEETS.CHARGES,      rows:chargeRows,      id:"ChargeID"},
    {key:"claims",       sheet:SHEETS.CLAIMS,       rows:claimRows,       id:"ClaimID"},
    {key:"files",        sheet:SHEETS.FILES,        rows:fileRows,        id:"FileID"}
  ];

  var counts   = {};
  var verified = {};
  var missing  = {};

  plan.forEach(function(step){
    var outcome = upsertRows(step.sheet, step.rows);

    counts[step.key] = {
      updated:   outcome.updated,
      created:   outcome.created,
      unchanged: outcome.unchanged
    };

    outcome.rejected.forEach(function(message){ rejected.push(message); });

    var expected = step.rows.map(function(row){ return row[step.id]; });
    var check    = verifyIds(step.sheet, expected);

    verified[step.key] = check.present;
    missing[step.key]  = check.missing;
  });

  return {
    counts:   counts,
    verified: verified,
    missing:  missing,
    rejected: rejected,
    sheets:   describeSheets()
  };
}


/*
  A compact description of what the script can actually see, so
  a support question can be answered without screen sharing.
*/
function describeSheets(){
  var out = {};

  Object.keys(HEADERS).forEach(function(name){
    try{
      var context = getSheetContext(name);
      out[name] = {
        tab:      context.sheet.getName(),
        rows:     Math.max(context.sheet.getLastRow() - 1, 0),
        idColumn: context.idColumn
      };
    }catch(error){
      out[name] = {error:String(error)};
    }
  });

  return out;
}


/* Turns the `missing` map into one sentence a human can act on. */
function describeMissing(result){
  var parts = [];

  Object.keys(result.missing || {}).forEach(function(key){
    var list = result.missing[key] || [];
    if(list.length){
      parts.push(list.length + " " + key + " (" + list.slice(0, 5).join(", ") + ")");
    }
  });

  return parts.length
    ? "These records were sent but are not on a row in the spreadsheet afterwards: " + parts.join("; ") + "."
    : "";
}


/* ---------------------------------------------------------
   DRIVE FILE STORAGE
--------------------------------------------------------- */

function getDriveFolder(){
  var existing = DriveApp.getFoldersByName(GETWELL_DRIVE_FOLDER);
  return existing.hasNext()
    ? existing.next()
    : DriveApp.createFolder(GETWELL_DRIVE_FOLDER);
}


function storeDriveFile(payload){
  if(!payload || !payload.dataBase64){
    return {ok:false, error:"No file content was received."};
  }

  var bytes = Utilities.base64Decode(payload.dataBase64);
  var name  = toText(payload.name) || "getwell-upload";
  var mime  = toText(payload.mimeType) || "application/octet-stream";

  var prefix = [toText(payload.patientId), toText(payload.visitId)]
    .filter(function(part){ return part; })
    .join("-");

  var blob = Utilities.newBlob(bytes, mime, prefix ? (prefix + "-" + name) : name);
  var file = getDriveFolder().createFile(blob);

  /*
    Anyone with the link can view, so the <img> tag in the web
    app can render it. Remove this line if the clinic's policy
    requires per-user Drive permissions instead.
  */
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok: true,
    file: {
      id:   file.getId(),
      name: file.getName(),
      url:  "https://drive.google.com/uc?export=view&id=" + file.getId(),
      link: file.getUrl()
    }
  };
}


/* ---------------------------------------------------------
   HTTP ENTRY POINTS
--------------------------------------------------------- */

function jsonResponse(payload, callback){
  if(callback){
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}



/* ---------------------------------------------------------
   DELETE  (Web -> Sheets)
   Delete only the explicitly identified rows. This never
   clears or rewrites unrelated rows.
--------------------------------------------------------- */
function deleteRowsByIds(name, ids){
  var unique=[...new Set((ids||[]).map(function(id){return toText(id).trim();}).filter(Boolean))];
  if(!unique.length) return {deleted:0};

  var sheet=getSheet(name);
  var lastRow=sheet.getLastRow();
  if(lastRow<2) return {deleted:0};

  var wanted={};
  unique.forEach(function(id){wanted[id]=true;});

  var idColumn = getSheetContext(name).idColumn;
  var values=sheet.getRange(2,idColumn,lastRow-1,1).getValues();
  var rows=[];
  values.forEach(function(row,index){
    var id=toText(row[0]).trim();
    if(wanted[id]) rows.push(index+2);
  });

  rows.sort(function(a,b){return b-a;}).forEach(function(row){
    sheet.deleteRow(row);
  });

  return {deleted:rows.length};
}

function deleteRecordsFromSheets(deletions){
  return {
    patients:deleteRowsByIds(SHEETS.PATIENTS,deletions&&deletions.patients),
    appointments:deleteRowsByIds(SHEETS.APPOINTMENTS,deletions&&deletions.appointments),
    visits:deleteRowsByIds(SHEETS.VISITS,deletions&&deletions.visits),
    charges:deleteRowsByIds(SHEETS.CHARGES,deletions&&deletions.charges),
    claims:deleteRowsByIds(SHEETS.CLAIMS,deletions&&deletions.claims),
    files:deleteRowsByIds(SHEETS.FILES,deletions&&deletions.files)
  };
}

function doGet(e){
  var params   = (e && e.parameter) || {};
  var callback = params.callback || "";
  var action   = params.action || "get";

  try{
    if(action === "get"){
      return jsonResponse(
        {ok:true, version:GETWELL_BACKEND_VERSION, data:buildStore()},
        callback
      );
    }

    if(action === "ping"){
      return jsonResponse(
        {ok:true, version:GETWELL_BACKEND_VERSION, message:"Getwell backend is reachable."},
        callback
      );
    }

    /*
      Answers "is the deployment actually running this file, and
      which tabs is it writing to?" without opening the editor.
      Open the /exec URL with ?action=diagnose in a browser.
    */
    if(action === "diagnose"){
      return jsonResponse({
        ok:      true,
        version: GETWELL_BACKEND_VERSION,
        book:    SpreadsheetApp.getActiveSpreadsheet().getName(),
        tabs:    SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function(sheet){
                   return sheet.getName();
                 }),
        sheets:  describeSheets()
      }, callback);
    }

    return jsonResponse(
      {ok:false, version:GETWELL_BACKEND_VERSION, error:"Unknown action: " + action},
      callback
    );

  }catch(error){
    return jsonResponse({ok:false, error:String(error)}, callback);
  }
}


function doPost(e){
  var lock = LockService.getScriptLock();

  try{
    /* Serialise writes so two browsers cannot interleave rows. */
    lock.waitLock(25000);
  }catch(error){
    return jsonResponse({ok:false, error:"The backend is busy. Please try again."});
  }

  try{
    var body = {};

    if(e && e.postData && e.postData.contents){
      body = JSON.parse(e.postData.contents);
    }

    var action = body.action || "save";

    if(action === "save"){
      if(!body.data || !body.data.patients){
        return jsonResponse({
          ok:false,
          version:GETWELL_BACKEND_VERSION,
          error:"The save payload contained no patients."
        });
      }

      var result = saveStoreToSheets(body.data);

      var shortfall = 0;
      Object.keys(result.missing).forEach(function(key){
        shortfall += (result.missing[key] || []).length;
      });

      /*
        THE POINT OF THE WHOLE EXERCISE.

        ok:true now means "every record you sent has been read
        back off a row in the spreadsheet". Anything less is
        ok:false with the list of what is missing, so the browser
        can refuse to tell the user the visit was saved.
      */
      if(shortfall || result.rejected.length){
        return jsonResponse({
          ok:       false,
          version:  GETWELL_BACKEND_VERSION,
          error:    (describeMissing(result) + " " + result.rejected.join(" ")).trim(),
          saved:    result.counts,
          verified: result.verified,
          missing:  result.missing,
          rejected: result.rejected,
          sheets:   result.sheets
        });
      }

      return jsonResponse({
        ok:       true,
        version:  GETWELL_BACKEND_VERSION,
        saved:    result.counts,
        verified: result.verified,
        sheets:   result.sheets
      });
    }

    if(action === "deleteRecords"){
      return jsonResponse({
        ok:true,
        version:GETWELL_BACKEND_VERSION,
        deleted:deleteRecordsFromSheets(body.deletions || {})
      });
    }

    if(action === "saveSettings"){
      if(!body.settings) return jsonResponse({ok:false,version:GETWELL_BACKEND_VERSION,error:"No settings were supplied."});
      return jsonResponse({ok:true,version:GETWELL_BACKEND_VERSION,saved:saveSettingsToSheet(body.settings)});
    }

    if(action === "uploadFile"){
      return jsonResponse(storeDriveFile(body.file));
    }

    return jsonResponse({ok:false, version:GETWELL_BACKEND_VERSION, error:"Unknown action: " + action});

  }catch(error){
    return jsonResponse({ok:false, version:GETWELL_BACKEND_VERSION, error:String(error)});

  }finally{
    lock.releaseLock();
  }
}
