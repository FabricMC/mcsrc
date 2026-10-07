import { Observable, startWith, switchMap } from 'rxjs';
import { editor, KeyCode, KeyMod, Range } from 'monaco-editor';
import type { HierarchyNavigation, HierarchyTarget } from '../../logic/HierarchyNavigation';
import type { DecompileResult } from '../../workers/decompile/types';
import { outerClassFilePath, toClassFilePath } from '../../utils/Names';
import { openCodeTab } from '../../logic/tabs';
import { requestTokenJump } from '../CodeExtensions';

export interface GutterAction {
    line: number;
    direction: 'parents' | 'children';
    title: string;
    icon: 'overridingMethod' | 'overridenMethod' | 'implementingMethod' | 'implementedMethod';
    targets: HierarchyTarget[];
}

export interface PopupPosition {
    x: number;
    y: number;
}

export interface HierarchyChooser extends GutterAction {
    position: PopupPosition;
}

export function navigateToHierarchyTarget(target: HierarchyTarget) {
    const file = outerClassFilePath(toClassFilePath(target.className));
    const identifier = target.type === 'method' ? `${target.name}:${target.descriptor}` : target.className;
    requestTokenJump(file, target.type, identifier, target.className);
    openCodeTab(file);
}

interface HierarchyGutterOptions {
    codeEditor: editor.IStandaloneCodeEditor;
    result: DecompileResult;
    navigation: HierarchyNavigation;
    showIcons: boolean;
    onChoose: (chooser: HierarchyChooser) => void;
}

export function installHierarchyGutter(options: HierarchyGutterOptions) {
    const modelChanges = new Observable<void>(subscriber => {
        const listener = options.codeEditor.onDidChangeModel(() => subscriber.next());
        return () => listener.dispose();
    });
    const subscription = modelChanges.pipe(
        startWith(undefined),
        switchMap(() => new Observable<never>(() => installModelGutter(options))),
    ).subscribe();
    return () => subscription.unsubscribe();
}

function installModelGutter({ codeEditor, result, navigation, showIcons, onChoose }: HierarchyGutterOptions) {
    const actions: GutterAction[] = [];
    const model = codeEditor.getModel();
    if (!model || model.getValue() !== result.source) return () => {};
    const decorations = codeEditor.createDecorationsCollection();

    for (const token of result.tokens) {
        if (!token.declaration || (token.type !== 'class' && token.type !== 'method')) continue;
        const relations = navigation.relations(token);
        const line = model.getPositionAt(token.start).lineNumber;
        for (const direction of ['parents', 'children'] as const) {
            const targets = relations[direction];
            if (targets.length === 0) continue;
            let title: string;
            let icon: GutterAction['icon'];
            if (token.type === 'class') {
                title = direction === 'parents' ? 'Go to supertype' : 'Go to subclass / implementation';
                if (direction === 'parents') {
                    const implementsInterfaces = targets.every(target => navigation.isInterfaceClass(target.className));
                    icon = implementsInterfaces ? 'implementingMethod' : 'overridingMethod';
                } else {
                    const interfaceClass = navigation.isInterfaceClass(token.className);
                    icon = interfaceClass ? 'implementedMethod' : 'overridenMethod';
                }
            } else if ('descriptor' in token) {
                title = direction === 'parents' ? 'Go to super method' : 'Go to overriding / implementing method';
                if (direction === 'parents') {
                    const implementsAbstractMethod = targets.every(target => navigation.isAbstractDeclaration(target));
                    icon = implementsAbstractMethod ? 'implementingMethod' : 'overridingMethod';
                } else {
                    const abstractMethod = navigation.isAbstractDeclaration({
                        className: token.className, type: 'method', name: token.name, descriptor: token.descriptor,
                    });
                    icon = abstractMethod ? 'implementedMethod' : 'overridenMethod';
                }
            } else {
                continue;
            }
            actions.push({ line, direction, title, icon, targets });
        }
    }
    decorations.set(showIcons ? actions.map(action => ({
        range: new Range(action.line, 1, action.line, 1),
        options: {
            glyphMarginClassName: `hierarchy-glyph hierarchy-${action.direction} hierarchy-icon-${action.icon}`,
            glyphMargin: {
                position: action.direction === 'parents' ? editor.GlyphMarginLane.Left : editor.GlyphMarginLane.Right,
            },
            glyphMarginHoverMessage: { value: `${action.title} (${action.targets.length})` },
        },
    })) : []);

    function choose(action: GutterAction, position?: PopupPosition) {
        if (action.targets.length === 1) {
            navigateToHierarchyTarget(action.targets[0]);
        } else {
            const bounds = codeEditor.getDomNode()?.getBoundingClientRect();
            const declaration = codeEditor.getScrolledVisiblePosition({ lineNumber: action.line, column: 1 });
            const anchor = position ?? {
                x: (bounds?.left ?? 0) + (declaration?.left ?? 0),
                y: (bounds?.top ?? 0) + (declaration?.top ?? 0) + (declaration?.height ?? 0),
            };
            onChoose({ ...action, position: anchor });
        }
    }

    function findAction(line: number | undefined, direction: GutterAction['direction']): GutterAction | undefined {
        const matches = actions.filter(action => action.line === line && action.direction === direction);
        if (matches.length === 0) return undefined;
        return { ...matches[0], targets: matches.flatMap(action => action.targets) };
    }

    const mouse = codeEditor.onMouseDown(event => {
        if (!showIcons || event.target.type !== editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !event.event.leftButton) return;
        const direction = event.target.detail.glyphMarginLane === editor.GlyphMarginLane.Left ? 'parents' : 'children';
        const action = findAction(event.target.position?.lineNumber, direction);
        if (!action) return;
        event.event.preventDefault();
        event.event.stopPropagation();
        choose(action, {
            x: event.event.browserEvent.clientX,
            y: event.event.browserEvent.clientY,
        });
    });
    const parentContext = codeEditor.createContextKey<boolean>('has_hierarchy_parents', false);
    const childContext = codeEditor.createContextKey<boolean>('has_hierarchy_children', false);
    function updateContext() {
        const line = codeEditor.getPosition()?.lineNumber;
        parentContext.set(actions.some(action => action.line === line && action.direction === 'parents'));
        childContext.set(actions.some(action => action.line === line && action.direction === 'children'));
    }
    updateContext();
    const cursor = codeEditor.onDidChangeCursorPosition(updateContext);
    const menuActions = (['parents', 'children'] as const).map(direction => codeEditor.addAction({
        id: `hierarchy_${direction}`,
        label: direction === 'parents' ? 'Go to Super Declaration' : 'Go to Subclass / Overriding Method',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: direction === 'parents' ? 3 : 4,
        precondition: `has_hierarchy_${direction}`,
        keybindings: [KeyMod.Alt | (direction === 'parents' ? KeyCode.UpArrow : KeyCode.DownArrow)],
        run: () => {
            const line = codeEditor.getPosition()?.lineNumber;
            const action = findAction(line, direction);
            if (action) choose(action);
        },
    }));
    return () => {
        decorations.clear();
        mouse.dispose();
        cursor.dispose();
        parentContext.reset();
        childContext.reset();
        for (const action of menuActions) action.dispose();
    };
}
