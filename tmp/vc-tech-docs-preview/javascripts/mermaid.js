document$.subscribe(() => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: document.querySelector("[data-md-color-scheme='slate']")
      ? "dark"
      : "default",
  });
  mermaid.run({ querySelector: ".mermaid" });
});
