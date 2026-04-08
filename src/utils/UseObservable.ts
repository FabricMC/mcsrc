import { useState, useEffect } from 'react';
import { Observable, BehaviorSubject } from 'rxjs';

export function useObservable<T>(observable: Observable<T>) {
    const [state, setState] = useState<T>(() =>
        observable instanceof BehaviorSubject ? observable.getValue() : undefined as T
    );

    useEffect(() => {
        const sub = observable.subscribe(setState);
        return () => sub.unsubscribe();
    }, [observable]);

    return state;
}
