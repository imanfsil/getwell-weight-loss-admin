/* =========================================================
   GOOGLE SHEETS REMOTE STORAGE
   ========================================================= */

const GETWELL_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbwCAUk-c4fV3Ny7SfY2x3mWity4W8MKxJwlajxdFdUOaDAjFP7lgtb17_BbOXWlGT8kSg/exec";

const GETWELL_REMOTE_POLL_MS = 30000;
const GETWELL_REMOTE_SAVE_KEY = "GETWELL_REMOTE_LAST_SAVE";

function getwellRemoteConfigured(){
  return (
    GETWELL_SHEETS_API_URL &&
    !GETWELL_SHEETS_API_URL.includes("PASTE_YOUR_")
  );
}

function getwellLocalStoreSnapshot(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(seed);
  }catch(error){
    return structuredClone(seed);
  }
}

function getwellRemoteRead(callback){
  if(!getwellRemoteConfigured()){
    callback(null);
    return;
  }

  const callbackName =
    "__getwellRemote_" +
    Date.now() +
    "_" +
    Math.random().toString(36).slice(2);

  const script = document.createElement("script");
  let finished = false;

  const cleanup = () => {
    try{
      delete window[callbackName];
    }catch(e){}

    script.remove();
  };

  const done = payload => {
    if(finished) return;

    finished = true;
    cleanup();
    callback(payload);
  };

  window[callbackName] =
    payload => done(payload);

  script.onerror =
    () => done(null);

  script.src =
    GETWELL_SHEETS_API_URL +
    (
      GETWELL_SHEETS_API_URL.includes("?")
        ? "&"
        : "?"
    ) +
    "action=get&callback=" +
    encodeURIComponent(callbackName) +
    "&t=" +
    Date.now();

  document.head.appendChild(script);

  setTimeout(
    () => done(null),
    15000
  );
}

function getwellRemoteSave(data){

  if(!getwellRemoteConfigured()){
    return;
  }

  try{

    localStorage.setItem(
      GETWELL_REMOTE_SAVE_KEY,
      String(Date.now())
    );

    fetch(
      GETWELL_SHEETS_API_URL,
      {
        method: "POST",
        mode: "no-cors",
        keepalive: true,

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body: JSON.stringify({
          action: "save",
          data
        })
      }
    )
    .catch(error => {

      console.error(
        "Getwell Google Sheets save failed:",
        error
      );

    });

  }catch(error){

    console.error(
      "Getwell Google Sheets save error:",
      error
    );

  }

}

function getwellSyncRemoteStore(
  forceReload
){

  if(!getwellRemoteConfigured()){
    return;
  }

  getwellRemoteRead(
    payload => {

      if(
        !payload ||
        payload.ok !== true ||
        !payload.data ||
        !Array.isArray(
          payload.data.patients
        )
      ){

        return;

      }

      const remote =
        payload.data;

      const local =
        getwellLocalStoreSnapshot();

      const remoteJson =
        JSON.stringify(remote);

      const localJson =
        JSON.stringify(local);

      /*
        Google Sheets is the shared source
        of truth.

        Any changes made manually in
        Google Sheets can therefore appear
        in the web application.
      */

      if(
        remote.dataVersion !== "EMPTY" &&
        remoteJson !== localJson
      ){

        localStorage.setItem(
          STORE_KEY,
          remoteJson
        );

        localStorage.setItem(
          MIGRATION_KEY,
          "done"
        );

        if(
          forceReload !== false
        ){

          location.reload();

        }

        return;

      }

      /*
        First-time setup.

        If the Sheet is empty but this browser
        already has patient data, push that data
        into Google Sheets.
      */

      if(
        payload.dataVersion === "EMPTY" &&
        Array.isArray(
          local.patients
        ) &&
        local.patients.length
      ){

        getwellRemoteSave(
          local
        );

      }

    }
  );

}

function getwellStartRemoteSync(){

  if(!getwellRemoteConfigured()){
    return;
  }

  /*
    Give the page a moment to render first.
    Then synchronize with Google Sheets.
  */

  setTimeout(
    () => getwellSyncRemoteStore(true),
    250
  );

  setInterval(
    () => {

      const lastSave =
        Number(
          localStorage.getItem(
            GETWELL_REMOTE_SAVE_KEY
          ) || 0
        );

      /*
        Avoid replacing a record that was
        just saved while the POST is travelling
        to Google Apps Script.
      */

      if(
        Date.now() -
        lastSave <
        5000
      ){

        return;

      }

      getwellSyncRemoteStore(
        true
      );

    },
    GETWELL_REMOTE_POLL_MS
  );

}
