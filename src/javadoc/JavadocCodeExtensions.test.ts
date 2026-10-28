import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import type { editor, IDisposable } from 'monaco-editor';
import { applyJavadocCodeExtensions } from './JavadocCodeExtensions';
import { activeJavadocToken, javadocRevision } from './Javadoc';
import { createJavadocView, createRawJavadocView } from './JavadocView';
import { jarIndex, type ClassData, type JarIndex } from '../workers/jar-index/client';
import type { DecompileResult } from '../workers/decompile/types';
import { toClassName } from '../utils/Names';
import { renderJavadoc } from '../logic/Settings';

vi.mock('monaco-editor', () => ({}));
vi.mock('./Javadoc', async () => {
    const { BehaviorSubject } = await import('rxjs');
    return {
        activeJavadocToken: new BehaviorSubject(null),
        javadocRevision: new BehaviorSubject(0),
        getJavadocForToken: () => 'Documentation',
    };
});
vi.mock('../logic/Browser', async () => {
    const { BehaviorSubject } = await import('rxjs');
    return { isDarkMode: new BehaviorSubject(false) };
});
vi.mock('../logic/Settings', async () => {
    const { BehaviorSubject } = await import('rxjs');
    return { renderJavadoc: { observable: new BehaviorSubject(true) } };
});
vi.mock('../workers/jar-index/client', async () => {
    const { Subject } = await import('rxjs');
    return { jarIndex: new Subject() };
});
vi.mock('./JavadocView', () => ({
    createJavadocView: vi.fn(() => ({ dispose: vi.fn() })),
    createRawJavadocView: vi.fn(() => ({ dispose: vi.fn() })),
}));

const indexes = jarIndex as Subject<JarIndex>;
const renderMarkdown = renderJavadoc.observable as Subject<boolean>;
const result = {
    source: 'class Owner {}',
    tokens: [{ type: 'class', className: toClassName('Owner'), declaration: true, start: 6, length: 5 }],
} as DecompileResult;
let extensions: IDisposable | undefined;

function disposeExtensions() {
    extensions?.dispose();
    extensions = undefined;
}

function createIndex(classes: Promise<ClassData[]> = Promise.resolve([])): JarIndex {
    return {
        getClassData: () => classes,
        getMemberData: async () => [],
    } as unknown as JarIndex;
}

function setupEditor() {
    const modelChange = vi.fn((_listener: () => void) => ({ dispose: vi.fn() }));
    const configurationChange = vi.fn((_listener: (event: editor.ConfigurationChangedEvent) => void) => ({ dispose: vi.fn() }));
    const codeEditor = {
        getModel: () => ({ getValue: () => result.source }),
        onDidChangeModel: modelChange,
        onDidChangeConfiguration: configurationChange,
    } as unknown as editor.IStandaloneCodeEditor;
    const monaco = {
        editor: { EditorOption: { fontInfo: 1 }, addEditorAction: () => ({ dispose: vi.fn() }) },
        languages: { registerCodeLensProvider: () => ({ dispose: vi.fn() }) },
    } as unknown as typeof import('monaco-editor');
    extensions = applyJavadocCodeExtensions(monaco, codeEditor, result);
    return { modelChange, configurationChange };
}

beforeEach(() => {
    vi.clearAllMocks();
    activeJavadocToken.next(null);
    javadocRevision.next(0);
    renderMarkdown.next(true);
});

afterEach(disposeExtensions);

describe('Javadoc render subscriptions', () => {
    it('switches to raw Markdown while symbols load and restores rendering when enabled', async () => {
        let finishLoad!: (classes: ClassData[]) => void;
        const loading = new Promise<ClassData[]>(resolve => {
            finishLoad = resolve;
        });
        setupEditor();
        indexes.next(createIndex(loading));
        renderMarkdown.next(false);
        expect(createRawJavadocView).toHaveBeenCalledOnce();
        const rawView = vi.mocked(createRawJavadocView).mock.results[0].value;

        finishLoad([]);
        await loading;
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(createJavadocView).not.toHaveBeenCalled();

        renderMarkdown.next(true);
        expect(rawView.dispose).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(createJavadocView).toHaveBeenCalledOnce());
    });

    it('ignores an older symbol load that finishes after a newer refresh', async () => {
        let finishOldLoad!: (classes: ClassData[]) => void;
        const oldLoad = new Promise<ClassData[]>(resolve => {
            finishOldLoad = resolve;
        });
        setupEditor();
        indexes.next(createIndex(oldLoad));
        indexes.next(createIndex());
        await vi.waitFor(() => expect(createJavadocView).toHaveBeenCalledTimes(1));

        finishOldLoad([]);
        await oldLoad;
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(createJavadocView).toHaveBeenCalledTimes(1);
    });

    it('does not render a pending load after disposal', async () => {
        let finishLoad!: (classes: ClassData[]) => void;
        const loading = new Promise<ClassData[]>(resolve => {
            finishLoad = resolve;
        });
        setupEditor();
        indexes.next(createIndex(loading));
        disposeExtensions();

        finishLoad([]);
        await loading;
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(createJavadocView).not.toHaveBeenCalled();
    });

    it('refreshes on model and font changes and disposes replaced views', async () => {
        const { modelChange, configurationChange } = setupEditor();
        indexes.next(createIndex());
        await vi.waitFor(() => expect(createJavadocView).toHaveBeenCalledTimes(1));
        const firstView = vi.mocked(createJavadocView).mock.results[0].value;

        modelChange.mock.calls[0][0]();
        expect(firstView.dispose).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(createJavadocView).toHaveBeenCalledTimes(2));
        const secondView = vi.mocked(createJavadocView).mock.results[1].value;

        configurationChange.mock.calls[0][0]({ hasChanged: () => true } as unknown as editor.ConfigurationChangedEvent);
        expect(secondView.dispose).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(createJavadocView).toHaveBeenCalledTimes(3));
        const lastView = vi.mocked(createJavadocView).mock.results[2].value;

        disposeExtensions();
        expect(lastView.dispose).toHaveBeenCalledOnce();
    });
});
