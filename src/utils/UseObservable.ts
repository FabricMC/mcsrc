import { useState, useEffect } from "react";
import { Observable } from "rxjs";

export function useObservable<T>(observable: Observable<T>) {
  const [state, setState] = useState<T>();

  useEffect(() => {
    const sub = observable.subscribe(setState);
    return () => sub.unsubscribe();
  }, [observable]);

  return state;
}
