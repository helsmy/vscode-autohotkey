import { Position, Range } from 'vscode-languageserver';
import { TokenType } from '../../tokenizor/tokenTypes';
import {
    Atom,
    IExpr,
    ISuffixTerm,
    SuffixTermTrailer,
    SyntaxKind
} from '../../types';
import { DelimitedList } from './delimtiedList';
import { Expr } from './expr';
import { NodeBase } from './nodeBase';
import { Token } from '../../tokenizor/types';

/**
 * Base class for all suffix terms
 */
export abstract class SuffixTermBase extends NodeBase implements ISuffixTerm {
    /**
     * Tag used to denote syntax node of the instance
     */
    get tag(): SyntaxKind.suffixTerm {
        return SyntaxKind.suffixTerm;
    }
}

/**
 * Container for tokens constituting an invalid suffix term
 */
export class Invalid extends SuffixTermBase {
    /**
     * Invalid suffix term constructor
     * @param token token in the invalid range
     */
    constructor(public readonly token: Token) {
        super();
    }

    public get start(): Position {
        return this.token.start;
    }

    public get end(): Position {
        return this.token.end;
    }

    public get ranges(): Range[] {
        return [];
    }

    public toLines(): string[] {
        return [''];
    }
}

/**
 * Class holding all suffix trailers
 */
export class SuffixTrailer extends SuffixTermBase {
    /**
     * Constructor for the suffix trailer
     * @param suffixTerm base suffix term
     * @param dot colon separating the base from the trailer
     * @param trailer the suffix trailer
     */
    constructor(
        public readonly dot: Token,
        public readonly suffixTerm: DelimitedList<SuffixTerm>,
    ) {
        super();
    }

    public get start(): Position {
        return this.dot.start;
    }

    public get end(): Position {
        return this.suffixTerm.length === 0 ? this.dot.end : this.suffixTerm.end;
    }

    public get ranges(): Range[] {
        return [this.dot, ...this.suffixTerm.ranges]
    }

    public toLines(): string[] {
        const suffixTermLines = this.suffixTerm.toLines();
        return [this.dot.content, ...suffixTermLines];
    }
}

/**
 * Class holding all valid suffix terms
 */
export class SuffixTerm extends SuffixTermBase {
    /**
     * Constructor for suffix terms
     * @param atom base item of the suffix term
     * @param brackets brackets present in the suffixterm. Call|[index]
     */
    constructor(
        public readonly atom: Atom,
        public readonly brackets: SuffixTermTrailer[],
    ) {
        super();
    }
    public get ranges(): Range[] {
        return [this.atom as Range, ...(this.brackets as Range[])];
    }

    public get start(): Position {
        return this.atom.start;
    }

    public get end(): Position {
        if (this.brackets.length > 0) {
            return this.brackets[this.brackets.length - 1].end;
        }

        return this.atom.end;
    }
    
    public toLines(): string[] {
        const atomLines = this.atom.toLines();
        const trailersLines = this.brackets.map(t => t.toLines());
        const flatLines = trailersLines.flat();
        if (flatLines.length === 0)
            return atomLines;

        return atomLines.concat(flatLines);
    }
}

/**
 * Class containing all valid call suffixterm trailers
 */
export class Call extends SuffixTermBase {
    /**
     * Constructor for the suffix term trailers
     * @param open open paren of the call
     * @param args arguments for the call
     * @param close close paren of the call
     */
    constructor(
        public readonly open: Token,
        public readonly args: DelimitedList<Expr>,
        public readonly close: Token,
    ) {
        super();
    }

    public get start(): Position {
        return this.open.start;
    }

    public get end(): Position {
        return this.close.end;
    }

    public get ranges(): Range[] {
        return [this.open, ...this.args.ranges, this.close];
    }

    public toLines(): string[] {
        return [this.open.content, ...this.args.toLines(), this.close.content];
    }
}

/**
 * Class containing all valid array bracket suffix term trailers
 */
export class BracketIndex extends SuffixTermBase {
    /**
     * Constructor for the array bracket suffix term trailer
     * @param open open bracket
     * @param indexs index into the collection
     * @param close close bracket
     */
    constructor(
        public readonly open: Token,
        public readonly indexs: DelimitedList<Expr>,
        public readonly close: Token,
    ) {
        super();
    }

    public get start(): Position {
        return this.open.start;
    }

    public get end(): Position {
        return this.close.end;
    }

    public get ranges(): Range[] {
        return [this.open, ...this.indexs.ranges, this.close];
    }

    public toLines(): string[] {
        const lines = this.indexs.toLines();

        lines[0] = `${this.open.content}${lines[0]}`;
        lines[lines.length - 1] = `${lines[lines.length - 1]}${this.close.content}`;
        return lines;
    }
}

/**
 * Class containing percent dereference suffix terms
 */
export class PercentDereference extends SuffixTermBase {
    /**
     * Constructor of percent dereference
     * @param open Start precent
     * @param close End precent
     * @param referValue The value to be derefer
     */
    constructor(
        public readonly open: Token,
        public readonly close: Token,
        public readonly referValue: Token
        ) {
        super();
    }

    public get start(): Position {
        return this.open.start;
    }

    public get end(): Position {
        return this.open.end;
    }

    public get ranges(): Range[] {
        return [this.open, this.referValue, this.close];
    }

    public toLines(): string[] {
        let v = this.referValue.type === TokenType.string ?
                '"' + this.referValue.content + '"' :
                this.referValue.content;
        return [this.open.content+v+this.close.content];
    }
}

/**
 * Class containing literal suffix terms
 */
export class Literal extends SuffixTermBase {
    /**
     * Constructor for literal suffix term
     * @param token token for the literal
     */
    constructor(public readonly token: Token) {
        super();
    }

    public get start(): Position {
        return this.token.start;
    }

    public get end(): Position {
        return this.token.end;
    }

    public get ranges(): Range[] {
        return [this.token];
    }

    public toLines(): string[] {
        return [`${this.token.content}`];
    }
}


/**
 * Class containing Array suffix terms
 */
export class ArrayTerm extends SuffixTermBase {
    /**
     * Constructor of Array
     * @param open Start [
     * @param close End ]
     * @param items items of arrays
     */
    constructor(
        public readonly open: Token,
        public readonly close: Token,
        public readonly items: DelimitedList<Expr>
        ) {
        super();
    }

    public get start(): Position {
        return this.open.start;
    }

    public get end(): Position {
        return this.close.end;
    }

    public get ranges(): Range[] {
        return [this.open, ...this.items.ranges, this.close]
    }

    public toLines(): string[] {
        const itemLines = this.items.toLines();
        itemLines[0] = this.open.content + itemLines[0];
        itemLines[itemLines.length-1] += this.close.content;
        return itemLines;
    }
}

/**
 * Class containing Associative Array suffix terms
 */
 export class AssociativeArray extends SuffixTermBase {
    /**
     * Constructor of Associative Array
     * @param open Start {
     * @param close End }
     * @param pairs key-value pairs of object
     */
    constructor(
        public readonly open: Token,
        public readonly close: Token,
        public readonly pairs: DelimitedList<Pair>
        ) {
        super();
    }

    public get start(): Position {
        return this.open.start;
    }

    public get end(): Position {
        return this.close.end;
    }

    public get ranges(): Range[] {
        return [this.open, ...this.pairs.ranges, this.close];
    }

    public toLines(): string[] {
        const pairLines = this.pairs.toLines();
        pairLines[0] = this.open.content + pairLines[0];
        pairLines[pairLines.length-1] += this.close.content;
        return pairLines;
    }
}

/**
 * Class containing all valid identifiers
 */
export class Identifier extends SuffixTermBase {
    /**
     * Constructor for suffix term identifiers
     * @param token identifier token
     */
    constructor(public readonly token: Token) {
        super();
    }

    public get start(): Position {
        return this.token.start;
    }

    public get end(): Position {
        return this.token.end;
    }

    public get ranges(): Range[] {
        return [this.token];
    }

    public get isKeyword(): boolean {
        return !(this.token.type === TokenType.id );
    }

    public toLines(): string[] {
        return [`${this.token.content}`];
    }
}

/**
 * Class containing all valid groupings
 */
export class Grouping extends SuffixTermBase {
    /**
     * Grouping constructor
     * @param open open paren token
     * @param expr expression within the grouping
     * @param close close paren token
     */
    constructor(
        public readonly open: Token,
        public readonly expr: IExpr,
        public readonly close: Token,
    ) {
        super();
    }

    public get start(): Position {
        return this.open.start;
    }

    public get end(): Position {
        return this.close.end;
    }

    public get ranges(): Range[] {
        return [this.open, this.expr, this.close];
    }

    public toString(): string {
        return `${this.open.content}${this.expr.toString()}${this.close.content}`;
    }

    public toLines(): string[] {
        const lines = this.expr.toLines();

        lines[0] = `${this.open.content}${lines[0]}`;
        lines[lines.length - 1] = `${lines[lines.length - 1]}${this.close.content}`;
        return lines;
    }
}

/**
 * Class containing all valid key-value pair
 */
 export class Pair extends SuffixTermBase {
    /**
     * Pair constructor
     * @param key key of pair
     * @param colon middle :
     * @param value value of pair
     */
    constructor(
        public readonly key: Expr,
        public readonly colon: Token,
        public readonly value: Expr,
    ) {
        super();
    }

    public get start(): Position {
        return this.key.start;
    }

    public get end(): Position {
        return this.value.end;
    }

    public get ranges(): Range[] {
        return [this.key, this.colon, this.value];
    }

    public toLines(): string[] {
        const keyLines = this.key.toLines();
        const valueLines = this.value.toLines();
        keyLines[keyLines.length-1] += this.colon.content + valueLines[0];

        return keyLines.concat(valueLines.slice(1));
    }
}

