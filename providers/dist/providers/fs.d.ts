export declare const readTextFileIfExists: (path: string) => Promise<string>;
export declare const readJson: <T>(path: string, fallback: T) => Promise<T>;
