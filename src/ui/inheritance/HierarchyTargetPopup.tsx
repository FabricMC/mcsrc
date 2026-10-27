import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Empty, Input, Popover, type InputRef } from 'antd';
import type { editor } from 'monaco-editor';
import type { HierarchyNavigation, HierarchyTarget } from '../../logic/HierarchyNavigation';
import { performSearch } from '../../logic/Search';
import { dottedClassNameFromClassName } from '../../utils/Names';
import { parseDescriptor } from '../CodeHoverProvider';
import { navigateToHierarchyTarget, type HierarchyChooser } from './HierarchyGutterController';
import { ClassDataIcon, ClassIcon, InterfaceIcon, MethodAbstractIcon, MethodIcon } from '../intellij-icons';

function HierarchyTargetIcon({ target, navigation }: { target: HierarchyTarget; navigation: HierarchyNavigation }) {
    if (target.type === 'class') {
        const data = navigation.getClassData(target.className);
        return data ? <ClassDataIcon data={data} /> : <ClassIcon />;
    }
    const abstractMethod = navigation.isAbstractDeclaration(target);
    const interfaceMethod = navigation.isInterfaceClass(target.className);
    const label = `${abstractMethod ? 'Abstract' : 'Concrete'} ${interfaceMethod ? 'interface method' : 'method'}`;
    return <span className="hierarchy-method-icon" title={label}>
        {interfaceMethod && <InterfaceIcon />}
        {abstractMethod ? <MethodAbstractIcon /> : <MethodIcon />}
    </span>;
}

function targetLabel(target: HierarchyTarget): string {
    if (target.type === 'class') {
        return dottedClassNameFromClassName(target.className).replaceAll('$', '.');
    }
    const className = target.className.slice(target.className.lastIndexOf('/') + 1).replaceAll('$', '.');
    const signature = parseDescriptor(target.descriptor!);
    const parameterTypes = signature.slice(0, signature.indexOf(')') + 1);
    const parameters = parameterTypes.replace(/(?:[\w$]+\.)+([\w$]+)/g, '$1').replaceAll('$', '.');
    return `${className}.${target.name}${parameters}`;
}

interface HierarchyTargetPopupProps {
    chooser: HierarchyChooser;
    navigation: HierarchyNavigation;
    codeEditor: editor.IStandaloneCodeEditor | null;
    onClose: () => void;
}

export function HierarchyTargetPopup({ chooser, navigation, codeEditor, onClose }: HierarchyTargetPopupProps) {
    const [query, setQuery] = useState('');
    const searchRef = useRef<InputRef>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery('');
        const frame = requestAnimationFrame(() => {
            if (window.matchMedia('(pointer: fine)').matches && !popupRef.current?.contains(document.activeElement)) {
                searchRef.current?.focus();
            }
        });
        function dismissOutside(event: PointerEvent) {
            if (event.target instanceof Node && !popupRef.current?.contains(event.target)) {
                onClose();
            }
        }
        function dismiss() {
            onClose();
        }
        function handleResize() {
            if (window.matchMedia('(pointer: fine)').matches) dismiss();
        }
        document.addEventListener('pointerdown', dismissOutside, true);
        window.addEventListener('resize', handleResize);
        const scroll = codeEditor?.onDidScrollChange(event => {
            if (event.scrollTopChanged || event.scrollLeftChanged) dismiss();
        });
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('pointerdown', dismissOutside, true);
            window.removeEventListener('resize', handleResize);
            scroll?.dispose();
        };
    }, [chooser, codeEditor, onClose]);

    const targets = query.trim() ? performSearch(query, chooser.targets, target => target.className) : chooser.targets;
    const parentTargets = new Set(chooser.parentTargets);
    const classHierarchy = chooser.targets[0]?.type === 'class';
    const targetGroups = chooser.direction === 'both' ? [
        { title: classHierarchy ? 'Supertypes' : 'Super methods', icon: 'overridingMethod', targets: targets.filter(target => parentTargets.has(target)) },
        { title: classHierarchy ? 'Subclasses / implementations' : 'Overriding / implementing methods', icon: 'overridenMethod', targets: targets.filter(target => !parentTargets.has(target)) },
    ] : [{ title: '', icon: '', targets }];

    function selectTarget(target: HierarchyTarget) {
        onClose();
        navigateToHierarchyTarget(target);
    }

    function dismissPopup() {
        onClose();
        codeEditor?.focus();
    }

    function handlePopupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            dismissPopup();
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const buttons = Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>('[data-hierarchy-target]') ?? []);
        if (buttons.length === 0) return;
        const currentIndex = buttons.findIndex(button => button === document.activeElement);
        let nextIndex: number;
        if (currentIndex < 0) {
            nextIndex = event.key === 'ArrowDown' ? 0 : buttons.length - 1;
        } else {
            const step = event.key === 'ArrowDown' ? 1 : -1;
            nextIndex = (currentIndex + step + buttons.length) % buttons.length;
        }
        buttons[nextIndex].focus();
    }

    return createPortal(<Popover
        open
        arrow={false}
        placement="bottomLeft"
        autoAdjustOverflow
        align={{ overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true } }}
        trigger={[]}
        content={<div
            ref={popupRef}
            role="dialog"
            aria-label={chooser.title}
            className="hierarchy-chooser"
            onKeyDown={handlePopupKeyDown}
            onTouchStart={event => event.stopPropagation()}
            onTouchMove={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}
        >
            <div className="hierarchy-chooser-title">{chooser.title}</div>
            <Input
                ref={searchRef}
                size="small"
                aria-label="Filter hierarchy targets"
                placeholder="Filter by class"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onPressEnter={() => {
                    if (targets.length === 1) {
                        selectTarget(targets[0]);
                    }
                }}
            />
            <div className="hierarchy-targets">
                {targets.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matching declarations" />}
                {targetGroups.filter(group => group.targets.length > 0).map(group => <div
                    className="hierarchy-target-group"
                    key={group.title}
                >
                    {group.title && <div className="hierarchy-target-group-title">
                        <span aria-hidden="true" className={`hierarchy-heading-icon hierarchy-icon-${group.icon}`} />
                        {group.title}
                    </div>}
                    {group.targets.map(target => <Button
                        type="text"
                        size="small"
                        data-hierarchy-target
                        title={dottedClassNameFromClassName(target.className).replaceAll('$', '.')}
                        key={`${target.className}:${target.name}:${target.descriptor}`}
                        onClick={() => selectTarget(target)}
                    >
                        <span aria-hidden="true"><HierarchyTargetIcon target={target} navigation={navigation} /></span>
                        <span>{targetLabel(target)}</span>
                    </Button>)}
                </div>)}
            </div>
        </div>}
    >
        <span style={{ position: 'fixed', left: chooser.position.x, top: chooser.position.y, width: 1, height: 1, pointerEvents: 'none' }} />
    </Popover>, document.body);
}
