import { type } from 'os';
import { Position, Range } from 'vscode-languageserver';
import { TokenType } from '../../tokenizor/tokenTypes';
import {
    IExpr,
    SyntaxKind,
} from '../../types';
import { DelimitedList } from './delimtiedList';
import { NodeBase } from './nodeBase';
import * as SuffixTerm from './suffixterm';
import { Token } from '../../tokenizor/types';
import { Param } from './declaration';
import { AHKMethodSymbol } from '../../analyzer/models/symbol';

export type ExpersionList = DelimitedList<Expr>;

/**
 * Expression base class
 */
export abstract class Expr extends NodeBase implements IExpr {
    /**
     * Return the tree node type of expression
     */
    get tag(): SyntaxKind.expr {
        return SyntaxKind.expr;
    }
}

/**
 * Container for tokens constituting an invalid expression
 */
export class Invalid extends Expr {
    /**
     * Invalid expression constructor
     * @param pos start position of the invalid expression
     * @param tokens all tokens in the invalid range
     */
    constructor(
        public readonly pos: Position,
        public readonly tokens: Token[]
    ) {
        super();
    }

    public get start(): Position {
        return this.tokens.length > 0 ? this.tokens[0].start : this.pos;
    }

    public get end(): Position {
        return this.tokens.length > 0
            ? this.tokens[this.tokens.length - 1].end
            : this.pos;
    }

    public toLines(): string[] {
        return [this.tokens.map(t => t.content).join(' ')];
    }

    /**
     * Ranges of this statement
     */
    public get ranges(): Range[] {
        let ranges: Range[] = [];
        for (const token of this.tokens) {
            ranges.push(Range.create(token.start, token.end));
        }
        return ranges;
    }
}

/**
 * Class holding all valid unary expressions in AHK
 */
export class Unary extends Expr {
    /**
     * Unary expression constructor
     * @param operator unary operator
     * @param factor factor
     */
    constructor(public readonly operator: Token, public readonly factor: Expr) {
        super();
    }

    public get start(): Position {
        // maybe var++ or ++var
        return isBiggerPosition(this.operator.start, this.factor.start) ? 
                this.factor.start: this.operator.start;
    }

    public get end(): Position {
        return isBiggerPosition(this.operator.end, this.factor.end) ?
                this.operator.end : this.factor.end;
    }

    public get ranges(): Range[] {
        return [this.operator, this.factor];
    }

    public toLines(): string[] {
        const lines = this.factor.toLines();

        switch (this.operator.type) {
            case TokenType.plus:
            case TokenType.minus:
                lines[0] = `${this.operator.content}${lines[0]}`;
                return lines;
            default:
                lines[0] = `${this.operator.content} ${lines[0]}`;
                return lines;
        }
    }
}

/**
 * Class repersenting all valid binary expressions in AHK
 */
export class Binary extends Expr {
    /**
     * Constructor for all binary expressions
     * @param left left expression of the operator
     * @param operator The operator
     * @param right right expression of the operator
     */
    constructor(
        public readonly left: Expr,
        public readonly operator: Token,
        public readonly right: Expr) {
        super();
    }

    public get start(): Position {
        return this.left.start;
    }

    public get end(): Position {
        return this.right.end;
    }

    public get ranges(): Range[] {
        return [this.left, this.operator, this.right];
    }

    public toLines(): string[] {
        const leftLines = this.left.toLines();
        const rightLines = this.right.toLines();

        return rightLines.length === 0 ? 
            [`${leftLines[0]} ${this.operator.content}`] :
            [`${leftLines[0]} ${this.operator.content} ${rightLines[0]}`];
    }
}

/**
 * Class repersenting all valid ternary expressions in AHK
 */
 export class Ternary extends Expr {
    /**
     * Constructor for all ternary expressions
     * @param condition condition expression
     * @param question '?' token
     * @param trueExpr true expression
     * @param colon ':' token
     * @param falseExpr false expression
     */
    constructor(
        public readonly condition: Expr,
        public readonly question: Token,
        public readonly trueExpr: Expr,
        public readonly colon: Token,
        public readonly falseExpr: Expr) {
        super();
    }

    public get start(): Position {
        return this.condition.start;
    }

    public get end(): Position {
        return this.falseExpr.end;
    }

    public get ranges(): Range[] {
        const condR = this.condition.ranges;
        const trueR = this.trueExpr.ranges;
        const falseR = this.falseExpr.ranges;
        return condR.concat(this.question)
            .concat(...trueR).concat(this.colon)
            .concat(falseR);
    }

    public toLines(): string[] {
        const condLines = this.condition.toLines();
        const trueLines = this.trueExpr.toLines();
        const falseLines = this.falseExpr.toLines();
        
        condLines[condLines.length-1] += ' ' + this.question.content;
        trueLines[trueLines.length-1] += ' ' + this.colon.content;
        return condLines.concat(trueLines).concat(falseLines);
    }
}

/**
 * Class repersenting all expressions contained in pair of paren
 * `( Expression )`
 */
export class ParenExpr extends Expr {
    
    constructor(
        public readonly openParen: Token,
        public readonly expr: Expr,
        public readonly closeParen: Token
    ) {
        super();
    }

    public get ranges(): Range[] {
        return [this.openParen, ...this.expr.ranges, this.closeParen];
    }

    public toLines(): string[] {
        return [`(${this.expr.toLines().join(`\n`)})`]
    }

    public get start(): Position {
        return this.openParen.start;
    }

    public get end(): Position {
        return this.closeParen.end;
    }
}

/**
 * Class for all factor to be calcuated
 */
export class Factor extends Expr {
    /**
     * Factor constructor
     * @param suffixTerm base suffix term
     * @param trailer optional suffix trailer. (`.` atom)+
     */
    constructor(
        public readonly suffixTerm: SuffixTerm.SuffixTerm,
        public readonly trailer?: SuffixTerm.SuffixTrailer,
    ) {
        super();
    }

    public get start(): Position {
        return this.suffixTerm.start;
    }

    public get end(): Position {
        return this.trailer === undefined ? this.suffixTerm.end : this.trailer.end;
    }

    public get ranges(): Range[] {
        if (!(this.trailer === undefined)) {
            return [this.suffixTerm, this.trailer];
        }

        return [this.suffixTerm];
    }

    /**
     * How many suffix term this factor has.
     * Including the first term
     */
    public get termCount(): number {
        if (this.trailer)
            return 1 + this.trailer.suffixTerm.length;
        return 1;
    }

    public toLines(): string[] {
        const suffixTermLines = this.suffixTerm.toLines();

        if (!(this.trailer === undefined)) {
            const trailerLines = this.trailer.toLines();
            return [...suffixTermLines,...trailerLines];
        }

        return suffixTermLines;
    }
}

/**
 * Fat arrow function creation
 */
export class AnonymousFunctionCreation extends Expr {
    public symbol: Maybe<AHKMethodSymbol>;
    constructor(
        // TODO: Should this node have a name property or not? 
        // public readonly nameToken: Token
        public readonly open: Maybe<Token>,
        public readonly param: Param,
        public readonly close: Maybe<Token>,
        public readonly fatArrow: Token,
        public readonly body: ExpersionList,
    ) {
        super();
    }
    public get ranges(): Range[] {
        throw new Error('Method not implemented.');
    }
    public toLines(): string[] {
        throw new Error('Method not implemented.');
    }
    public get start(): Position {
        return this.open ? this.open.start : this.param.start;
    }
    public get end(): Position {
        return this.body.end;
    }
}

function isBiggerPosition(p1: Position, p2: Position): boolean {
    if (p1.line > p2.line) return true;
    if (p1.line === p2.line && p1.character > p2.character) return true;
    return false
}