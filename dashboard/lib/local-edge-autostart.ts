// Starting a native Windows process must remain an explicit operator action.
// Calling this protocol during web login produces a browser/application prompt
// (or opens a legacy batch launcher) on every workstation, including machines
// that are not the branch gateway.
export function requestInstalledEdgeStart() {
  const launcher = document.createElement("iframe");
  launcher.setAttribute("aria-hidden", "true");
  launcher.style.display = "none";
  launcher.src = "sentinel-grid-scanner://start";
  document.body.appendChild(launcher);
  window.setTimeout(() => launcher.remove(), 1_000);
}
