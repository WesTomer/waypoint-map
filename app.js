// --- Explicit Close Handlers ---
document.querySelectorAll('button[value="cancel"]').forEach(btn => {
  btn.type = "button"; // Forces Safari to ignore form submission entirely
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.closest("dialog").close();
  };
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