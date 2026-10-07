import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button, Empty, Input, Popover, type InputRef } from 'antd';
import type { editor } from 'monaco-editor';
import type { HierarchyTarget } from '../../logic/HierarchyNavigation';
import { dottedClassNameFromClassName } from '../../utils/Names';
import { parseDescriptor } from '../CodeHoverProvider';
import { navigateToHierarchyTarget, type HierarchyChooser } from './HierarchyGutterController';

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
    codeEditor: editor.IStandaloneCodeEditor | null;
    onClose: () => void;
}

export function HierarchyTargetPopup({ chooser, codeEditor, onClose }: HierarchyTargetPopupProps) {
    const [query, setQuery] = useState('');
    const searchRef = useRef<InputRef>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery('');
        const frame = requestAnimationFrame(() => {
            if (!popupRef.current?.contains(document.activeElement)) searchRef.current?.focus();
        });
        function dismissOutside(event: PointerEvent) {
            if (event.target instanceof Node && !popupRef.current?.contains(event.target)) {
                onClose();
            }
        }
        function dismiss() {
            onClose();
        }
        document.addEventListener('pointerdown', dismissOutside, true);
        window.addEventListener('resize', dismiss);
        const scroll = codeEditor?.onDidScrollChange(event => {
            if (event.scrollTopChanged || event.scrollLeftChanged) dismiss();
        });
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('pointerdown', dismissOutside, true);
            window.removeEventListener('resize', dismiss);
            scroll?.dispose();
        };
    }, [chooser, codeEditor, onClose]);

    const normalizedQuery = query.toLowerCase();
    const targets = chooser.targets.filter(target => {
        const className = dottedClassNameFromClassName(target.className).replaceAll('$', '.');
        return className.toLowerCase().includes(normalizedQuery);
    });

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
        trigger={[]}
        content={<div
            ref={popupRef}
            role="dialog"
            aria-label={chooser.title}
            className="hierarchy-chooser"
            onKeyDown={handlePopupKeyDown}
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
                {targets.map(target => <Button
                    type="text"
                    size="small"
                    data-hierarchy-target
                    title={dottedClassNameFromClassName(target.className).replaceAll('$', '.')}
                    key={`${target.className}:${target.name}:${target.descriptor}`}
                    onClick={() => selectTarget(target)}
                >{targetLabel(target)}</Button>)}
            </div>
        </div>}
    >
        <span style={{ position: 'fixed', left: chooser.position.x, top: chooser.position.y, width: 1, height: 1, pointerEvents: 'none' }} />
    </Popover>, document.body);
}
