import { BehaviorSubject, Observable } from "rxjs";

export class BooleanSetting {
    private key: string;
    private subject: BehaviorSubject<boolean>;

    constructor(key: string, defaultValue: boolean) {
        const stored = localStorage.getItem(`setting_${key}`);
        const initialValue = stored !== null ? stored === 'true' : defaultValue;

        this.key = key;
        this.subject = new BehaviorSubject<boolean>(initialValue);
    }

    get observable(): Observable<boolean> {
        return this.subject;
    }

    get value(): boolean {
        return this.subject.value;
    }

    set value(newValue: boolean) {
        this.subject.next(newValue);
        localStorage.setItem(`setting_${this.key}`, newValue.toString());
    }
}

export const agreedEula = new BooleanSetting('eula', false);
export const enableTabs = new BooleanSetting('enable_tabs', true);
export const enableLambdaDisplay = new BooleanSetting('enable_lambda_display', true);