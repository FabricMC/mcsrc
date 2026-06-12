import { BehaviorSubject } from "rxjs";

export type DiffDirection = -1 | 1;

export interface DiffNavigator {
    jumpWithinFile(direction: DiffDirection): boolean;
    jumpToFileEdge(direction: DiffDirection): boolean;
}

let activeNavigator: DiffNavigator | null = null;

export const pendingDiffJump = new BehaviorSubject<DiffDirection | null>(null);

export function registerDiffNavigator(navigator: DiffNavigator) {
    activeNavigator = navigator;

    return () => {
        if (activeNavigator === navigator) {
            activeNavigator = null;
        }
    };
}

export function jumpWithinCurrentFile(direction: DiffDirection): boolean {
    return activeNavigator?.jumpWithinFile(direction) ?? false;
}

export function jumpToCurrentFileEdge(direction: DiffDirection): boolean {
    return activeNavigator?.jumpToFileEdge(direction) ?? false;
}
