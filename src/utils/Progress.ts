export interface ProgressInfo {
    percent: number;
    retryCount: number; // If the current progress failed, retryCount++
}