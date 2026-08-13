// --- Explicit Close Handlers ---
function closeDialogFromButton(btn) {
  if (!btn) return false;

  // Edit-mode buttons are inside their dialog. Some view-mode waypoint
  // controls can be rendered outside it, so also support aria-controls.
  let dialog = btn.closest("dialog");
  const controlledId = btn.getAttribute("aria-controls");

  if (!dialog && controlledId) {
    const controlledElement = document.getElementById(controlledId);
    if (controlledElement instanceof HTMLDialogElement) {
      dialog = controlledElement;
    }
  }

  // Final waypoint-specific fallback for the view-mode popup.
  if (!dialog && btn.matches('[data-close="waypoint"], [data-action="close-waypoint"]')) {
    dialog = document.querySelector(
      'dialog[data-dialog="waypoint"][open], #waypointDialog[open], #viewWaypointDialog[open]'
    );
  }

  if (!dialog || !(dialog instanceof HTMLDialogElement)) return false;
  dialog.close("cancel");
  return true;
}

// Capture the click before map/view-mode handlers can consume it.
document.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const btn = target.closest(
    'button[value="cancel"], button[data-close="waypoint"], button[data-action="close-waypoint"]'
  );
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  closeDialogFromButton(btn);
}, true);

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