// --- Debug Logger ---
function debugLog(info) {
  let debugDiv = $("debugDiv");
  if (!debugDiv) {
    debugDiv = document.createElement("div");
    debugDiv.id = "debugDiv";
    debugDiv.style.cssText = "position:fixed;bottom:10px;right:10px;background:#222;color:#fff;padding:10px;z-index:9999;border-radius:8px;width:300px;box-shadow: 0 4px 12px rgba(0,0,0,0.5);";
    
    const textArea = document.createElement("textarea");
    textArea.id = "debugText";
    textArea.style.cssText = "width:100%;height:150px;background:#111;color:#0f0;border:1px solid #444;font-family:monospace;font-size:11px;margin-bottom:8px;resize:vertical;";
    
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy to Clipboard";
    copyBtn.style.cssText = "width:100%;padding:8px;background:#007BFF;color:white;border:none;border-radius:4px;cursor:pointer;";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(textArea.value).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.style.background = "#28A745";
        setTimeout(() => {
          copyBtn.textContent = "Copy to Clipboard";
          copyBtn.style.background = "#007BFF";
        }, 2000);
      });
    };
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "position:absolute;top:5px;right:5px;background:red;color:white;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1;";
    closeBtn.onclick = () => debugDiv.remove();

    debugDiv.append(closeBtn, textArea, copyBtn);
    document.body.appendChild(debugDiv);
  }
  
  const ta = $("debugText");
  const timestamp = new Date().toLocaleTimeString();
  ta.value = `[${timestamp}]\n${info}\n\n` + "------------------------\n" + ta.value;
}