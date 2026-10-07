import { useCallback, useEffect, useState } from 'react';
import type { editor } from 'monaco-editor';
import { hierarchyNavigation } from '../logic/Inheritance';
import type { DecompileResult } from '../workers/decompile/types';
import { showInheritanceIcons } from '../logic/Settings';
import { useObservable } from '../utils/UseObservable';
import { installHierarchyGutter, type HierarchyChooser } from './inheritance/HierarchyGutterController';
import { HierarchyTargetPopup } from './inheritance/HierarchyTargetPopup';
import './inheritance/HierarchyGutter.css';

export function HierarchyGutter({ codeEditor, result }: {
    codeEditor: editor.IStandaloneCodeEditor | null;
    result: DecompileResult | undefined;
}) {
    const showIcons = useObservable(showInheritanceIcons.observable);
    const navigation = useObservable(hierarchyNavigation);
    const [chooser, setChooser] = useState<HierarchyChooser | null>(null);
    const closeChooser = useCallback(() => setChooser(null), []);

    useEffect(() => {
        setChooser(null);
    }, [navigation?.jarName, result?.className, result?.jarName, result?.language, result?.source]);

    useEffect(() => {
        if (!codeEditor || !result || result.language !== 'java' || navigation?.jarName !== result.jarName) return;
        return installHierarchyGutter({ codeEditor, result, navigation: navigation.index, showIcons, onChoose: setChooser });
    }, [codeEditor, result, navigation, showIcons]);

    if (!chooser) return null;
    return <HierarchyTargetPopup
        key={`${chooser.line}:${chooser.direction}:${chooser.position.x}:${chooser.position.y}`}
        chooser={chooser}
        codeEditor={codeEditor}
        onClose={closeChooser}
    />;
}
