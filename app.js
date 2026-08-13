import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// --- Configuration & State ---
const DB_NAME = "WaypointMapDB";
const DB_VERSION = 1;

const state = {
  project: null,
  projects: [],
  placing: false,
  selectedMarkerId: null,
  editing: false,
  tempMap: null,
  pdf: null,
  pdfPage: 1,
  baseWidth: 0,
  baseHeight: 0,
  scale: 1
};

// --- DOM Utilities ---
const $ = (id) => document.getElementById(id);
const emptyState = $("emptyState");
const mapSection = $("mapSection");
const mapImage = $("mapImage");
const pdfCanvas = $("pdfCanvas");
const mapStage = $("mapStage");
const markerLayer = $("markerLayer");
const mapViewport = $("mapViewport");

const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random();
const now = () => new Date().toISOString();
const setStatus = (msg) => $("statusBar").textContent = msg;
const esc = (s) => String(s || "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

// --- IndexedDB Setup & Wrappers ---
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(project) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- File Handling ---
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// --- Project Management ---
async function loadProjects() {
  state.projects = await dbAll();
  renderProjectList();
}

function newProject() {
  state.tempMap = null;
  $("projectName").value = "";
  $("selectedMap").textContent = "";
  $("createBtn").disabled = true;
  $("projectDialog").showModal();
}

function renderProjectList() {
  const list = $("projectList");
  list.innerHTML = "";
  if (!state.projects.length) {
    list.innerHTML = "<p class='fileName'>No saved projects.</p>";
    return;
  }
  state.projects.sort((a, b) => b.updated.localeCompare(a.updated)).forEach(project => {
    const row = document.createElement("div");
    row.className = "projectItem";
    row.innerHTML = `
      <div>
        <strong>${esc(project.name)}</strong>
        <div class="fileName">${project.markers.length} marker${project.markers.length === 1 ? "" : "s"}</div>
      </div>
    `;
    const openBtn = document.createElement("button");
    openBtn.className = "secondary";
    openBtn.textContent = "Open";
    openBtn.onclick = () => {
      $("projectsDialog").close();
      openProject(project.id);
    };
    row.append(openBtn);
    list.append(row);
  });
}

async function openProject(id) {
  const project = state.projects.find(x => x.id === id);
  if (!project) return;
  
  state.project = project;
  togglePlacing(false);
  state.selectedMarkerId = null;
  state.editing = false;
  
  $("projectTitle").textContent = project.name;
  emptyState.classList.add("hidden");
  mapSection.classList.remove("hidden");
  
  await renderBase();
  renderMarkers();
}

// --- Map & PDF Rendering ---
function applyScale() {
  mapStage.style.width = (state.baseWidth * state.scale) + "px";
  mapStage.style.height = (state.baseHeight * state.scale) + "px";
}

async function renderBase() {
  mapImage.classList.add("hidden");
  pdfCanvas.classList.add("hidden");
  
  if (state.project.mapType === "image") {
    mapImage.src = state.project.mapData;
    mapImage.onload = () => {
      state.baseWidth = mapImage.naturalWidth;
      state.baseHeight = mapImage.naturalHeight;
      state.scale = 1;
      
      mapImage.style.width = "100%";
      mapImage.style.height = "100%";
      applyScale();
      
      mapImage.classList.remove("hidden");
      $("fitBtn").click(); // Auto-fit on load
    };
  } else {
    await renderPDF();
  }
}

async function renderPDF() {
  try {
    if (!pdfjsLib) {
      setStatus("PDF engine is unavailable.");
      return;
    }
    const data = atob(state.project.mapData.split(",")[1]);
    const arr = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      arr[i] = data.charCodeAt(i);
    }
    const loading = window.pdfjsLib.getDocument({ data: arr });
    state.pdf = await loading.promise;
    await renderPDFPage(state.pdfPage);
  } catch (e) {
    console.error(e);
    setStatus("Could not render this PDF.");
  }
}

async function renderPDFPage(pageNo) {
  const page = await state.pdf.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1.5 });
  
  state.baseWidth = viewport.width;
  state.baseHeight = viewport.height;
  state.scale = 1;
  
  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  pdfCanvas.style.width = "100%";
  pdfCanvas.style.height = "100%";
  
  applyScale();
  pdfCanvas.classList.remove("hidden");
  
  await page.render({ canvasContext: pdfCanvas.getContext("2d"), viewport }).promise;
  $("fitBtn").click(); // Auto-fit on load
}

// --- Marker Management ---
function togglePlacing(force) {
  state.placing = force !== undefined ? force : !state.placing;
  mapViewport.classList.toggle("placing", state.placing);
  const btn = $("addMarkerBtn");
  
  if (state.placing) {
    btn.textContent = "Cancel Marker";
    btn.classList.add("danger");
    btn.classList.remove("primary");
    setStatus("Tap the exact location on the map. Tap Cancel to abort.");
  } else {
    btn.textContent = "＋ Marker";
    btn.classList.add("primary");
    btn.classList.remove("danger");
    setStatus("Tap a marker to view/edit it. Use + Marker to add one.");
  }
}

function renderMarkers() {
  markerLayer.innerHTML = "";
  (state.project?.markers || []).forEach(marker => {
    const el = document.createElement("div");
    el.className = "marker";
    el.style.left = (marker.x * 100) + "%";
    el.style.top = (marker.y * 100) + "%";
    el.title = marker.name || "Waypoint";
    
    if (marker.name) {
      const label = document.createElement("span");
      label.className = "markerLabel";
      label.textContent = marker.name;
      el.append(label);
    }
    
    el.onclick = (e) => {
      e.stopPropagation();
      openMarker(marker.id);
    };
    markerLayer.append(el);
  });
}

function addMarkerAt(e) {
  if (!state.placing) return;
  
  const rect = mapStage.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  
  const newMarker = { 
    id: uid(), x, y, name: "", notes: "", photos: [], 
    created: now(), updated: now() 
  };
  
  state.project.markers.push(newMarker);
  state.project.updated = now();
  
  togglePlacing(false);
  renderMarkers();
  dbPut(state.project);
  openMarker(newMarker.id);
}

function openMarker(id) {
  const marker = state.project.markers.find(x => x.id === id);
  if (!marker) return;
  
  state.selectedMarkerId = id;
  $("markerDialogTitle").textContent = marker.name || "Waypoint";
  $("markerName").value = marker.name || "";
  $("markerNotes").value = marker.notes || "";
  
  renderPhotos(marker);
  $("markerDialog").showModal();
}

function renderPhotos(marker) {
  const grid = $("photoGrid");
  grid.innerHTML = "";
  
  marker.photos.forEach((photo, i) => {
    const wrapper = document.createElement("div");
    wrapper.className = "photoThumb";
    
    const img = document.createElement("img");
    img.src = photo.data;
    img.onclick = () => showPhoto(photo.data);
    
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "×";
    deleteBtn.onclick = () => {
      marker.photos.splice(i, 1);
      renderPhotos(marker);
    };
    
    wrapper.append(img, deleteBtn);
    grid.append(wrapper);
  });
  
  const addBtn = document.createElement("div");
  addBtn.className = "photoThumb addPhoto";
  addBtn.textContent = "＋ Photo";
  addBtn.onclick = () => $("photoFile").click();
  grid.append(addBtn);
}

function showPhoto(src) {
  $("largePhoto").src = src;
  $("photoDialog").showModal();
}

// --- Pinch to Zoom ---
let pinchStartDist = 0;
let pinchStartScale = 1;

mapViewport.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    pinchStartDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    pinchStartScale = state.scale;
  }
}, { passive: false });

mapViewport.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault(); // Stop native scrolling during pinch
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    let newScale = pinchStartScale * (dist / pinchStartDist);
    newScale = Math.max(0.1, Math.min(newScale, 10)); // Min 0.1x, Max 10x zoom
    
    state.scale = newScale;
    applyScale();
  }
}, { passive: false });


// --- Event Listeners ---
$("newProjectBtn").onclick = newProject;
$("newFromListBtn").onclick = () => { $("projectsDialog").close(); newProject(); };
$("projectsBtn").onclick = () => { $("projectsDialog").showModal(); loadProjects(); };
$("chooseMapBtn").onclick = () => $("mapFile").click();

$("mapFile").onchange = () => {
  const file = $("mapFile").files[0];
  if (!file) return;
  state.tempMap = file;
  $("selectedMap").textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  $("createBtn").disabled = !$("projectName").value.trim();
};

$("projectName").oninput = () => {
  $("createBtn").disabled = !state.tempMap || !$("projectName").value.trim();
};

$("createBtn").onclick = async (e) => {
  if (!state.tempMap) return;
  e.preventDefault();
  
  const file = state.tempMap;
  const data = await fileToDataURL(file);
  const project = {
    id: uid(),
    name: $("projectName").value.trim(),
    mapType: file.type === "application/pdf" ? "pdf" : "image",
    mapData: data,
    markers: [],
    created: now(),
    updated: now()
  };
  
  await dbPut(project);
  state.projects = await dbAll();
  $("projectDialog").close();
  openProject(project.id);
};

$("addMarkerBtn").onclick = () => togglePlacing();

$("editBtn").onclick = () => {
  if (state.project) {
    $("projectName").value = state.project.name;
    state.tempMap = null;
    alert("Project editing will be expanded in the next version. Marker editing is available by tapping a marker.");
  }
};

$("fitBtn").onclick = () => {
  const padding = 40;
  const scaleX = (mapViewport.clientWidth - padding) / state.baseWidth;
  const scaleY = (mapViewport.clientHeight - padding) / state.baseHeight;
  
  state.scale = Math.min(scaleX, scaleY, 1); 
  applyScale();
  $("mapViewport").scrollTo({ top: 0, left: 0, behavior: "smooth" });
};

$("exportBtn").onclick = async () => {
  if (!state.project) return;
  const blob = new Blob([JSON.stringify(state.project)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.project.name.replace(/[^a-z0-9-_]+/gi, "_") + ".waypoint.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$("importBtn").onclick = () => $("importFile").click();

$("importFile").onchange = async () => {
  const file = $("importFile").files[0];
  if (!file) return;
  try {
    const project = JSON.parse(await file.text());
    if (!project.id || !project.mapData || !Array.isArray(project.markers)) throw Error();
    project.id = uid();
    project.updated = now();
    await dbPut(project);
    state.projects = await dbAll();
    $("projectsDialog").close();
    openProject(project.id);
  } catch {
    alert("That file is not a valid Waypoint Map project.");
  }
};

$("photoFile").onchange = async () => {
  const marker = state.project?.markers.find(x => x.id === state.selectedMarkerId);
  if (!marker) return;
  
  for (const file of $("photoFile").files) {
    if (!file.type.startsWith("image/")) continue;
    marker.photos.push({
      id: uid(),
      name: file.name,
      data: await fileToDataURL(file),
      created: now()
    });
  }
  $("photoFile").value = "";
  renderPhotos(marker);
};

$("saveMarkerBtn").onclick = async (e) => {
  e.preventDefault();
  const marker = state.project.markers.find(x => x.id === state.selectedMarkerId);
  if (!marker) return;
  
  marker.name = $("markerName").value.trim();
  marker.notes = $("markerNotes").value.trim();
  marker.updated = now();
  state.project.updated = now();
  
  await dbPut(state.project);
  renderMarkers();
  $("markerDialog").close();
};

$("deleteMarkerBtn").onclick = async () => {
  const index = state.project.markers.findIndex(x => x.id === state.selectedMarkerId);
  if (index < 0) return;
  if (!confirm("Delete this waypoint and all photos attached to it?")) return;
  
  state.project.markers.splice(index, 1);
  state.project.updated = now();
  await dbPut(state.project);
  
  $("markerDialog").close();
  renderMarkers();
};

$("closePhotoBtn").onclick = () => $("photoDialog").close();
$("mapViewport").onclick = addMarkerAt;
mapImage.ondblclick = (e) => e.preventDefault();

// --- Initialization ---
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(console.warn);
}

loadProjects().then(() => {
  if (state.projects.length) {
    openProject(state.projects.sort((a, b) => b.updated.localeCompare(a.updated))[0].id);
  }
}).catch(console.error);