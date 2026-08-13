// --- Explicit Close Handlers & Debugger ---
document.addEventListener("click", (e) => {
  // 1. Debugger: Log ANY click inside a dialog to see what is actually happening
  const dialog = e.target.closest("dialog");
  if (dialog && e.target.tagName !== "DIALOG") {
    const el = e.target;
    const info = `Target: <${el.tagName.toLowerCase()}>
ID: "${el.id}"
Class: "${el.className}"
Value: "${el.value || 'undefined'}"
Type: "${el.type || 'undefined'}"
Text: "${el.textContent.trim().substring(0, 20)}"
Mode: ${state.isEditMode ? 'Edit' : 'View'}`;
    
    debugLog(info);
  }

  // 2. The actual close logic
  const btn = e.target.closest('button[value="cancel"]') || e.target.closest('.close-btn'); 
  
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    
    const parentDialog = btn.closest("dialog");
    if (parentDialog) {
      debugLog("SUCCESS: Close button matched and dialog.close() fired.");
      parentDialog.close();
    } else {
      debugLog("ERROR: Close button matched, but no parent <dialog> found.");
    }
  }
}, true); // The 'true' activates the capture phase

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