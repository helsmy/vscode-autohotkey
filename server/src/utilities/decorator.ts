/**
 * Log exception stack trace to remote console, then throw error and crash.
 */
export function logException<This, A extends any[], R>(
    target: (this: This, ...args: A)=> Promise<R>, 
    context: ClassMethodDecoratorContext<This, (this: This, ...args: A)=> Promise<R>>
) {
    return async function (this: This, ...args: A)  {
        try {
            return await target.apply(this, args);
        }
        catch (error) {
            const e = error as any;
            (this as any).logger.error(e instanceof Error ? e.stack : JSON.stringify(e));
            throw e;
        }
    }
}

export function debounce(ms: number) {
    return (target: any, context: ClassMethodDecoratorContext) => {
        let timer: Maybe<NodeJS.Timeout>;
        let lastArgs: any[] = [];
        let lastThis: any;
        return async function (this: any, ...args: any[]) {
            if (lastArgs === args && lastThis === this){
                clearTimeout(timer);
                timer = setTimeout(() => {
                    target.apply(this, args);
                }, ms);
            }
            target.apply(this, args);
        }
    }
}  