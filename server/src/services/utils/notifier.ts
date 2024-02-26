export class Notifier {
    private waiter: Waiter
    constructor() {
        this.waiter = new Waiter((undefined) => undefined);
    }

    /**
     * A Promise wait until it is notified
     * @param timeout timeout in ms
     */
    public wait(timeout: number) {
        const promise = new Promise((resolve) => {
            if (!this.waiter.resolved) 
                this.waiter.resolve = resolve;
            else
                resolve(true);
        });

        if (timeout < 0 && !isFinite(timeout)) return promise;
        if (!this.waiter.resolved)
            setTimeout(() => {
                if (!this.waiter.resolved) {
                    this.waiter.resolve(true);
                    this.waiter.resolved = true;
                }
            }, timeout);

        return promise;
    }

    public reset() {
        this.waiter.resolved = false;
    }

    public notify() {
        if (!this.waiter.resolved) {
            this.waiter.resolve(true);
            this.waiter.resolved = true;
        }
    }
}

class Waiter {
    public resolved = false;
    constructor(
        public resolve: (value: unknown) => void
    ) {}
}