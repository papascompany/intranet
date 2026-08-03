import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

if ("serviceWorker" in navigator && window.isSecureContext) {
  void navigator.serviceWorker.register("/push-sw.js", { scope: "/" }).catch(() => {
    // The intranet remains usable when a browser disables background features.
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
