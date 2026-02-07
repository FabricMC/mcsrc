import { combineLatest } from "rxjs";
import { resetPermalinkAffectingSettings, supportsPermalinking } from "./Settings";
import { diffView, selectedFile, selectedLines, selectedMinecraftVersion } from "./State";

interface State {
    version: number; // Allows us to change the permalink structure in the future
    minecraftVersion: string;
    file: string;
    selectedLines: {
        line: number;
        lineEnd?: number;
    } | null;
}

const DEFAULT_STATE: State = {
    version: 0,
    minecraftVersion: "",
    file: "net/minecraft/ChatFormatting.class",
    selectedLines: null
};

const getInitialState = (): State => {
    // Try pathname first (new style), fall back to hash (old style for backwards compatibility)
    const pathname = window.location.pathname;
    const hash = window.location.hash;
    
    // Use pathname if it's not just "/" (new style), otherwise use hash (old style)
    let path = pathname !== '/' && pathname !== '' 
        ? pathname.slice(1) // Remove leading /
        : (hash.startsWith('#/') ? hash.slice(2) : (hash.startsWith('#') ? hash.slice(1) : ''));

    // Check for line number marker (e.g., #L123 or #L10-20)
    let lineNumber: number | null = null;
    let lineEnd: number | null = null;
    const lineMatch = path.match(/(?:#|%23)L(\d+)(?:-(\d+))?$/);
    if (lineMatch) {
        lineNumber = parseInt(lineMatch[1], 10);
        if (lineMatch[2]) {
            lineEnd = parseInt(lineMatch[2], 10);
        }
        path = path.substring(0, lineMatch.index);
    }

    const segments = path.split('/').filter(s => s.length > 0);

    if (segments.length < 3) {
        return DEFAULT_STATE;
    }

    resetPermalinkAffectingSettings();

    const version = parseInt(segments[0], 10);
    let minecraftVersion = decodeURIComponent(segments[1]);
    const filePath = segments.slice(2).join('/');

    // Backwards compatibility with the incorrect version name used previously
    if (minecraftVersion == "25w45a") {
        minecraftVersion = "25w45a_unobfuscated";
    }

    return {
        version,
        minecraftVersion,
        file: filePath + (filePath.endsWith('.class') ? '' : '.class'),
        selectedLines: lineNumber ? { line: lineNumber, lineEnd: lineEnd || undefined } : null
    };
};

export const initalState = getInitialState();

window.addEventListener('load', () => {
    combineLatest([
        selectedMinecraftVersion,
        selectedFile,
        selectedLines,
        supportsPermalinking,
        diffView
    ]).subscribe(([
        minecraftVersion,
        file,
        selectedLines,
        supported,
        diffView
    ]) => {
        const className = file.split('/').pop()?.replace('.class', '') || file;
        document.title = className;

        if (!supported || diffView) {
            window.history.replaceState({}, '', '/');
            return;
        }

        let url = `/1/${minecraftVersion}/${file.replace(".class", "")}`;

        if (selectedLines) {
            const { line, lineEnd } = selectedLines;
            if (lineEnd && lineEnd !== line) {
                url += `#L${Math.min(line, lineEnd)}-${Math.max(line, lineEnd)}`;
            } else {
                url += `#L${line}`;
            }
        }

        window.history.replaceState({}, '', url);
    });
});