GETWELL COMPLETE APP.JS	
Copy the code from column B. This is the complete original app.js with the Google Apps Script URL inserted.	
	
Line	Code
1	/* =========================================================
2	   GETWELL WEIGHT LOSS ADMIN
3	   CENTRAL APP.JS
4	
5	
6	
7	/* =========================================================
8	   STORAGE
9	
10	
11	const STORE_KEY =
12	  "getwell_final_v4";
13	
14	const THEME_KEY =
15	  "getwell_theme_v4";
16	
17	const MIGRATION_KEY =
18	  "getwell_pat_to_gw_v1";
19	
20	const GW_SETTINGS_UPDATED_KEY =
21	  "GETWELL_SETTINGS_UPDATED";
22	
23	
24	const seed = {
25	  patients: []
26	};
27	
28	
29	/* =========================================================
30	   SYSTEM SETTINGS
31	   IMPORTANT:
32	   settings.html already owns:
33	   SETTINGS_KEY
34	   DEFAULT_SETTINGS
35	   getSettings()
36	   saveSettings()
37	   settings
38	
39	   Therefore app.js MUST NOT declare
40	   those names.
41	
42	
43	function getwellSystemSettings(){
44	
45	  const raw =
46	    localStorage.getItem(
47	      "GETWELL_SYSTEM_CONFIG_V1"
48	    );
49	
50	
51	  if(!raw){
52	
53	    return {
54	
55	      general: {},
56	
57	      patient: {
58	
59	        idPrefix:
60	          "GW-",
61	
62	        idDigits:
63	          4,
64	
65	        nextNumber:
66	          1,
67	
68	        autoGenerateId:
69	          true,
70	
71	        statuses: [
72	
73	          {
74	            name:
75	              "Active",
76	
77	            enabled:
78	              true
79	          },
80	
81	          {
82	            name:
83	              "Inactive",
84	
85	            enabled:
86	              true
87	          },
88	
89	          {
90	            name:
91	              "Completed",
92	
93	            enabled:
94	              true
95	          }
96	
97	        ],
98	
99	        defaultStatus:
100	          "Active"
101	
102	      },
103	
104	
105	      panels: [],
106	
107	
108	      appointments: {
109	
110	        statuses: [
111	
112	          {
113	            name:
114	              "Upcoming",
115	
116	            enabled:
117	              true
118	          },
119	
120	          {
121	            name:
122	              "Completed",
123	
124	            enabled:
125	              true
126	          },
127	
128	          {
129	            name:
130	              "No Show",
131	
132	            enabled:
133	              true
134	          },
135	
136	          {
137	            name:
138	              "Cancelled",
139	
140	            enabled:
141	              true
142	          }
143	
144	        ],
145	
146	        defaultStatus:
147	          "Upcoming",
148	
149	        defaultDuration:
150	          30
151	
152	      },
153	
154	
155	      followUp: {
156	
157	        dueAfterDays:
158	          5,
159	
160	        overdueAfterDays:
161	          7
162	
163	      },
164	
165	
166	      dashboard: {},
167	
168	      reports: {},
169	
170	
171	      features: {
172	
173	        patients:
174	          true,
175	
176	        appointments:
177	          true,
178	
179	        panel:
180	          true,
181	
182	        reports:
183	          true,
184	
185	        followUpAlerts:
186	          true,
187	
188	        panelClaims:
189	          true
190	
191	      }
192	
193	    };
194	
195	  }
196	
197	
198	  try{
199	
200	    return JSON.parse(
201	      raw
202	    );
203	
204	  }catch(error){
205	
206	    console.error(
207	      "Unable to read Getwell system settings:",
208	      error
209	    );
210	
211	
212	    return {};
213	
214	  }
215	
216	}
217	
218	
219	/* =========================================================
220	   PATIENT SETTINGS
221	
222	
223	function getwellPatientStatuses(){
224	
225	  const settings =
226	    getwellSystemSettings();
227	
228	
229	  return Array.isArray(
230	    settings.patient?.statuses
231	  )
232	    ? settings.patient.statuses
233	    : [];
234	
235	}
236	
237	
238	function getwellActivePatientStatuses(){
239	
240	  return getwellPatientStatuses()
241	    .filter(
242	      status =>
243	        status &&
244	        status.enabled
245	    );
246	
247	}
248	
249	
250	function getwellDefaultPatientStatus(){
251	
252	  const settings =
253	    getwellSystemSettings();
254	
255	
256	  const active =
257	    getwellActivePatientStatuses();
258	
259	
260	  const wanted =
261	    settings.patient?.defaultStatus;
262	
263	
264	  const match =
265	    active.find(
266	      status =>
267	        status.name ===
268	        wanted
269	    );
270	
271	
272	  if(match){
273	
274	    return match.name;
275	
276	  }
277	
278	
279	  return (
280	    active[0]?.name ||
281	    "Active"
282	  );
283	
284	}
285	
286	
287	/* =========================================================
288	   PATIENT ID SETTINGS
289	
290	
291	function getwellPatientIdSettings(){
292	
293	  const settings =
294	    getwellSystemSettings();
295	
296	
297	  const patient =
298	    settings.patient ||
299	    {};
300	
301	
302	  return {
303	
304	    prefix:
305	      String(
306	        patient.idPrefix ||
307	        "GW-"
308	      ),
309	
310	    digits:
311	      Math.max(
312	        1,
313	        Number(
314	          patient.idDigits
315	        ) ||
316	        4
317	      ),
318	
319	    nextNumber:
320	      Math.max(
321	        1,
322	        Number(
323	          patient.nextNumber
324	        ) ||
325	        1
326	      ),
327	
328	    autoGenerate:
329	      patient.autoGenerateId !==
330	      false
331	
332	  };
333	
334	}
335	
336	
337	function getwellFormatPatientId(
338	  number
339	){
340	
341	  const config =
342	    getwellPatientIdSettings();
343	
344	
345	  return (
346	    config.prefix +
347	    String(
348	      number
349	    ).padStart(
350	      config.digits,
351	      "0"
352	    )
353	  );
354	
355	}
356	
357	
358	function getwellNextPatientId(){
359	
360	  const config =
361	    getwellPatientIdSettings();
362	
363	
364	  return getwellFormatPatientId(
365	    config.nextNumber
366	  );
367	
368	}
369	
370	
371	/* =========================================================
372	   PANELS
373	
374	
375	function getwellAllPanels(){
376	
377	  const settings =
378	    getwellSystemSettings();
379	
380	
381	  return Array.isArray(
382	    settings.panels
383	  )
384	    ? settings.panels
385	    : [];
386	
387	}
388	
389	
390	function getwellActivePanels(){
391	
392	  return getwellAllPanels()
393	    .filter(
394	      panel =>
395	        panel &&
396	        panel.enabled
397	    );
398	
399	}
400	
401	
402	function getwellPanelById(
403	  id
404	){
405	
406	  if(!id){
407	
408	    return null;
409	
410	  }
411	
412	
413	  return getwellAllPanels()
414	    .find(
415	      panel =>
416	        String(
417	          panel.id
418	        )
419	        .toUpperCase() ===
420	        String(
421	          id
422	        )
423	        .toUpperCase()
424	    ) ||
425	    null;
426	
427	}
428	
429	
430	function getwellPanelByName(
431	  name
432	){
433	
434	  if(!name){
435	
436	    return null;
437	
438	  }
439	
440	
441	  return getwellAllPanels()
442	    .find(
443	      panel =>
444	        String(
445	          panel.name
446	        )
447	        .toLowerCase() ===
448	        String(
449	          name
450	        )
451	        .toLowerCase()
452	    ) ||
453	    null;
454	
455	}
456	
457	
458	function getwellPanelOptions(){
459	
460	  return [
461	
462	    {
463	      id:
464	        "SELF_PAY",
465	
466	      name:
467	        "Self-Pay",
468	
469	      enabled:
470	        true
471	
472	    },
473	
474	    ...getwellActivePanels()
475	
476	  ];
477	
478	}
479	
480	
481	/* =========================================================
482	   PANEL NAME
483	
484	
485	function getPanelName(
486	  p
487	){
488	
489	  if(
490	    !p ||
491	    p.panelProvider ===
492	      "SELF_PAY"
493	  ){
494	
495	    return "Self-Pay";
496	
497	  }
498	
499	
500	  const configured =
501	    getwellPanelById(
502	      p.panelProvider
503	    );
504	
505	
506	  if(configured){
507	
508	    return configured.name;
509	
510	  }
511	
512	
513	  /* Legacy values */
514	
515	  if(
516	    p.panelProvider ===
517	      "PANEL_A"
518	  ){
519	
520	    return "MiCare";
521	
522	  }
523	
524	
525	  if(
526	    p.panelProvider ===
527	      "PANEL_B"
528	  ){
529	
530	    return "PMCare";
531	
532	  }
533	
534	
535	  if(
536	    p.panelProvider ===
537	      "PANEL_C"
538	  ){
539	
540	    return "Other Panel";
541	
542	  }
543	
544	
545	  if(
546	    p.panelProvider ===
547	      "Other"
548	  ){
549	
550	    return (
551	      p.otherPanelName ||
552	      "Panel"
553	    );
554	
555	  }
556	
557	
558	  return (
559	    p.otherPanelName ||
560	    p.panelProvider ||
561	    "Panel"
562	  );
563	
564	}
565	
566	
567	/* =========================================================
568	   APPOINTMENT SETTINGS
569	
570	
571	function getwellAppointmentStatuses(){
572	
573	  const settings =
574	    getwellSystemSettings();
575	
576	
577	  return Array.isArray(
578	    settings.appointments?.statuses
579	  )
580	    ? settings.appointments.statuses
581	        .filter(
582	          status =>
583	            status &&
584	            status.enabled
585	        )
586	    : [];
587	
588	}
589	
590	
591	function getwellDefaultAppointmentStatus(){
592	
593	  const settings =
594	    getwellSystemSettings();
595	
596	
597	  const statuses =
598	    getwellAppointmentStatuses();
599	
600	
601	  const wanted =
602	    settings.appointments
603	      ?.defaultStatus;
604	
605	
606	  const match =
607	    statuses.find(
608	      status =>
609	        status.name ===
610	        wanted
611	    );
612	
613	
614	  return match
615	    ? match.name
616	    : (
617	        statuses[0]?.name ||
618	        "Upcoming"
619	      );
620	
621	}
622	
623	
624	function getwellAppointmentDuration(){
625	
626	  const settings =
627	    getwellSystemSettings();
628	
629	
630	  return Math.max(
631	    5,
632	    Number(
633	      settings.appointments
634	        ?.defaultDuration
635	    ) ||
636	    30
637	  );
638	
639	}
640	
641	
642	/* =========================================================
643	   FOLLOW-UP
644	
645	
646	function getwellFollowUpSettings(){
647	
648	  const settings =
649	    getwellSystemSettings();
650	
651	
652	  return {
653	
654	    dueAfterDays:
655	      Math.max(
656	        1,
657	        Number(
658	          settings.followUp
659	            ?.dueAfterDays
660	        ) ||
661	        5
662	      ),
663	
664	    overdueAfterDays:
665	      Math.max(
666	        1,
667	        Number(
668	          settings.followUp
669	            ?.overdueAfterDays
670	        ) ||
671	        7
672	      )
673	
674	  };
675	
676	}
677	
678	
679	/* =========================================================
680	   FEATURES
681	
682	
683	function getwellFeatureEnabled(
684	  feature
685	){
686	
687	  const settings =
688	    getwellSystemSettings();
689	
690	
691	  if(
692	    !settings.features ||
693	    settings.features[feature] ===
694	      undefined
695	  ){
696	
697	    return true;
698	
699	  }
700	
701	
702	  return !!settings.features[
703	    feature
704	  ];
705	
706	}
707	
708	
709	/* =========================================================
710	   DASHBOARD SETTINGS
711	
712	
713	function getwellDashboardSettings(){
714	
715	  const settings =
716	    getwellSystemSettings();
717	
718	
719	  return (
720	    settings.dashboard ||
721	    {}
722	  );
723	
724	}
725	
726	
727	/* =========================================================
728	   REPORT SETTINGS
729	
730	
731	function getwellReportSettings(){
732	
733	  const settings =
734	    getwellSystemSettings();
735	
736	
737	  return (
738	    settings.reports ||
739	    {}
740	  );
741	
742	}
743	
744	
745	
746	/* =========================================================
747	   GOOGLE SHEETS REMOTE STORAGE
748	   ========================================================= */
749	
750	const GETWELL_SHEETS_API_URL =
751	  "https://script.google.com/macros/s/AKfycbwCAUk-c4fV3Ny7SfY2x3mWity4W8MKxJwlajxdFdUOaDAjFP7lgtb17_BbOXWlGT8kSg/exec";
752	
753	const GETWELL_REMOTE_POLL_MS = 30000;
754	const GETWELL_REMOTE_SAVE_KEY = "GETWELL_REMOTE_LAST_SAVE";
755	
756	function getwellRemoteConfigured(){
757	  return (
758	    GETWELL_SHEETS_API_URL &&
759	    !GETWELL_SHEETS_API_URL.includes("PASTE_YOUR_")
760	  );
761	}
762	
763	function getwellLocalStoreSnapshot(){
764	  try{
765	    const raw = localStorage.getItem(STORE_KEY);
766	    return raw ? JSON.parse(raw) : structuredClone(seed);
767	  }catch(error){
768	    return structuredClone(seed);
769	  }
770	}
771	
772	function getwellRemoteRead(callback){
773	  if(!getwellRemoteConfigured()){
774	    callback(null);
775	    return;
776	  }
777	
778	  const callbackName =
779	    "__getwellRemote_" +
780	    Date.now() +
781	    "_" +
782	    Math.random().toString(36).slice(2);
783	
784	  const script = document.createElement("script");
785	  let finished = false;
786	
787	  const cleanup = () => {
788	    try{ delete window[callbackName]; }catch(e){}
789	    script.remove();
790	  };
791	
792	  const done = payload => {
793	    if(finished) return;
794	    finished = true;
795	    cleanup();
796	    callback(payload);
797	  };
798	
799	  window[callbackName] = payload => done(payload);
800	  script.onerror = () => done(null);
801	
802	  script.src =
803	    GETWELL_SHEETS_API_URL +
804	    (GETWELL_SHEETS_API_URL.includes("?") ? "&" : "?") +
805	    "action=get&callback=" +
806	    encodeURIComponent(callbackName) +
807	    "&t=" +
808	    Date.now();
809	
810	  document.head.appendChild(script);
811	
812	  setTimeout(() => done(null), 15000);
813	}
814	
815	function getwellRemoteSave(data){
816	  if(!getwellRemoteConfigured()){
817	    return;
818	  }
819	
820	  try{
821	    localStorage.setItem(
822	      GETWELL_REMOTE_SAVE_KEY,
823	      String(Date.now())
824	    );
825	
826	    fetch(
827	      GETWELL_SHEETS_API_URL,
828	      {
829	        method: "POST",
830	        mode: "no-cors",
831	        keepalive: true,
832	        headers: {
833	          "Content-Type":
834	            "text/plain;charset=utf-8"
835	        },
836	        body: JSON.stringify({
837	          action: "save",
838	          data
839	        })
840	      }
841	    ).catch(error => {
842	      console.error(
843	        "Getwell Google Sheets save failed:",
844	        error
845	      );
846	    });
847	  }catch(error){
848	    console.error(
849	      "Getwell Google Sheets save error:",
850	      error
851	    );
852	  }
853	}
854	
855	function getwellSyncRemoteStore(forceReload){
856	  if(!getwellRemoteConfigured()){
857	    return;
858	  }
859	
860	  getwellRemoteRead(payload => {
861	    if(
862	      !payload ||
863	      payload.ok !== true ||
864	      !payload.data ||
865	      !Array.isArray(payload.data.patients)
866	    ){
867	      return;
868	    }
869	
870	    const remote =
871	      payload.data;
872	
873	    const local =
874	      getwellLocalStoreSnapshot();
875	
876	    const remoteJson =
877	      JSON.stringify(remote);
878	
879	    const localJson =
880	      JSON.stringify(local);
881	
882	    /*
883	      If the Google Sheet has records, it is the
884	      source of truth. This makes manual Sheet edits
885	      appear in the web application.
886	    */
887	    if(
888	      remote.dataVersion !== "EMPTY" &&
889	      remoteJson !== localJson
890	    ){
891	      localStorage.setItem(
892	        STORE_KEY,
893	        remoteJson
894	      );
895	
896	      localStorage.setItem(
897	        MIGRATION_KEY,
898	        "done"
899	      );
900	
901	      if(forceReload !== false){
902	        location.reload();
903	      }
904	
905	      return;
906	    }
907	
908	    /*
909	      First-time setup:
910	      if the Sheet is empty but this browser already
911	      contains patients, push the browser data up once.
912	    */
913	    if(
914	      payload.dataVersion === "EMPTY" &&
915	      Array.isArray(local.patients) &&
916	      local.patients.length
917	    ){
918	      getwellRemoteSave(local);
919	    }
920	  });
921	}
922	
923	function getwellStartRemoteSync(){
924	  if(!getwellRemoteConfigured()){
925	    return;
926	  }
927	
928	  /*
929	    Give the page a moment to render first.
930	    Then Google Sheets becomes the persistent source.
931	  */
932	  setTimeout(
933	    () => getwellSyncRemoteStore(true),
934	    250
935	  );
936	
937	  setInterval(
938	    () => {
939	      const lastSave =
940	        Number(
941	          localStorage.getItem(
942	            GETWELL_REMOTE_SAVE_KEY
943	          ) || 0
944	        );
945	
946	      /*
947	        Avoid replacing a just-saved local record
948	        while the POST is still travelling to Apps Script.
949	      */
950	      if(
951	        Date.now() - lastSave < 5000
952	      ){
953	        return;
954	      }
955	
956	      getwellSyncRemoteStore(true);
957	    },
958	    GETWELL_REMOTE_POLL_MS
959	  );
960	}
961	
962	
963	/* =========================================================
964	   RAW STORE
965	
966	
967	function rawStore(){
968	
969	  const raw =
970	    localStorage.getItem(
971	      STORE_KEY
972	    );
973	
974	
975	  if(!raw){
976	
977	    localStorage.setItem(
978	      STORE_KEY,
979	      JSON.stringify(
980	        seed
981	      )
982	    );
983	
984	
985	    return structuredClone(
986	      seed
987	    );
988	
989	  }
990	
991	
992	  try{
993	
994	    return JSON.parse(
995	      raw
996	    );
997	
998	  }catch(e){
999	
1000	    localStorage.setItem(
1001	      STORE_KEY,
1002	      JSON.stringify(
1003	        seed
1004	      )
1005	    );
1006	
1007	
1008	    return structuredClone(
1009	      seed
1010	    );
1011	
1012	  }
1013	
1014	}
1015	
1016	
1017	/* =========================================================
1018	   LEGACY ID MIGRATION
1019	
1020	
1021	function migrateLegacyIds(
1022	  data
1023	){
1024	
1025	  if(
1026	    localStorage.getItem(
1027	      MIGRATION_KEY
1028	    ) ===
1029	    "done"
1030	  ){
1031	
1032	    return data;
1033	
1034	  }
1035	
1036	
1037	  const used =
1038	    new Set();
1039	
1040	
1041	  const map =
1042	    {};
1043	
1044	
1045	  (
1046	    data.patients ||
1047	    []
1048	  )
1049	  .forEach(
1050	    p => {
1051	
1052	      const old =
1053	        String(
1054	          p.id ||
1055	          ""
1056	        );
1057	
1058	
1059	      const match =
1060	        old.match(
1061	          /^PAT-(\d+)$/i
1062	        );
1063	
1064	
1065	      if(match){
1066	
1067	        const number =
1068	          String(
1069	            Number(
1070	              match[1]
1071	            )
1072	          )
1073	          .padStart(
1074	            4,
1075	            "0"
1076	          );
1077	
1078	
1079	        const newer =
1080	          `GW-${number}`;
1081	
1082	
1083	        map[old] =
1084	          newer;
1085	
1086	
1087	        p.id =
1088	          newer;
1089	
1090	
1091	        used.add(
1092	          newer
1093	        );
1094	
1095	      }
1096	
1097	    }
1098	  );
1099	
1100	
1101	  let next =
1102	    1;
1103	
1104	
1105	  (
1106	    data.patients ||
1107	    []
1108	  )
1109	  .forEach(
1110	    p => {
1111	
1112	      if(
1113	        !/^GW-\d+$/i.test(
1114	          p.id ||
1115	          ""
1116	        )
1117	      ){
1118	
1119	        while(
1120	          used.has(
1121	            `GW-${String(next).padStart(4,"0")}`
1122	          )
1123	        ){
1124	
1125	          next++;
1126	
1127	        }
1128	
1129	
1130	        p.id =
1131	          `GW-${String(next).padStart(4,"0")}`;
1132	
1133	
1134	        used.add(
1135	          p.id
1136	        );
1137	
1138	
1139	        next++;
1140	
1141	      }
1142	
1143	
1144	      if(
1145	        !p.panelStatus &&
1146	        patientUsesPanel(
1147	          p
1148	        )
1149	      ){
1150	
1151	        p.panelStatus =
1152	          "Active";
1153	
1154	      }
1155	
1156	
1157	      if(
1158	        !p.panelSuspensionNote
1159	      ){
1160	
1161	        p.panelSuspensionNote =
1162	          "";
1163	
1164	      }
1165	
1166	
1167	      (
1168	        p.appointments ||
1169	        []
1170	      )
1171	      .forEach(
1172	        a => {
1173	
1174	          if(
1175	            a.patientId &&
1176	            map[
1177	              a.patientId
1178	            ]
1179	          ){
1180	
1181	            a.patientId =
1182	              map[
1183	                a.patientId
1184	              ];
1185	
1186	          }
1187	
1188	        }
1189	      );
1190	
1191	    }
1192	  );
1193	
1194	
1195	  localStorage.setItem(
1196	    STORE_KEY,
1197	    JSON.stringify(
1198	      data
1199	    )
1200	  );
1201	
1202	
1203	  localStorage.setItem(
1204	    MIGRATION_KEY,
1205	    "done"
1206	  );
1207	
1208	
1209	  return data;
1210	
1211	}
1212	
1213	
1214	/* =========================================================
1215	   STORE
1216	
1217	
1218	function store(){
1219	
1220	  return migrateLegacyIds(
1221	    rawStore()
1222	  );
1223	
1224	}
1225	
1226	
1227	function saveStore(
1228	  data
1229	){
1230	
1231	  const snapshot =
1232	    structuredClone(data);
1233	
1234	  localStorage.setItem(
1235	    STORE_KEY,
1236	    JSON.stringify(
1237	      snapshot
1238	    )
1239	  );
1240	
1241	  /*
1242	    Persist every web save to Google Sheets.
1243	    localStorage remains the fast local cache;
1244	    Google Sheets is the permanent shared backend.
1245	  */
1246	  getwellRemoteSave(
1247	    snapshot
1248	  );
1249	
1250	}
1251	
1252	
1253	/* =========================================================
1254	   PATIENT
1255	
1256	
1257	function mapLegacyId(
1258	  id
1259	){
1260	
1261	  const value =
1262	    String(
1263	      id ||
1264	      ""
1265	    );
1266	
1267	
1268	  const match =
1269	    value.match(
1270	      /^PAT-(\d+)$/i
1271	    );
1272	
1273	
1274	  return match
1275	    ? `GW-${String(Number(match[1])).padStart(4,"0")}`
1276	    : value;
1277	
1278	}
1279	
1280	
1281	function getPatient(
1282	  id
1283	){
1284	
1285	  const wanted =
1286	    mapLegacyId(
1287	      id
1288	    );
1289	
1290	
1291	  return (
1292	    store().patients ||
1293	    []
1294	  )
1295	  .find(
1296	    patient =>
1297	      patient.id ===
1298	      wanted
1299	  ) ||
1300	  null;
1301	
1302	}
1303	
1304	
1305	function upsertPatient(
1306	  patient
1307	){
1308	
1309	  const data =
1310	    store();
1311	
1312	
1313	  const index =
1314	    data.patients
1315	      .findIndex(
1316	        existing =>
1317	          existing.id ===
1318	          patient.id
1319	      );
1320	
1321	
1322	  if(index >= 0){
1323	
1324	    data.patients[index] =
1325	      patient;
1326	
1327	  }else{
1328	
1329	    data.patients.push(
1330	      patient
1331	    );
1332	
1333	  }
1334	
1335	
1336	  saveStore(
1337	    data
1338	  );
1339	
1340	}
1341	
1342	
1343	/* =========================================================
1344	   CLAIMS
1345	
1346	
1347	function ensureClaims(
1348	  patient
1349	){
1350	
1351	  if(
1352	    !Array.isArray(
1353	      patient.claims
1354	    )
1355	  ){
1356	
1357	    patient.claims =
1358	      [];
1359	
1360	  }
1361	
1362	
1363	  return patient.claims;
1364	
1365	}
1366	
1367	
1368	/* =========================================================
1369	   VISITS
1370	
1371	
1372	function ensureVisit(
1373	  visit
1374	){
1375	
1376	  if(
1377	    !visit.billing
1378	  ){
1379	
1380	    visit.billing =
1381	      {};
1382	
1383	  }
1384	
1385	
1386	  visit.billing.injection ||=
1387	    {
1388	      price:0,
1389	      notes:""
1390	    };
1391	
1392	
1393	  visit.billing.medication ||=
1394	    {
1395	      price:0,
1396	      notes:""
1397	    };
1398	
1399	
1400	  visit.billing.treatment ||=
1401	    {
1402	      price:0,
1403	      notes:""
1404	    };
1405	
1406	
1407	  visit.billing.other ||=
1408	    {
1409	      price:0,
1410	      notes:""
1411	    };
1412	
1413	
1414	  visit.billing.panel =
1415	    Number(
1416	      visit.billing.panel ||
1417	      0
1418	    );
1419	
1420	
1421	  visit.billing.selfPay =
1422	    Number(
1423	      visit.billing.selfPay ||
1424	      0
1425	    );
1426	
1427	
1428	  return visit;
1429	
1430	}
1431	
1432	
1433	function visitTotal(
1434	  visit
1435	){
1436	
1437	  const billing =
1438	    ensureVisit(
1439	      visit
1440	    ).billing;
1441	
1442	
1443	  return (
1444	    (+billing.injection.price || 0) +
1445	    (+billing.medication.price || 0) +
1446	    (+billing.treatment.price || 0) +
1447	    (+billing.other.price || 0)
1448	  );
1449	
1450	}
1451	
1452	
1453	/* =========================================================
1454	   PANEL
1455	
1456	
1457	function patientUsesPanel(
1458	  patient
1459	){
1460	
1461	  return !!(
1462	    patient?.panelProvider &&
1463	    patient.panelProvider !==
1464	      "SELF_PAY"
1465	  );
1466	
1467	}
1468	
1469	
1470	function isPanelSuspended(
1471	  patient
1472	){
1473	
1474	  return (
1475	    patientUsesPanel(
1476	      patient
1477	    ) &&
1478	    (
1479	      patient.panelStatus ===
1480	        "Suspended" ||
1481	
1482	      patient.insuranceStatus ===
1483	        "Suspended"
1484	    )
1485	  );
1486	
1487	}
1488	
1489	
1490	function panelSuspensionNote(
1491	  patient
1492	){
1493	
1494	  return (
1495	    patient.panelSuspensionNote ||
1496	    patient.insuranceSuspensionNote ||
1497	    ""
1498	  );
1499	
1500	}
1501	
1502	
1503	/* =========================================================
1504	   FINANCE
1505	
1506	
1507	function grandTotal(
1508	  patient
1509	){
1510	
1511	  return (
1512	    patient.visits ||
1513	    []
1514	  )
1515	  .reduce(
1516	    (
1517	      total,
1518	      visit
1519	    ) =>
1520	      total +
1521	      visitTotal(
1522	        visit
1523	      ),
1524	    0
1525	  );
1526	
1527	}
1528	
1529	
1530	function claimsTotal(
1531	  patient
1532	){
1533	
1534	  return ensureClaims(
1535	    patient
1536	  )
1537	  .reduce(
1538	    (
1539	      total,
1540	      claim
1541	    ) =>
1542	      total +
1543	      (
1544	        +claim.amount ||
1545	        0
1546	      ),
1547	    0
1548	  );
1549	
1550	}
1551	
1552	
1553	function finance(
1554	  patient
1555	){
1556	
1557	  let injection =
1558	    0;
1559	
1560	  let medication =
1561	    0;
1562	
1563	  let treatment =
1564	    0;
1565	
1566	  let selfpay =
1567	    0;
1568	
1569	
1570	  (
1571	    patient.visits ||
1572	    []
1573	  )
1574	  .forEach(
1575	    visit => {
1576	
1577	      const billing =
1578	        ensureVisit(
1579	          visit
1580	        ).billing;
1581	
1582	
1583	      injection +=
1584	        +billing.injection.price ||
1585	        0;
1586	
1587	
1588	      medication +=
1589	        +billing.medication.price ||
1590	        0;
1591	
1592	
1593	      treatment +=
1594	        +billing.treatment.price ||
1595	        0;
1596	
1597	
1598	      selfpay +=
1599	        +billing.selfPay ||
1600	        0;
1601	
1602	    }
1603	  );
1604	
1605	
1606	  const grand =
1607	    grandTotal(
1608	      patient
1609	    );
1610	
1611	
1612	  const claimed =
1613	    claimsTotal(
1614	      patient
1615	    );
1616	
1617	
1618	  return {
1619	
1620	    grand,
1621	
1622	    claimed,
1623	
1624	    balance:
1625	      Math.max(
1626	        0,
1627	        grand -
1628	        claimed
1629	      ),
1630	
1631	    injection,
1632	
1633	    medication,
1634	
1635	    treatment,
1636	
1637	    selfpay
1638	
1639	  };
1640	
1641	}
1642	
1643	
1644	/* =========================================================
1645	   FOLLOW-UP
1646	
1647	
1648	function latestVisit(
1649	  patient
1650	){
1651	
1652	  return [
1653	    ...(patient.visits ||
1654	      [])
1655	  ]
1656	  .sort(
1657	    (
1658	      a,
1659	      b
1660	    ) =>
1661	      (
1662	        a.dateKey ||
1663	        ""
1664	      )
1665	      .localeCompare(
1666	        b.dateKey ||
1667	        ""
1668	      )
1669	  )
1670	  .at(
1671	    -1
1672	  ) ||
1673	  null;
1674	
1675	}
1676	
1677	
1678	function daysSince(
1679	  date
1680	){
1681	
1682	  if(!date){
1683	
1684	    return null;
1685	
1686	  }
1687	
1688	
1689	  const start =
1690	    new Date(
1691	      date +
1692	      "T00:00:00"
1693	    );
1694	
1695	
1696	  const today =
1697	    new Date();
1698	
1699	
1700	  today.setHours(
1701	    0,
1702	    0,
1703	    0,
1704	    0
1705	  );
1706	
1707	
1708	  return Math.floor(
1709	    (
1710	      today -
1711	      start
1712	    ) /
1713	    86400000
1714	  );
1715	
1716	}
1717	
1718	
1719	function alerts(){
1720	
1721	  const config =
1722	    getwellFollowUpSettings();
1723	
1724	
1725	  return (
1726	    store().patients ||
1727	    []
1728	  )
1729	  .map(
1730	    patient => {
1731	
1732	      const days =
1733	        daysSince(
1734	          latestVisit(
1735	            patient
1736	          )
1737	          ?.dateKey
1738	        );
1739	
1740	
1741	      if(
1742	        days === null ||
1743	        days <
1744	          config.dueAfterDays
1745	      ){
1746	
1747	        return null;
1748	
1749	      }
1750	
1751	
1752	      return {
1753	
1754	        id:
1755	          patient.id,
1756	
1757	        name:
1758	          patient.name,
1759	
1760	        days,
1761	
1762	        level:
1763	          days >=
1764	            config.overdueAfterDays
1765	            ? "overdue"
1766	            : "warning"
1767	
1768	      };
1769	
1770	    }
1771	  )
1772	  .filter(
1773	    Boolean
1774	  )
1775	  .sort(
1776	    (
1777	      a,
1778	      b
1779	    ) =>
1780	      b.days -
1781	      a.days
1782	  );
1783	
1784	}
1785	
1786	
1787	/* =========================================================
1788	   MONEY
1789	
1790	
1791	function money(
1792	  value
1793	){
1794	
1795	  return (
1796	    "RM " +
1797	    Number(
1798	      value ||
1799	      0
1800	    )
1801	    .toLocaleString(
1802	      "en-MY",
1803	      {
1804	        minimumFractionDigits:
1805	          2,
1806	
1807	        maximumFractionDigits:
1808	          2
1809	      }
1810	    )
1811	  );
1812	
1813	}
1814	
1815	
1816	/* =========================================================
1817	   THEME
1818	
1819	
1820	function applyTheme(
1821	  theme
1822	){
1823	
1824	  theme =
1825	    theme ===
1826	      "dark"
1827	      ? "dark"
1828	      : "light";
1829	
1830	
1831	  document.documentElement
1832	    .dataset.theme =
1833	    theme;
1834	
1835	
1836	  localStorage.setItem(
1837	    THEME_KEY,
1838	    theme
1839	  );
1840	
1841	
1842	  const button =
1843	    document.getElementById(
1844	      "themeToggle"
1845	    );
1846	
1847	
1848	  if(button){
1849	
1850	    button.textContent =
1851	      theme ===
1852	        "dark"
1853	        ? "☀"
1854	        : "☾";
1855	
1856	
1857	    button.title =
1858	      theme ===
1859	        "dark"
1860	        ? "Switch to Day Mode"
1861	        : "Switch to Night Mode";
1862	
1863	  }
1864	
1865	}
1866	
1867	
1868	function initTheme(){
1869	
1870	  applyTheme(
1871	    localStorage.getItem(
1872	      THEME_KEY
1873	    ) ||
1874	    "light"
1875	  );
1876	
1877	}
1878	
1879	
1880	function toggleTheme(){
1881	
1882	  const current =
1883	    document.documentElement
1884	      .dataset.theme ||
1885	    "light";
1886	
1887	
1888	  applyTheme(
1889	    current ===
1890	      "dark"
1891	      ? "light"
1892	      : "dark"
1893	  );
1894	
1895	}
1896	
1897	
1898	/* =========================================================
1899	   HEADER
1900	
1901	
1902	function header(){
1903	
1904	  const followUp =
1905	    getwellFollowUpSettings();
1906	
1907	
1908	  return `
1909	
1910	<header class="topbar">
1911	
1912	  <div class="topbar-left">
1913	
1914	    <div>
1915	
1916	      <div class="page-title">
1917	        ${document.title
1918	          .split("|")[0]
1919	          .trim()}
1920	      </div>
1921	
1922	      <div class="page-subtitle">
1923	        Getwell Weight Loss Admin
1924	      </div>
1925	
1926	    </div>
1927	
1928	  </div>
1929	
1930	
1931	  <div class="topbar-right">
1932	
1933	    <div class="search-box">
1934	
1935	      <span>
1936	        ⌕
1937	      </span>
1938	
1939	      <input
1940	        id="globalSearch"
1941	        placeholder="Search patient or ID"
1942	      >
1943	
1944	    </div>
1945	
1946	
1947	    <div
1948	      id="notifWrap"
1949	      class="global-notification-wrap"
1950	    >
1951	
1952	      <button
1953	        class="icon-button"
1954	        onclick="toggleNotifications(event)"
1955	      >
1956	
1957	        🔔
1958	
1959	        <span
1960	          class="notification-count"
1961	          id="notifCount"
1962	          hidden
1963	        >
1964	          0
1965	        </span>
1966	
1967	      </button>
1968	
1969	
1970	      <div
1971	        id="notifPanel"
1972	        class="global-notification-panel"
1973	        hidden
1974	      >
1975	
1976	        <div class="notif-head">
1977	
1978	          <div>
1979	
1980	            <strong>
1981	              Follow-Up Alerts
1982	            </strong>
1983	
1984	            <span>
1985	              ${followUp.dueAfterDays}
1986	              days due ·
1987	              ${followUp.overdueAfterDays}
1988	              days overdue
1989	            </span>
1990	
1991	          </div>
1992	
1993	        </div>
1994	
1995	
1996	        <div id="notifBody"></div>
1997	
1998	      </div>
1999	
2000	    </div>
2001	
2002	
2003	    <button
2004	      class="theme-toggle"
2005	      id="themeToggle"
2006	      onclick="toggleTheme()"
2007	    >
2008	      ☾
2009	    </button>
2010	
2011	
2012	    <div class="user-avatar">
2013	      A
2014	    </div>
2015	
2016	
2017	  </div>
2018	
2019	</header>
2020	
2021	`;
2022	
2023	}
2024	
2025	
2026	/* =========================================================
2027	   SIDEBAR
2028	
2029	
2030	function sidebar(
2031	  active
2032	){
2033	
2034	  const showPatients =
2035	    getwellFeatureEnabled(
2036	      "patients"
2037	    );
2038	
2039	
2040	  const showAppointments =
2041	    getwellFeatureEnabled(
2042	      "appointments"
2043	    );
2044	
2045	
2046	  const showPanel =
2047	    getwellFeatureEnabled(
2048	      "panel"
2049	    );
2050	
2051	
2052	  const showReports =
2053	    getwellFeatureEnabled(
2054	      "reports"
2055	    );
2056	
2057	
2058	  return `
2059	
2060	<aside class="sidebar">
2061	
2062	
2063	  <div
2064	    class="brand"
2065	    role="button"
2066	    tabindex="0"
2067	    aria-label="Go to Dashboard"
2068	    onclick="goHome()"
2069	    onkeydown="
2070	      if(
2071	        event.key==='Enter' ||
2072	        event.key===' '
2073	      ){
2074	        event.preventDefault();
2075	        goHome()
2076	      }
2077	    "
2078	  >
2079	
2080	    <div class="brand-mark">
2081	      G
2082	    </div>
2083	
2084	
2085	    <div>
2086	
2087	      <div class="brand-name">
2088	        GETWELL
2089	      </div>
2090	
2091	      <div class="brand-sub">
2092	        Weight Loss Admin
2093	      </div>
2094	
2095	    </div>
2096	
2097	  </div>
2098	
2099	
2100	  <nav class="nav">
2101	
2102	    <div class="nav-label">
2103	      MAIN
2104	    </div>
2105	
2106	
2107	    <a
2108	      class="${
2109	        active ===
2110	          "dashboard"
2111	          ? "active"
2112	          : ""
2113	      }"
2114	      href="index.html"
2115	    >
2116	      ⌂ Dashboard
2117	    </a>
2118	
2119	
2120	    ${
2121	      showPatients
2122	        ? `
2123	
2124	          <a
2125	            class="${
2126	              active ===
2127	                "patients"
2128	                ? "active"
2129	                : ""
2130	            }"
2131	            href="patients.html"
2132	          >
2133	            ♙ Patients
2134	          </a>
2135	
2136	        `
2137	        : ""
2138	    }
2139	
2140	
2141	    ${
2142	      showAppointments
2143	        ? `
2144	
2145	          <a
2146	            class="${
2147	              active ===
2148	                "appointments"
2149	                ? "active"
2150	                : ""
2151	            }"
2152	            href="appointments.html"
2153	          >
2154	            ▣ Appointments
2155	          </a>
2156	
2157	        `
2158	        : ""
2159	    }
2160	
2161	
2162	    <div
2163	      class="nav-label"
2164	      style="margin-top:18px"
2165	    >
2166	      MANAGEMENT
2167	    </div>
2168	
2169	
2170	    ${
2171	      showPanel
2172	        ? `
2173	
2174	          <a
2175	            class="${
2176	              active ===
2177	                "panel"
2178	                ? "active"
2179	                : ""
2180	            }"
2181	            href="panel.html"
2182	          >
2183	            ▣ Panel
2184	          </a>
2185	
2186	        `
2187	        : ""
2188	    }
2189	
2190	
2191	    ${
2192	      showReports
2193	        ? `
2194	
2195	          <a
2196	            class="${
2197	              active ===
2198	                "reports"
2199	                ? "active"
2200	                : ""
2201	            }"
2202	            href="reports.html"
2203	          >
2204	            ▤ Reports
2205	          </a>
2206	
2207	        `
2208	        : ""
2209	    }
2210	
2211	
2212	    <a
2213	      class="${
2214	        active ===
2215	          "settings"
2216	          ? "active"
2217	          : ""
2218	      }"
2219	      href="settings.html"
2220	    >
2221	      ⚙ Settings
2222	    </a>
2223	
2224	
2225	  </nav>
2226	
2227	
2228	  <div class="sidebar-user">
2229	
2230	    <div class="user-card">
2231	
2232	      <div class="user-dot">
2233	        A
2234	      </div>
2235	
2236	      <div>
2237	
2238	        <div class="user-name">
2239	          Administrator
2240	        </div>
2241	
2242	        <div class="user-role">
2243	          Weight Loss Program
2244	        </div>
2245	
2246	      </div>
2247	
2248	    </div>
2249	
2250	  </div>
2251	
2252	
2253	</aside>
2254	
2255	`;
2256	
2257	}
2258	
2259	
2260	/* =========================================================
2261	   HOME
2262	
2263	
2264	function goHome(){
2265	
2266	  window.location.href =
2267	    "index.html";
2268	
2269	}
2270	
2271	
2272	/* =========================================================
2273	   SHELL
2274	
2275	
2276	function shell(
2277	  title,
2278	  active,
2279	  body
2280	){
2281	
2282	  document.title =
2283	    title +
2284	    " | Getwell";
2285	
2286	
2287	  return `
2288	
2289	<div class="app">
2290	
2291	  ${sidebar(
2292	    active
2293	  )}
2294	
2295	  <main class="main">
2296	
2297	    ${header()}
2298	
2299	    <div class="content">
2300	
2301	      ${body}
2302	
2303	    </div>
2304	
2305	  </main>
2306	
2307	</div>
2308	
2309	`;
2310	
2311	}
2312	
2313	
2314	/* =========================================================
2315	   NOTIFICATIONS
2316	
2317	
2318	function toggleNotifications(
2319	  event
2320	){
2321	
2322	  if(event){
2323	
2324	    event.stopPropagation();
2325	
2326	  }
2327	
2328	
2329	  const panel =
2330	    document.getElementById(
2331	      "notifPanel"
2332	    );
2333	
2334	
2335	  if(!panel){
2336	
2337	    return;
2338	
2339	  }
2340	
2341	
2342	  panel.hidden =
2343	    !panel.hidden;
2344	
2345	
2346	  if(
2347	    !panel.hidden
2348	  ){
2349	
2350	    renderNotifications();
2351	
2352	  }
2353	
2354	}
2355	
2356	
2357	function renderNotifications(){
2358	
2359	  const list =
2360	    alerts();
2361	
2362	
2363	  const count =
2364	    document.getElementById(
2365	      "notifCount"
2366	    );
2367	
2368	
2369	  const body =
2370	    document.getElementById(
2371	      "notifBody"
2372	    );
2373	
2374	
2375	  if(
2376	    !count ||
2377	    !body
2378	  ){
2379	
2380	    return;
2381	
2382	  }
2383	
2384	
2385	  count.hidden =
2386	    list.length ===
2387	    0;
2388	
2389	
2390	  count.textContent =
2391	    list.length >
2392	      99
2393	      ? "99+"
2394	      : list.length;
2395	
2396	
2397	  if(!list.length){
2398	
2399	    body.innerHTML = `
2400	
2401	      <div class="notif-empty">
2402	        No patients are due.
2403	      </div>
2404	
2405	    `;
2406	
2407	
2408	    return;
2409	
2410	  }
2411	
2412	
2413	  body.innerHTML =
2414	    list
2415	      .map(
2416	        patient => `
2417	
2418	          <div
2419	            class="notif-item"
2420	            onclick="
2421	              location.href=
2422	                'patient-profile.html?patient=' +
2423	                encodeURIComponent(
2424	                  '${String(
2425	                    patient.id
2426	                  )
2427	                  .replace(
2428	                    /'/g,
2429	                    "\\'"
2430	                  )}'
2431	                )
2432	            "
2433	          >
2434	
2435	            <span
2436	              class="
2437	                notif-dot
2438	                ${patient.level}
2439	              "
2440	            ></span>
2441	
2442	
2443	            <div>
2444	
2445	              <div class="notif-name">
2446	                ${patient.name}
2447	              </div>
2448	
2449	
2450	              <div class="notif-text">
2451	
2452	                ${
2453	                  patient.level ===
2454	                    "overdue"
2455	                    ? "Overdue"
2456	                    : "Due for Follow-Up"
2457	                }
2458	
2459	                ·
2460	
2461	                ${patient.days}
2462	
2463	                days since last visit.
2464	
2465	              </div>
2466	
2467	            </div>
2468	
2469	          </div>
2470	
2471	        `
2472	      )
2473	      .join("");
2474	
2475	}
2476	
2477	
2478	/* =========================================================
2479	   CLOSE NOTIFICATIONS
2480	
2481	
2482	document.addEventListener(
2483	  "click",
2484	  event => {
2485	
2486	    const wrapper =
2487	      document.getElementById(
2488	        "notifWrap"
2489	      );
2490	
2491	
2492	    const panel =
2493	      document.getElementById(
2494	        "notifPanel"
2495	      );
2496	
2497	
2498	    if(
2499	      wrapper &&
2500	      panel &&
2501	      !wrapper.contains(
2502	        event.target
2503	      )
2504	    ){
2505	
2506	      panel.hidden =
2507	        true;
2508	
2509	    }
2510	
2511	  }
2512	);
2513	
2514	
2515	/* =========================================================
2516	   SETTINGS UPDATE
2517	
2518	
2519	window.addEventListener(
2520	  "storage",
2521	  event => {
2522	
2523	    if(
2524	      event.key ===
2525	      GW_SETTINGS_UPDATED_KEY
2526	    ){
2527	
2528	      /*
2529	        Settings page stays open.
2530	
2531	        Every other page reloads so
2532	        the new configuration applies.
2533	      */
2534	
2535	      if(
2536	        !location.pathname
2537	          .toLowerCase()
2538	          .endsWith(
2539	            "settings.html"
2540	          )
2541	      ){
2542	
2543	        location.reload();
2544	
2545	      }
2546	
2547	    }
2548	
2549	  }
2550	);
2551	
2552	
2553	/* =========================================================
2554	   INITIALIZATION
2555	
2556	
2557	document.addEventListener(
2558	  "DOMContentLoaded",
2559	  () => {
2560	
2561	    /*
2562	      Only READ settings here.
2563	
2564	      Do not call:
2565	      getSettings()
2566	      saveSettings()
2567	      mergeSettings()
2568	      because those belong to
2569	      settings.html.
2570	    */
2571	
2572	    getwellSystemSettings();
2573	
2574	
2575	    initTheme();
2576	
2577	
2578	    renderNotifications();
2579	
2580	
2581	    getwellStartRemoteSync();
2582	
2583	  }
2584	);
