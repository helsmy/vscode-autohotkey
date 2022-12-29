import { Range, Position } from 'vscode-languageserver';
import { TokenType } from '../../tokenizor/tokenTypes';
import { Token } from '../../types';
import { NodeBase } from './nodeBase';

export type ListChild = NodeBase | Token;
type PropEqual<T, U extends keyof T, V> =  V extends T[U] ? T : never;
type TokenTypeEqual<V> = PropEqual<Token, "type", V>;
type Delimiter = TokenTypeEqual<TokenType.dot> | TokenTypeEqual<TokenType.comma>;

export class DelimitedList<T extends NodeBase | Token> extends NodeBase {
    public readonly childern: Array<T | Delimiter>;
    private readonly delimiter = [TokenType.dot, TokenType.comma];

    constructor() {
        super();
        this.childern = [];
    }

    public getElements(): T[] {
        let result: T[] = [];
        for (const e of this.childern) {
            if (e instanceof NodeBase)
                result.push(e);
            else if (!this.delimiter.includes(e.type))
                result.push(e as T);
        }
        return result;
    }

    public addElement(e: T | Delimiter) {
        this.childern.push(e);
    }
    
    public get ranges(): Range[] {
        let r: Range[] = [];
        for (const e of this.childern) {
            if (e instanceof NodeBase) {
                r.push(...e.ranges);
            }
            else
                r.push(Range.create(e.start, e.end));
        }
        return r;
    }

    // TODO: implement
    public toLines(): string[] {
        throw new Error('Method not implemented.');
    }

    public get start(): Position {
        return this.childern[0].start;
    }

    public get end(): Position {
        return this.childern[this.childern.length].end;
    }
}
