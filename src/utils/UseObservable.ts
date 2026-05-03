import { useState, useEffect } from 'react';
import { Observable, BehaviorSubject } from 'rxjs';

export function useObservable<T>(observable: Observable<T>) {
    const [state, setState] = useState<T | undefined>(() =>
        observable instanceof BehaviorSubject ? observable.getValue() : undefined
    );

    useEffect(() => {
        const sub = observable.subscribe(setState);
        return () => sub.unsubscribe();
    }, [observable]);

    return state;
}
