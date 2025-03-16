declare module 'async-queue' {
    export class AsyncQueue {
        constructor();
        push<T>(fn: () => Promise<T>): Promise<T>;
        length(): number;
        clear(): void;
    }
}
