// Close marker dialog when clicking outside (on the backdrop)
$("markerDialog").addEventListener("click", (e) => {
  if (e.target === $("markerDialog")) {
    $("markerDialog").close();
  }
});

// Explicitly bind the close button if it exists in your HTML
const closeMarkerBtn = $("closeMarkerBtn"); // Replace with your actual close button ID if different
if (closeMarkerBtn) {
  closeMarkerBtn.onclick = (e) => {
    e.preventDefault();
    $("markerDialog").close();
  };
}

// Optional: Apply the same "click outside to close" logic to the photo dialog and project dialog
$("photoDialog").addEventListener("click", (e) => {
  if (e.target === $("photoDialog")) $("photoDialog").close();
});

$("projectsDialog").addEventListener("click", (e) => {
  if (e.target === $("projectsDialog")) $("projectsDialog").close();
});

$("projectDialog").addEventListener("click", (e) => {
  if (e.target === $("projectDialog")) $("projectDialog").close();
});