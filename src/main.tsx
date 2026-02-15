import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import MonacoWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./ui/App.tsx";

// Dont load monaco from 3rd party CDN.
loader.config({ monaco });

globalThis.MonacoEnvironment = {
  getWorker() {
    return new MonacoWorker();
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
