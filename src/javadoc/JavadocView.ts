import type { editor, IDisposable } from 'monaco-editor';
import { outerClassFilePath, toClassFilePath } from '../utils/Names';
import { openCodeTab } from '../logic/tabs';
import { requestTokenJump } from '../ui/CodeExtensions';
import { getTokenLocation, type Token } from '../logic/Tokens';
import type { DecompileResult } from '../workers/decompile/types';
import type { JavadocSymbols } from './editor/JavadocSymbols';
import { renderJavadocMarkdown } from './JavadocMarkdown';

export function createRawJavadocView(
    codeEditor: editor.IStandaloneCodeEditor,
    result: DecompileResult,
    token: Token,
    markdown: string,
): IDisposable {
    const domNode = document.createElement('div');
    domNode.className = 'javadoc-raw';
    codeEditor.applyFontInfo(domNode);
    domNode.style.tabSize = String(codeEditor.getModel()?.getOptions().tabSize ?? 4);
    const lineStart = result.source.lastIndexOf('\n', token.start - 1) + 1;
    const indentation = /^[\t ]*/.exec(result.source.slice(lineStart))![0];
    const lines = markdown.split('\n');
    domNode.textContent = lines.map(line => `${indentation}/// ${line}`).join('\n');
    let zoneId = '';
    codeEditor.changeViewZones(accessor => {
        zoneId = accessor.addZone({
            afterLineNumber: getTokenLocation(result, token).line - 1,
            heightInLines: lines.length,
            domNode,
        });
    });
    return {
        dispose() {
            codeEditor.changeViewZones(accessor => accessor.removeZone(zoneId));
        },
    };
}

export function createJavadocView(
    monaco: typeof import('monaco-editor'),
    codeEditor: editor.IStandaloneCodeEditor,
    result: DecompileResult,
    token: Token,
    markdown: string,
    symbols: JavadocSymbols,
): IDisposable {
    const { html, links } = renderJavadocMarkdown(markdown, symbols, { kind: token.type });
    const domNode = document.createElement('section');
    domNode.className = 'javadoc-rendered';
    domNode.setAttribute('aria-label', 'Javadoc');
    codeEditor.applyFontInfo(domNode);
    domNode.innerHTML = html;
    domNode.onmousedown = event => event.stopPropagation();
    domNode.onkeydown = event => event.stopPropagation();
    domNode.onclick = event => {
        if (!(event.target instanceof Element)) return;

        const anchor = event.target.closest('a');
        if (!anchor) return;

        const target = links.get(anchor.getAttribute('href') ?? '');
        if (target) {
            event.preventDefault();
            const file = outerClassFilePath(toClassFilePath(target.className));
            let identifier = target.className as string;
            if (target.type === 'method') {
                identifier = `${target.name}:${target.descriptor}`;
            } else if (target.type === 'field') {
                identifier = target.name;
            }
            if (target.type === 'class' || target.type === 'method' || target.type === 'field') {
                requestTokenJump(file, target.type, identifier, target.className);
                openCodeTab(file);
            }
        } else {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
        }
    };

    const lineStart = result.source.lastIndexOf('\n', token.start - 1) + 1;
    const indentation = /^[\t ]*/.exec(result.source.slice(lineStart))![0];
    const tabSize = codeEditor.getModel()?.getOptions().tabSize ?? 4;
    let indentColumns = 0;
    for (const character of indentation) {
        indentColumns += character === '\t' ? tabSize - indentColumns % tabSize : 1;
    }
    const updateWidth = () => {
        const layout = codeEditor.getLayoutInfo();
        const font = codeEditor.getOption(monaco.editor.EditorOption.fontInfo);
        const indent = indentColumns * font.spaceWidth;
        domNode.style.left = `${layout.contentLeft + indent}px`;
        domNode.style.width = `${Math.max(0, layout.contentWidth - indent - 16)}px`;
    };
    updateWidth();
    const layoutListener = codeEditor.onDidLayoutChange(updateWidth);
    const zone: editor.IViewZone = {
        afterLineNumber: getTokenLocation(result, token).line - 1,
        heightInPx: 1,
        domNode: document.createElement('div'),
        onDomNodeTop: top => {
            domNode.style.top = `${top}px`;
        },
    };
    // View zones are hidden from accessibility APIs; keep links in an overlay widget.
    const widget: editor.IOverlayWidget = {
        getId: () => `mcsrc.javadoc.${token.start}`,
        getDomNode: () => domNode,
        getPosition: () => null,
    };
    codeEditor.addOverlayWidget(widget);
    let zoneId = '';
    codeEditor.changeViewZones(accessor => {
        zoneId = accessor.addZone(zone);
    });
    const updateHeight = () => {
        const height = Math.ceil(domNode.getBoundingClientRect().height);
        if (zone.heightInPx === height) return;

        zone.heightInPx = height;
        codeEditor.changeViewZones(accessor => accessor.layoutZone(zoneId));
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(domNode);

    let disposed = false;
    for (const code of domNode.querySelectorAll('pre > code')) {
        const language = /\blanguage-(\S+)/.exec(code.className)?.[1] ?? 'java';
        const registered = monaco.languages.getLanguages().find(candidate => candidate.id === language || candidate.aliases?.includes(language));
        if (!registered) continue;

        const source = (code.textContent ?? '').replace(/\n$/, '');
        void monaco.editor.colorize(source, registered.id, { tabSize }).then(highlighted => {
            if (!disposed) {
                code.innerHTML = highlighted;
            }
        }).catch(error => console.warn('Unable to highlight Javadoc code', error));
    }
    return {
        dispose() {
            disposed = true;
            observer.disconnect();
            layoutListener.dispose();
            codeEditor.removeOverlayWidget(widget);
            codeEditor.changeViewZones(accessor => accessor.removeZone(zoneId));
        },
    };
}
