// --- Explicit Close Handlers ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest('button[value="cancel"]');
  if (!btn) return;
  
  // Prevent any native form submission/validation logic
  e.preventDefault();
  e.stopPropagation();
  
  const dialog = btn.closest("dialog");
  if (dialog) dialog.close();
});

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