import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import App from './ui/App.tsx';

import "./index.css";
import MonacoWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";

// Dont load monaco from 3rd party CDN.
loader.config({ monaco });

globalThis.MonacoEnvironment = {
    getWorker() {
        return new MonacoWorker();
    }
};

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
