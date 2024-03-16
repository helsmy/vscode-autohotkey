import { Range, Position } from 'vscode-languageserver';
import { TokenType } from '../../tokenizor/tokenTypes';
import { Token } from '../../tokenizor/types';
import { NodeBase } from './nodeBase';

type PropEqual<T, U extends keyof T, V> =   T[U] extends V ? T : never;
type TokenTypeEqual<V> = PropEqual<Token, "type", V>;
type Delimiter = TokenType.dot | TokenType.comma;

export class DelimitedList<T extends NodeBase | Token> extends NodeBase {
    public readonly childern: Array<T | Token>;
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

    public addElement(e: T | Token) {
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
        let lines: string[] = [];
        if (this.length === 0) return lines;
        let oneline = '';
        let prelement = this.childern[0];
        for (const e of this.childern) {
            const leadingSpace = prelement === e ? '' : ' '.repeat(e.start.character-prelement.end.character);
            if (e.start.line !== prelement.start.line) {
                lines.push(oneline);
                oneline = '';
            }
            if (e instanceof Token) {
                oneline += `${leadingSpace}${e.content}`;
                continue;
            }
            const el = e.toLines();
            el[0] = `${leadingSpace}${el[0]}`;
            lines.push(...el);
        } 
        return lines;
    }

    // FIXME: 0 childern node fails
    public get start(): Position {
        return this.childern[0].start;
    }

    public get end(): Position {
        return this.childern[this.childern.length - 1].end;
    }

    /**
     * Gets the length of the DelimitedList. This is a number one higher than the highest index in the DelimitedList.
     */
    public get length(): number {
        return this.childern.length;
    }
}
