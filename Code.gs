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
    "UpdatedAt"
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


/* ---------------------------------------------------------
   SETUP
--------------------------------------------------------- */

function setupGetwell(){
  var book = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(HEADERS).forEach(function(name){
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    var headers = HEADERS[name];

    var existing = sheet.getLastColumn()
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];

    /* Only write headers that are missing; never disturb extra columns. */
    var needsHeader = false;
    for(var i = 0; i < headers.length; i++){
      if(String(existing[i] || "") !== headers[i]) needsHeader = true;
    }

    if(needsHeader){
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  });

  installGetwellEditTrigger();

  return "Getwell setup complete. Sheets and onEdit trigger are ready.";
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
   SHEET HELPERS
--------------------------------------------------------- */

function getSheet(name){
  var book  = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);

  if(!sheet){
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}


function readSheet(name){
  var sheet = getSheet(name);
  var lastRow = sheet.getLastRow();

  if(lastRow < 2) return [];

  var headers = HEADERS[name];
  var values  = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return values
    .map(function(row){
      var record = {};
      headers.forEach(function(header, index){
        record[header] = row[index];
      });
      return record;
    })
    .filter(function(record){
      /* Skip blank rows left behind by deletions. */
      return String(record[HEADERS[name][0]] || "").trim() !== "";
    });
}


/*
  THE CORE OF REQUIREMENT 4.

  Builds a map of ID -> sheet row number once, then updates
  matched rows in place and appends only genuinely new ones.
  Nothing is ever cleared.
*/
function upsertRows(name, records){
  if(!records || !records.length) return {updated:0, created:0};

  var sheet   = getSheet(name);
  var headers = HEADERS[name];
  var idKey   = headers[0];

  var lastRow = sheet.getLastRow();
  var index   = {};

  if(lastRow >= 2){
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for(var i = 0; i < ids.length; i++){
      var id = String(ids[i][0] || "").trim();
      if(id) index[id] = i + 2;
    }
  }

  var appended = [];
  var updated  = 0;

  records.forEach(function(record){
    var id = String(record[idKey] || "").trim();
    if(!id) return;

    var row = headers.map(function(header){
      var value = record[header];
      return value === undefined || value === null ? "" : value;
    });

    if(index[id]){
      sheet.getRange(index[id], 1, 1, headers.length).setValues([row]);
      updated++;
    }else{
      appended.push(row);
    }
  });

  if(appended.length){
    sheet
      .getRange(sheet.getLastRow() + 1, 1, appended.length, headers.length)
      .setValues(appended);
  }

  return {updated:updated, created:appended.length};
}


function toText(value){
  return value === undefined || value === null ? "" : String(value);
}

function toNumber(value){
  var number = Number(value);
  return isFinite(number) ? number : 0;
}

function toDateKey(value){
  if(value instanceof Date){
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return toText(value).slice(0, 10);
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

  var stamp = new Date().toISOString();

  patients.forEach(function(patient){
    var patientId = toText(patient.id);
    if(!patientId) return;

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
      DOB:                 toText(patient.dob),
      Gender:              toText(patient.gender),
      Height:              toText(patient.height),
      StartingWeight:      toNumber(patient.startingWeight),
      CurrentWeight:       toNumber(patient.currentWeight),
      GoalWeight:          toNumber(patient.goalWeight),
      StartDate:           toText(patient.startDate),
      Doctor:              toText(patient.doctor),
      UpdatedAt:           patientStamp
    });

    (patient.appointments || []).forEach(function(appointment){
      var id = toText(appointment.id);
      if(!id) return;
      appointmentRows.push({
        AppointmentID: id,
        PatientID:     patientId,
        Date:          toText(appointment.date),
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
      if(!visitId) return;

      var billing = visit.billing || {};
      var pdfFile = visit.pdfFile || {};

      visitRows.push({
        VisitID:             visitId,
        PatientID:           patientId,
        Date:                toText(visit.dateKey),
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
        if(!chargeId) return;
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
      if(!claimId) return;
      claimRows.push({
        ClaimID:   claimId,
        PatientID: patientId,
        ClaimDate: toText(claim.claimDate),
        Amount:    toNumber(claim.amount),
        VisitID:   toText(claim.visitId),
        Status:    toText(claim.status),
        Notes:     toText(claim.notes),
        UpdatedAt: patientStamp
      });
    });
  });

  return {
    patients:     upsertRows(SHEETS.PATIENTS,     patientRows),
    appointments: upsertRows(SHEETS.APPOINTMENTS, appointmentRows),
    visits:       upsertRows(SHEETS.VISITS,       visitRows),
    charges:      upsertRows(SHEETS.CHARGES,      chargeRows),
    claims:       upsertRows(SHEETS.CLAIMS,       claimRows),
    files:        upsertRows(SHEETS.FILES,        fileRows)
  };
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

  var values=sheet.getRange(2,1,lastRow-1,1).getValues();
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
      return jsonResponse({ok:true, data:buildStore()}, callback);
    }

    if(action === "ping"){
      return jsonResponse({ok:true, message:"Getwell backend is reachable."}, callback);
    }

    return jsonResponse({ok:false, error:"Unknown action: " + action}, callback);

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
        return jsonResponse({ok:false, error:"The save payload contained no patients."});
      }

      var result = saveStoreToSheets(body.data);
      return jsonResponse({ok:true, saved:result});
    }

    if(action === "deleteRecords"){
      return jsonResponse({
        ok:true,
        deleted:deleteRecordsFromSheets(body.deletions || {})
      });
    }

    if(action === "saveSettings"){
      if(!body.settings) return jsonResponse({ok:false,error:"No settings were supplied."});
      return jsonResponse({ok:true,saved:saveSettingsToSheet(body.settings)});
    }

    if(action === "uploadFile"){
      return jsonResponse(storeDriveFile(body.file));
    }

    return jsonResponse({ok:false, error:"Unknown action: " + action});

  }catch(error){
    return jsonResponse({ok:false, error:String(error)});

  }finally{
    lock.releaseLock();
  }
}
