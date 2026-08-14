import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

// --- Configuration & State ---
const DB_NAME = "WaypointMapDB";
const DB_VERSION = 1;

const state = {
  project: null,
  projects: [],
  placing: false,
  isEditMode: true, // Toggles between Edit and View modes
  selectedMarkerId: null,
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
const setStatus = (msg) => {
  const bar = $("statusBar");
  if (bar) bar.textContent = msg;
};
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
  if ($("projectName")) $("projectName").value = "";
  if ($("selectedMap")) $("selectedMap").textContent = "";
  if ($("createBtn")) $("createBtn").disabled = true;
  $("projectDialog")?.showModal();
}

function renderProjectList() {
  const list = $("projectList");
  if (!list) return;
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
      $("projectsDialog")?.close();
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
  toggleMode(true); // Default to Edit Mode when opening
  state.selectedMarkerId = null;
  
  if ($("projectTitle")) $("projectTitle").textContent = project.name;
  emptyState?.classList.add("hidden");
  mapSection?.classList.remove("hidden");
  
  await renderBase();
  renderMarkers();
}

// --- Map & PDF Rendering ---
function applyScale() {
  if (!mapStage) return;
  mapStage.style.width = (state.baseWidth * state.scale) + "px";
  mapStage.style.height = (state.baseHeight * state.scale) + "px";
}

async function renderBase() {
  mapImage?.classList.add("hidden");
  pdfCanvas?.classList.add("hidden");
  
  if (state.project.mapType === "image") {
    if (!mapImage) return;
    mapImage.src = state.project.mapData;
    mapImage.onload = () => {
      state.baseWidth = mapImage.naturalWidth;
      state.baseHeight = mapImage.naturalHeight;
      state.scale = 1;
      
      mapImage.style.width = "100%";
      mapImage.style.height = "100%";
      applyScale();
      
      mapImage.classList.remove("hidden");
      $("fitBtn")?.click(); 
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
    const loading = pdfjsLib.getDocument({ data: arr });
    state.pdf = await loading.promise;
    await renderPDFPage(state.pdfPage);
  } catch (e) {
    console.error(e);
    setStatus("Could not render this PDF.");
  }
}

async function renderPDFPage(pageNo) {
  if (!pdfCanvas) return;
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
  $("fitBtn")?.click(); 
}

// --- Application Modes (Edit/View) & Markers ---
function toggleMode(forceEdit) {
  state.isEditMode = forceEdit !== undefined ? forceEdit : !state.isEditMode;
  
  const editBtn = $("editBtn");
  const addBtn = $("addMarkerBtn");
  
  if (state.isEditMode) {
    if (editBtn) {
      editBtn.textContent = "Mode: Edit";
      editBtn.classList.add("primary");
      editBtn.classList.remove("secondary");
    }
    addBtn?.classList.remove("hidden");
    setStatus("Edit Mode: Tap a marker to edit, or use + Marker to add one.");
  } else {
    if (editBtn) {
      editBtn.textContent = "Mode: View";
      editBtn.classList.add("secondary");
      editBtn.classList.remove("primary");
    }
    addBtn?.classList.add("hidden");
    if (state.placing) togglePlacing(false);
    setStatus("View Mode: Tap a marker to view details and photos.");
  }
}

function togglePlacing(force) {
  if (!state.isEditMode) return;
  
  state.placing = force !== undefined ? force : !state.placing;
  mapViewport?.classList.toggle("placing", state.placing);
  const btn = $("addMarkerBtn");
  
  if (state.placing) {
    if (btn) {
      btn.textContent = "Cancel Marker";
      btn.classList.add("danger");
      btn.classList.remove("primary");
    }
    setStatus("Tap the exact location on the map. Tap Cancel to abort.");
  } else {
    if (btn) {
      btn.textContent = "＋ Marker";
      btn.classList.add("primary");
      btn.classList.remove("danger");
    }
    setStatus("Edit Mode: Tap a marker to edit, or use + Marker to add one.");
  }
}

function renderMarkers() {
  if (!markerLayer) return;
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
  if (!state.placing || !state.isEditMode || !mapStage) return;
  
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
  if ($("markerDialogTitle")) $("markerDialogTitle").textContent = marker.name || "Waypoint";
  
  // Set values
  if ($("markerName")) $("markerName").value = marker.name || "";
  if ($("markerNotes")) $("markerNotes").value = marker.notes || "";
  
  // Lock or unlock inputs based on mode
  if ($("markerName")) $("markerName").readOnly = !state.isEditMode;
  if ($("markerNotes")) $("markerNotes").readOnly = !state.isEditMode;
  
  // Hide or show action buttons based on mode
  $("saveMarkerBtn")?.classList.toggle("hidden", !state.isEditMode);
  $("deleteMarkerBtn")?.classList.toggle("hidden", !state.isEditMode);
  
  renderPhotos(marker);
  $("markerDialog")?.showModal();
}

function renderPhotos(marker) {
  const grid = $("photoGrid");
  if (!grid) return;
  grid.innerHTML = "";
  
  marker.photos.forEach((photo, i) => {
    const wrapper = document.createElement("div");
    wrapper.className = "photoThumb";
    
    const img = document.createElement("img");
    img.src = photo.data;
    img.onclick = () => showPhoto(photo.data);
    wrapper.append(img);
    
    // Only show delete buttons in Edit Mode
    if (state.isEditMode) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "×";
      deleteBtn.onclick = () => {
        marker.photos.splice(i, 1);
        renderPhotos(marker);
      };
      wrapper.append(deleteBtn);
    }
    
    grid.append(wrapper);
  });
  
  // Only show Add Photo button in Edit Mode
  if (state.isEditMode) {
    const addBtn = document.createElement("div");
    addBtn.className = "photoThumb addPhoto";
    addBtn.textContent = "＋ Photo";
    addBtn.onclick = () => $("photoFile")?.click();
    grid.append(addBtn);
  }
}

function showPhoto(src) {
  if ($("largePhoto")) $("largePhoto").src = src;
  $("photoDialog")?.showModal();
}

// --- Dynamic GUI Injection (Gallery & Full Screen Viewer) ---
function ensureGalleryDOM() {
  // Inject "All Photos" button into toolbar if missing
  if (!$("allPhotosBtn")) {
    const allPhotosBtn = document.createElement("button");
    allPhotosBtn.id = "allPhotosBtn";
    allPhotosBtn.className = "secondary";
    allPhotosBtn.textContent = "📷 All Photos";
    
    const targetParent = $("editBtn")?.parentElement || document.querySelector("header") || document.body;
    targetParent.appendChild(allPhotosBtn);
  }

  // Inject Gallery Dialog if missing
  if (!$("galleryDialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "galleryDialog";
    dialog.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0;">All Photos</h3>
        <button id="closeGalleryBtn" class="secondary" style="padding:4px 10px;">✕</button>
      </div>
      <div id="allPhotosGrid" class="photoGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(90px, 1fr)); gap:10px; max-height:60vh; overflow-y:auto;"></div>
    `;
    document.body.appendChild(dialog);
  }

  // Inject Fullscreen Photo Dialog if missing
  if (!$("fullPhotoDialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "fullPhotoDialog";
    dialog.style.cssText = "padding:0; border:none; background:rgba(0,0,0,0.92); width:100vw; height:100vh; max-width:100vw; max-height:100vh; color:white; margin:0;";
    dialog.innerHTML = `
      <div style="position:relative; width:100vw; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <img id="fullPhotoImage" style="max-width:95vw; max-height:calc(100vh - 100px); object-fit:contain; border-radius:4px;" />
        <div style="position:absolute; bottom:24px; display:flex; gap:16px; z-index:100;">
          <button id="backToGalleryBtn" class="secondary" style="padding:12px 20px; font-size:1rem; cursor:pointer;">← Back</button>
          <button id="goToWaypointBtn" class="primary" style="padding:12px 20px; font-size:1rem; cursor:pointer;">📍 Go to Waypoint</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
  }
}

// --- Gallery & Waypoint Focus Operations ---
function openGallery() {
  if (!state.project) return;
  const grid = $("allPhotosGrid");
  if (!grid) return;
  
  grid.innerHTML = "";
  
  const allPhotos = [];
  state.project.markers.forEach(marker => {
    (marker.photos || []).forEach(photo => {
      allPhotos.push({ photo, marker });
    });
  });

  if (!allPhotos.length) {
    grid.innerHTML = "<p style='grid-column: 1/-1; color: #777; text-align: center;'>No photos attached to any waypoints.</p>";
  } else {
    allPhotos.forEach(({ photo, marker }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "photoThumb";
      wrapper.style.cssText = "position:relative; cursor:pointer; aspect-ratio:1; overflow:hidden; border-radius:6px; background:#111;";
      
      const img = document.createElement("img");
      img.src = photo.data;
      img.style.cssText = "width:100%; height:100%; object-fit:cover;";
      
      const label = document.createElement("div");
      label.textContent = marker.name || "Waypoint";
      label.style.cssText = "position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:white; font-size:10px; padding:2px 4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;";

      wrapper.append(img, label);
      wrapper.onclick = () => openFullScreenPhoto(photo, marker);
      grid.append(wrapper);
    });
  }

  $("galleryDialog")?.showModal();
}

function openFullScreenPhoto(photo, marker) {
  const fullImg = $("fullPhotoImage");
  if (fullImg) fullImg.src = photo.data;

  const backBtn = $("backToGalleryBtn");
  if (backBtn) {
    backBtn.onclick = () => {
      $("fullPhotoDialog")?.close();
    };
  }

  const goBtn = $("goToWaypointBtn");
  if (goBtn) {
    goBtn.onclick = () => focusOnWaypoint(marker.id);
  }

  $("fullPhotoDialog")?.showModal();
}

function focusOnWaypoint(markerId) {
  const marker = state.project?.markers.find(m => m.id === markerId);
  if (!marker || !mapViewport) return;

  // 1. Close all modals
  $("fullPhotoDialog")?.close();
  $("galleryDialog")?.close();

  // 2. Set zoom to a focused 2.5x magnification
  const targetScale = Math.max(state.scale, 2.5);
  state.scale = targetScale;
  applyScale();

  // 3. Compute absolute stage pixels for marker position
  const targetX = marker.x * (state.baseWidth * state.scale);
  const targetY = marker.y * (state.baseHeight * state.scale);

  // 4. Center the coordinate in the scrollable mapViewport
  const scrollLeft = targetX - (mapViewport.clientWidth / 2);
  const scrollTop = targetY - (mapViewport.clientHeight / 2);

  mapViewport.scrollTo({
    left: Math.max(0, scrollLeft),
    top: Math.max(0, scrollTop),
    behavior: "smooth"
  });

  setStatus(`Centered on: ${marker.name || "Waypoint"}`);
}

// --- Pinch to Zoom (Focal Point) ---
let pinchStartDist = 0;
let pinchStartScale = 1;
let isPinching = false;

if (mapViewport) {
  mapViewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isPinching = true;
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartScale = state.scale;
    }
  }, { passive: false });

  mapViewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault(); // Stop native scrolling during pinch
      
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      const rect = mapViewport.getBoundingClientRect();
      const px = centerX - rect.left;
      const py = centerY - rect.top;
      
      const mapX = (px + mapViewport.scrollLeft) / state.scale;
      const mapY = (py + mapViewport.scrollTop) / state.scale;

      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      let newScale = pinchStartScale * (dist / pinchStartDist);
      newScale = Math.max(0.1, Math.min(newScale, 10)); // Min 0.1x, Max 10x zoom
      
      state.scale = newScale;
      applyScale();
      
      mapViewport.scrollLeft = (mapX * state.scale) - px;
      mapViewport.scrollTop = (mapY * state.scale) - py;
    }
  }, { passive: false });

  mapViewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      isPinching = false;
    }
  });

  mapViewport.onclick = addMarkerAt;
}

if (mapImage) {
  mapImage.ondblclick = (e) => e.preventDefault();
}

// --- Event Listeners & Safe Modal Handlers ---

// Ensure DOM elements for Gallery exist
ensureGalleryDOM();

// Utility to close modals when touching/clicking outside on the backdrop
const attachBackdropClose = (id) => {
  const dialog = $(id);
  if (!dialog) return;
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
};

attachBackdropClose("markerDialog");
attachBackdropClose("photoDialog");
attachBackdropClose("projectsDialog");
attachBackdropClose("projectDialog");
attachBackdropClose("galleryDialog");

// Explicit Modal Close Buttons
$("closeMarkerBtn")?.addEventListener("click", (e) => { e.preventDefault(); $("markerDialog")?.close(); });
$("closePhotoBtn")?.addEventListener("click", (e) => { e.preventDefault(); $("photoDialog")?.close(); });
$("closeProjectsBtn")?.addEventListener("click", (e) => { e.preventDefault(); $("projectsDialog")?.close(); });
$("closeProjectBtn")?.addEventListener("click", (e) => { e.preventDefault(); $("projectDialog")?.close(); });
$("closeGalleryBtn")?.addEventListener("click", (e) => { e.preventDefault(); $("galleryDialog")?.close(); });

// Main Application Buttons
$("allPhotosBtn")?.addEventListener("click", openGallery);
$("newProjectBtn")?.addEventListener("click", newProject);
$("newFromListBtn")?.addEventListener("click", () => { $("projectsDialog")?.close(); newProject(); });
$("projectsBtn")?.addEventListener("click", () => { $("projectsDialog")?.showModal(); loadProjects(); });
$("chooseMapBtn")?.addEventListener("click", () => $("mapFile")?.click());

if ($("mapFile")) {
  $("mapFile").onchange = () => {
    const file = $("mapFile").files[0];
    if (!file) return;
    state.tempMap = file;
    if ($("selectedMap")) $("selectedMap").textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    if ($("createBtn")) $("createBtn").disabled = !$("projectName")?.value.trim();
  };
}

if ($("projectName")) {
  $("projectName").oninput = () => {
    if ($("createBtn")) $("createBtn").disabled = !state.tempMap || !$("projectName")?.value.trim();
  };
}

$("createBtn")?.addEventListener("click", async (e) => {
  if (!state.tempMap) return;
  e.preventDefault();
  
  const file = state.tempMap;
  const data = await fileToDataURL(file);
  const project = {
    id: uid(),
    name: $("projectName") ? $("projectName").value.trim() : "Untitled Project",
    mapType: file.type === "application/pdf" ? "pdf" : "image",
    mapData: data,
    markers: [],
    created: now(),
    updated: now()
  };
  
  await dbPut(project);
  state.projects = await dbAll();
  $("projectDialog")?.close();
  openProject(project.id);
});

$("editBtn")?.addEventListener("click", () => toggleMode());
$("addMarkerBtn")?.addEventListener("click", () => togglePlacing());

$("fitBtn")?.addEventListener("click", () => {
  if (!mapViewport) return;
  const padding = 40;
  const scaleX = (mapViewport.clientWidth - padding) / state.baseWidth;
  const scaleY = (mapViewport.clientHeight - padding) / state.baseHeight;
  
  state.scale = Math.min(scaleX, scaleY, 1); 
  applyScale();
  mapViewport.scrollTo({ top: 0, left: 0, behavior: "smooth" });
});

$("exportBtn")?.addEventListener("click", async () => {
  if (!state.project) return;
  const blob = new Blob([JSON.stringify(state.project)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.project.name.replace(/[^a-z0-9-_]+/gi, "_") + ".waypoint.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$("importBtn")?.addEventListener("click", () => $("importFile")?.click());

if ($("importFile")) {
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
      $("projectsDialog")?.close();
      openProject(project.id);
    } catch {
      alert("That file is not a valid Waypoint Map project.");
    }
  };
}

if ($("photoFile")) {
  $("photoFile").onchange = async () => {
    if (!state.isEditMode) return;
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
}

$("saveMarkerBtn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!state.isEditMode) return;
  
  const marker = state.project.markers.find(x => x.id === state.selectedMarkerId);
  if (!marker) return;
  
  if ($("markerName")) marker.name = $("markerName").value.trim();
  if ($("markerNotes")) marker.notes = $("markerNotes").value.trim();
  marker.updated = now();
  state.project.updated = now();
  
  await dbPut(state.project);
  renderMarkers();
  $("markerDialog")?.close();
});

$("deleteMarkerBtn")?.addEventListener("click", async () => {
  if (!state.isEditMode) return;
  
  const index = state.project.markers.findIndex(x => x.id === state.selectedMarkerId);
  if (index < 0) return;
  if (!confirm("Delete this waypoint and all photos attached to it?")) return;
  
  state.project.markers.splice(index, 1);
  state.project.updated = now();
  await dbPut(state.project);
  
  $("markerDialog")?.close();
  renderMarkers();
});

// --- Initialization ---
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(console.warn);
}

loadProjects().then(() => {
  if (state.projects.length) {
    openProject(state.projects.sort((a, b) => b.updated.localeCompare(a.updated))[0].id);
  }
}).catch(console.error);