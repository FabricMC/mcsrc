import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import App from './ui/App.tsx';
import { editorFontZoom } from './logic/Settings.ts';

import "./index.css";
import MonacoWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";

// Dont load monaco from 3rd party CDN.
loader.config({ monaco });

monaco.editor.EditorZoom.setZoomLevel(editorFontZoom.value);
monaco.editor.EditorZoom.onDidChangeZoomLevel((zoomLevel) => {
    editorFontZoom.value = zoomLevel;
});

globalThis.MonacoEnvironment = {
    getWorker(_moduleId, label) {
        if (label === "json") {
            return new JsonWorker();
        }
        return new MonacoWorker();
    }
};

// Enables installing the site and opening it offline. Registration is optional:
// an unsupported browser simply ignores it.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        void navigator.serviceWorker.register("/sw.js");
    });
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
