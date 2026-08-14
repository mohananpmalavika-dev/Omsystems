const autostartKey = "sentinel-grid:local-edge-autostart-requested";

export function resetLocalEdgeAutostart() {
  try {
    window.sessionStorage.removeItem(autostartKey);
  } catch {
    return;
  }
}

export function requestLocalEdgeAutostart() {
  try {
    if (window.sessionStorage.getItem(autostartKey)) return;
    window.sessionStorage.setItem(autostartKey, "1");
  } catch {
    return;
  }

  const launcher = document.createElement("iframe");
  launcher.setAttribute("aria-hidden", "true");
  launcher.style.display = "none";
  launcher.src = "sentinel-grid-scanner://start";
  document.body.appendChild(launcher);
  window.setTimeout(() => launcher.remove(), 1_000);
}
