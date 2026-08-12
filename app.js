import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const DB_NAME="WaypointMapDB", DB_VERSION=1;
const state={project:null, projects:[], placing:false, selectedMarkerId:null, editing:false, tempMap:null, pdf:null, pdfPage:1};

const $=id=>document.getElementById(id);
const emptyState=$("emptyState"), mapSection=$("mapSection"), mapImage=$("mapImage"), pdfCanvas=$("pdfCanvas"), mapStage=$("mapStage"), markerLayer=$("markerLayer");

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains("projects"))db.createObjectStore("projects",{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbPut(project){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("projects","readwrite");tx.objectStore("projects").put(project);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function dbAll(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction("projects").objectStore("projects").getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbDelete(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction("projects","readwrite");tx.objectStore("projects").delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();
const now=()=>new Date().toISOString();

function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(file)})}
function blobFromDataURL(data){const [meta,b64]=data.split(",");const mime=meta.match(/data:(.*?);/)?.[1]||"application/octet-stream";const bin=atob(b64);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:mime})}

async function loadProjects(){state.projects=await dbAll();renderProjectList()}
function newProject(){state.tempMap=null;$("projectName").value="";$("selectedMap").textContent="";$("createBtn").disabled=true;$("projectDialog").showModal()}
function renderProjectList(){const list=$("projectList");list.innerHTML="";if(!state.projects.length){list.innerHTML="<p class='fileName'>No saved projects.</p>";return}state.projects.sort((a,b)=>b.updated.localeCompare(a.updated)).forEach(p=>{const row=document.createElement("div");row.className="projectItem";row.innerHTML=`<div><strong>${esc(p.name)}</strong><div class="fileName">${p.markers.length} marker${p.markers.length===1?"":"s"}</div></div>`;const open=document.createElement("button");open.className="secondary";open.textContent="Open";open.onclick=()=>{$("projectsDialog").close();openProject(p.id)};row.append(open);list.append(row)})}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

async function openProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;state.project=p;state.placing=false;state.selectedMarkerId=null;state.editing=false;$("projectTitle").textContent=p.name;emptyState.classList.add("hidden");mapSection.classList.remove("hidden");await renderBase();renderMarkers();$("statusBar").textContent="Tap a marker to view/edit it. Use + Marker to add one."}
async function renderBase(){mapImage.classList.add("hidden");pdfCanvas.classList.add("hidden");if(state.project.mapType==="image"){mapImage.src=state.project.mapData;mapImage.onload=()=>{mapStage.style.width=mapImage.naturalWidth+"px";mapStage.style.height=mapImage.naturalHeight+"px";mapImage.classList.remove("hidden");}}else{await renderPDF()}}
async function renderPDF(){try{if(!pdfjsLib){setStatus("PDF engine is unavailable.");return}const data=atob(state.project.mapData.split(",")[1]);const arr=new Uint8Array(data.length);for(let i=0;i<data.length;i++)arr[i]=data.charCodeAt(i);const loading=window.pdfjsLib.getDocument({data:arr});state.pdf=await loading.promise;await renderPDFPage(state.pdfPage)}catch(e){console.error(e);setStatus("Could not render this PDF.")}}
async function renderPDFPage(pageNo){const page=await state.pdf.getPage(pageNo);const viewport=page.getViewport({scale:1.5});pdfCanvas.width=viewport.width;pdfCanvas.height=viewport.height;mapStage.style.width=viewport.width+"px";mapStage.style.height=viewport.height+"px";pdfCanvas.classList.remove("hidden");await page.render({canvasContext:pdfCanvas.getContext("2d"),viewport}).promise}
function renderMarkers(){markerLayer.innerHTML="";(state.project?.markers||[]).forEach(m=>{const el=document.createElement("div");el.className="marker";el.style.left=(m.x*100)+"%";el.style.top=(m.y*100)+"%";el.title=m.name||"Waypoint";if(m.name){const lab=document.createElement("span");lab.className="markerLabel";lab.textContent=m.name;el.append(lab)}el.onclick=e=>{e.stopPropagation();openMarker(m.id)};markerLayer.append(el)})}
function setStatus(s){$("statusBar").textContent=s}

function addMarkerAt(e){if(!state.placing)return;const r=mapStage.getBoundingClientRect();const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x<0||x>1||y<0||y>1)return;const m={id:uid(),x,y,name:"",notes:"",photos:[],created:now(),updated:now()};state.project.markers.push(m);state.project.updated=now();state.placing=false;mapViewport.classList.remove("placing");renderMarkers();dbPut(state.project);openMarker(m.id)}
function openMarker(id){const m=state.project.markers.find(x=>x.id===id);if(!m)return;state.selectedMarkerId=id;$("markerDialogTitle").textContent=m.name||"Waypoint";$("markerName").value=m.name||"";$("markerNotes").value=m.notes||"";renderPhotos(m);$("markerDialog").showModal()}
function renderPhotos(m){const grid=$("photoGrid");grid.innerHTML="";m.photos.forEach((p,i)=>{const d=document.createElement("div");d.className="photoThumb";const im=document.createElement("img");im.src=p.data;im.onclick=()=>showPhoto(p.data);const b=document.createElement("button");b.type="button";b.textContent="×";b.onclick=()=>{m.photos.splice(i,1);renderPhotos(m);};d.append(im,b);grid.append(d)});const add=document.createElement("div");add.className="photoThumb addPhoto";add.textContent="＋ Photo";add.onclick=()=>$("photoFile").click();grid.append(add)}
function showPhoto(src){$("largePhoto").src=src;$("photoDialog").showModal()}

$("newProjectBtn").onclick=newProject;$("newFromListBtn").onclick=()=>{$("projectsDialog").close();newProject()};$("projectsBtn").onclick=()=>{$("projectsDialog").showModal();loadProjects()};$("chooseMapBtn").onclick=()=>$("mapFile").click();
$("mapFile").onchange=()=>{const f=$("mapFile").files[0];if(!f)return;state.tempMap=f;$("selectedMap").textContent=`${f.name} (${Math.round(f.size/1024)} KB)`;$("createBtn").disabled=!$("projectName").value.trim()};
$("projectName").oninput=()=>{$("createBtn").disabled=!state.tempMap||!$("projectName").value.trim()};
$("createBtn").onclick=async e=>{if(!state.tempMap)return;e.preventDefault();const f=state.tempMap;const data=await fileToDataURL(f);const p={id:uid(),name:$("projectName").value.trim(),mapType:f.type==="application/pdf"?"pdf":"image",mapData:data,markers:[],created:now(),updated:now()};await dbPut(p);state.projects=await dbAll();$("projectDialog").close();openProject(p.id)};
$("addMarkerBtn").onclick=()=>{state.placing=!state.placing;mapViewport.classList.toggle("placing",state.placing);setStatus(state.placing?"Tap the exact location on the map. Tap + Marker again to cancel.":"Marker placement cancelled.")};
$("editBtn").onclick=()=>{if(state.project){$("projectName").value=state.project.name;state.tempMap=null;alert("Project editing will be expanded in the next version. Marker editing is available by tapping a marker.")}};
$("fitBtn").onclick=()=>{$("mapViewport").scrollTo({top:0,left:0,behavior:"smooth"})};
$("exportBtn").onclick=async()=>{if(!state.project)return;const blob=new Blob([JSON.stringify(state.project)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=state.project.name.replace(/[^a-z0-9-_]+/gi,"_")+".waypoint.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$("importBtn").onclick=()=>$("importFile").click();
$("importFile").onchange=async()=>{const f=$("importFile").files[0];if(!f)return;try{const p=JSON.parse(await f.text());if(!p.id||!p.mapData||!Array.isArray(p.markers))throw Error();p.id=uid();p.updated=now();await dbPut(p);state.projects=await dbAll();$("projectsDialog").close();openProject(p.id)}catch{alert("That file is not a valid Waypoint Map project.")}};
$("photoFile").onchange=async()=>{const m=state.project?.markers.find(x=>x.id===state.selectedMarkerId);if(!m)return;for(const f of $("photoFile").files){if(!f.type.startsWith("image/"))continue;m.photos.push({id:uid(),name:f.name,data:await fileToDataURL(f),created:now()})}$("photoFile").value="";renderPhotos(m)};
$("saveMarkerBtn").onclick=async e=>{e.preventDefault();const m=state.project.markers.find(x=>x.id===state.selectedMarkerId);if(!m)return;m.name=$("markerName").value.trim();m.notes=$("markerNotes").value.trim();m.updated=now();state.project.updated=now();await dbPut(state.project);renderMarkers();$("markerDialog").close()};
$("deleteMarkerBtn").onclick=async()=>{const i=state.project.markers.findIndex(x=>x.id===state.selectedMarkerId);if(i<0)return;if(!confirm("Delete this waypoint and all photos attached to it?"))return;state.project.markers.splice(i,1);state.project.updated=now();await dbPut(state.project);$("markerDialog").close();renderMarkers()};
$("closePhotoBtn").onclick=()=>$("photoDialog").close();
$("mapViewport").onclick=addMarkerAt;
mapImage.ondblclick=e=>e.preventDefault();

if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("service-worker.js").catch(console.warn);
loadProjects().then(()=>{if(state.projects.length)openProject(state.projects.sort((a,b)=>b.updated.localeCompare(a.updated))[0].id)}).catch(console.error);
