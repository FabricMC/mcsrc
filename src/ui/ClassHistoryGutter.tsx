import { useCallback, useEffect, useState } from 'react';
import { editor, Range } from 'monaco-editor';
import { isUnobfuscated, minecraftVersions } from '../logic/MinecraftApi';
import { selectedMinecraftVersion } from '../logic/State';
import { showClassHistoryIcons } from '../logic/Settings';
import { minecraftJarSide } from '../SiteConfig';
import { outerClassName } from '../utils/Names';
import { useObservable } from '../utils/UseObservable';
import type { DecompileResult } from '../workers/decompile/types';
import { ClassHistoryPopup, type HistoryChooser } from './history/ClassHistoryPopup';
import './ClassHistoryGutter.css';

export function ClassHistoryGutter({ codeEditor, result }: {
    codeEditor: editor.IStandaloneCodeEditor | null;
    result: DecompileResult | undefined;
}) {
    const versions = useObservable(minecraftVersions);
    const selectedVersion = useObservable(selectedMinecraftVersion);
    const showIcons = useObservable(showClassHistoryIcons.observable);
    const [chooser, setChooser] = useState<HistoryChooser | null>(null);

    useEffect(() => {
        setChooser(null);
        if (!showIcons || !codeEditor || !result || result.language !== 'java' || !versions || minecraftJarSide !== 'client'
            || result.jarName !== selectedVersion) return;
        const historyVersions = versions.filter(version => isUnobfuscated(version)
            && new Date(version.releaseTime) >= new Date('2025-01-01'));
        if (historyVersions.length < 2) return;
        if (!historyVersions.some(version => version.id === selectedVersion)) return;
        const className = outerClassName(result.className);
        const token = result.tokens.find(token => token.declaration && token.type === 'class' && token.className === className);
        if (!token) return;
        const decorations = codeEditor.createDecorationsCollection();
        let line: number | undefined;
        const decorate = () => {
            const model = codeEditor.getModel();
            decorations.clear();
            line = undefined;
            if (!model || model.getValue() !== result.source) return;
            line = model.getPositionAt(token.start).lineNumber;
            decorations.set([{
                range: new Range(line, 1, line, 1),
                options: {
                    glyphMarginClassName: 'class-history-glyph',
                    glyphMargin: { position: editor.GlyphMarginLane.Right },
                    glyphMarginHoverMessage: { value: 'Show class history' },
                },
            }]);
        };
        decorate();
        const modelChange = codeEditor.onDidChangeModel(decorate);
        const mouse = codeEditor.onMouseDown(event => {
            if (!event.event.leftButton || event.target.type !== editor.MouseTargetType.GUTTER_GLYPH_MARGIN
                || event.target.detail.glyphMarginLane !== editor.GlyphMarginLane.Right
                || line === undefined || event.target.position?.lineNumber !== line) return;
            event.event.preventDefault();
            event.event.stopPropagation();
            setChooser({
                className,
                versions: historyVersions,
                currentVersion: selectedVersion,
                x: event.event.browserEvent.clientX,
                y: event.event.browserEvent.clientY,
            });
        });
        return () => {
            decorations.clear();
            modelChange.dispose();
            mouse.dispose();
        };
    }, [codeEditor, result, versions, selectedVersion, showIcons]);

    const close = useCallback(() => setChooser(null), []);
    return chooser && <ClassHistoryPopup key={`${chooser.className}:${chooser.currentVersion}`} chooser={chooser} onClose={close} />;
}
