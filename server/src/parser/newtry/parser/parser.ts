import { Tokenizer } from "../tokenizor/tokenizer";
import { Atom, IAST, IExpr, IStmt, SuffixTermTrailer, Token } from "../types";
import { isValidIdentifier, TokenType } from "../tokenizor/tokenTypes";
import {
    INodeResult,
    IParseError,
} from "../types";
import { constructorToFailed, FailedConstructor, ParseError } from './models/parseError';
import * as Stmt from './models/stmt';
import * as Expr from './models/expr';
import * as SuffixTerm from './models/suffixterm';
import { Precedences, UnaryPrecedence } from './models/precedences';
import { nodeResult } from './utils/parseResult';
import * as Decl from './models/declaration';
import { IDiagnosticInfo, TokenKind } from '../tokenizor/types';
import { mockLogger } from '../../../utilities/logger';
import { Script } from '../models/script';
import { Position } from 'vscode-languageserver-types';

type NodeConstructor =
    | Constructor<Expr.Expr>
    | Constructor<Stmt.Stmt>
    | Constructor;

export class AHKParser {
    private tokenizer: Tokenizer;
    private currentToken: Token;
    private pos: number = 0;

    /**
     * list for storaging all tokens
     */
    private readonly uri: string;
    private tokens: Token[] = [];
    private tokenErrors: IDiagnosticInfo[] = [];
    private comments: Token[] = [];
    private includes: Set<string> = new Set();

    private readonly logger: ILoggerBase;

    constructor(document: string, uri: string, logger: ILoggerBase = mockLogger) {
        this.tokenizer = new Tokenizer(document);
        this.tokenizer.isParseHotkey = true;
        this.currentToken = this.nextToken(TokenType.EOL);
        this.tokens.push(this.currentToken);
        this.logger = logger;
        this.uri = uri;
    }

    private nextToken(preType: TokenType): Token {
        let token = this.tokenizer.GetNextToken(preType);
        while (token.kind !== TokenKind.Token) {
            if (token.kind === TokenKind.Diagnostic) {
                this.tokenErrors.push(token.result);
                token = this.tokenizer.GetNextToken(TokenType.unknown);
            }
            else if (token.kind === TokenKind.Commnet) {
                this.comments.push(token.result);
                token = this.tokenizer.GetNextToken(token.result.type);
            }
        }
        return token.result;
    }

    private advance() {
        this.pos++;
        if (this.pos >= this.tokens.length) {
            this.currentToken = this.nextToken(this.currentToken.type);
            // AHK connect next line to current line
            // when next line start with operators and ','
            if (this.currentToken.type === TokenType.EOL) {
                const saveToken = this.currentToken;
                this.currentToken = this.nextToken(saveToken.type);
                // 跳过多余的换行
                while (this.currentToken.type === TokenType.EOL) {
                    this.currentToken = this.nextToken(this.currentToken.type);
                }
                // 下一行是运算符或者','时丢弃EOL
                // discard EOL
                if (this.currentToken.type >= TokenType.pplus &&
                    this.currentToken.type <= TokenType.comma) {
                    this.tokens.push(this.currentToken);
                }
                else {
                    this.tokens.push(saveToken);
                    this.tokens.push(this.currentToken);
                    this.currentToken = saveToken;
                }
            }
            else
                this.tokens.push(this.currentToken);
        }
        this.currentToken = this.tokens[this.pos];
        return this
    }

    private previous(): Token {
        return this.tokens[this.pos - 1];
    }

    /**
     * look ahead one token
     */
    private peek(): Token {
        if (this.pos + 1 <= this.tokens.length - 1)
            return this.tokens[this.pos + 1];

        let token = this.nextToken(this.currentToken.type);

        if (token.type === TokenType.EOL) {
            const saveToken = token;
            token = this.nextToken(saveToken.type);

            if (token.type >= TokenType.pplus &&
                token.type <= TokenType.comma) {
                this.tokens.push(token);
                return token;
            }
            this.tokens.push(saveToken);
            this.tokens.push(token);
            return saveToken;
        }
        this.tokens.push(token);
        return token;
    }

    private error(token: Token, message: string, failed: Maybe<NodeConstructor>): ParseError {
        return new ParseError(
            token,
            message,
            constructorToFailed(failed)
        );
    }

    public parse(): IAST {
        const statment: IStmt[] = [];
        const diagnostics: IParseError[] = [];
        const baseName = this.uri.split('/').slice(-1)[0];

        this.logger.info(`Parsing started for ${baseName}`);
        
        try {
            this.jumpWhiteSpace();
            while (this.currentToken.type !== TokenType.EOF) {
                let { errors, value } = this.declaration();
                statment.push(value);
                diagnostics.push(...errors);
                this.jumpWhiteSpace();
            }
            
            this.logger.info(`Parsing finished for ${baseName}`);

            return {
                script: new Script(
                    this.uri,
                    statment,
                    this.tokens,
                    this.comments,
                    this.includes
                ),
                sytanxErrors: diagnostics,
                tokenErrors: this.tokenErrors
            };
        }
        catch (error) {
            this.logger.error(error as any);
        }

        return {
            script: new Script(this.uri, [], [], []),
            sytanxErrors: [],
            tokenErrors: []
        };
    }

    public testDeclaration(): INodeResult<Stmt.Stmt> {
        return this.declaration();
    }

    private declaration(): INodeResult<Stmt.Stmt> {
        const start = this.pos;
        try {
            while (true) {
                switch (this.currentToken.type) {
                    case TokenType.id:
                        return this.idLeadStatement();
                    case TokenType.class:
                        return this.classDefine();
                    case TokenType.global:
                    case TokenType.local:
                    case TokenType.static:
                        return this.varDecl();
                    case TokenType.label:
                        return this.label();
                    case TokenType.key:
                    // 所有热键的修饰符
                    // case TokenType.sharp:
                    // case TokenType.not:
                    // case TokenType.xor:
                    // case TokenType.plus:
                    // case TokenType.less:
                    // case TokenType.greater:
                    // case TokenType.multi:
                    // case TokenType.bnot:
                    // case TokenType.dollar:
                        return this.hotkey();
                    case TokenType.hotstringOpen:
                        return this.hotstring();
                    // Skip empty statment
                    case TokenType.EOL:
                        this.jumpWhiteSpace();
                        continue;
                    default:
                        return this.statement();
                }
            }
        }
        catch (error) {
            if (error instanceof ParseError) {
                this.synchronize(error.failed);
                const tokens = this.tokens.slice(start, this.pos);
                tokens.push(this.currentToken);

                return nodeResult(
                    new Stmt.Invalid(
                        tokens[0].start,
                        tokens
                    ),
                    [error]
                );
            }
            throw error;
        }
    }

    private varDecl(): INodeResult<Decl.VarDecl> {
        const scope = this.currentToken;
        const assign: Decl.OptionalAssginStmt[] = [];
        const errors: ParseError[] = [];
        this.advance();
        if (this.atLineEnd()) {
            this.terminal(Decl.VarDecl);
            return nodeResult(
                new Decl.VarDecl(scope, []),
                errors
            );
        }
        // check if there are varible,
        // if any parse them all
        do {
            // TODO: Deal with errors 
            // when second declaration contains no identifer
            if (this.currentToken.type === TokenType.id) {
                let id = this.currentToken;
                this.advance();
                const saveToken = this.currentToken;

                // check if there is an assignment
                if (saveToken.type === TokenType.aassign ||
                    saveToken.type === TokenType.equal) {
                    this.advance();
                    const expr = this.expression();
                    errors.push(...expr.errors);
                    assign.push(new Decl.OptionalAssginStmt(
                        id, saveToken, expr.value
                    ))
                }
                else
                    assign.push(new Decl.OptionalAssginStmt(id));

            }
            else {
                // TODO: allow scoop declaration
                // Generate error when no varible is found
                errors.push(this.error(
                    this.currentToken,
                    'Expect an identifer in varible declaration',
                    Decl.VarDecl
                ));
                // Generate Invalid Mark
                assign.push(new Decl.OptionalAssginStmt(
                    this.currentToken,
                    undefined,
                    new Expr.Invalid(
                        this.currentToken.start,
                        [this.currentToken]
                    ))
                );
            }
        } while (this.eatDiscardCR(TokenType.comma));

        this.terminal(Decl.VarDecl);

        return nodeResult(
            new Decl.VarDecl(scope, assign),
            errors
        );
    }

    private classDefine(): INodeResult<Decl.ClassDef> {
        const classToken = this.eat();
        const name = this.eatAndThrow(
            TokenType.id,
            'Expect an identifier in class define',
            Decl.ClassDef
        );
        if (this.currentToken.type === TokenType.extends) {
            const extendsToken = this.eat();
            const parentName = this.eatAndThrow(
                TokenType.id,
                'Expect an identifier after "extends" keyword',
                Decl.ClassDef
            );
            const body = this.block();
            return nodeResult(
                new Decl.ClassDef(
                    classToken, name,
                    body.value, extendsToken,
                    parentName
                ),
                body.errors
            );
        }
        const body = this.block();
        return nodeResult(
            new Decl.ClassDef(classToken, name, body.value),
            body.errors
        );
    }

    // TODO:  class block statement
    // private classBlock(): INodeResult<Stmt.Block> {
    //     switch (this.currentToken.type) {
    //         case TokenType.id:
    //             switch (this.peek().type) {
    //                 case TokenType.openBracket:

    //             }
    //     }
    // }

    private label(): INodeResult<Decl.Label> {
        const name = this.currentToken;
        this.advance();
        return nodeResult(new Decl.Label(name), []);
    }

    // v1 version
    private hotkey(): INodeResult<Decl.Hotkey> {
        const k1 = new Decl.Key(this.currentToken);
        this.advance();
        if (this.currentToken.type === TokenType.hotkeyand) {
            const and = this.currentToken;
            this.advance();
            const k2 = new Decl.Key(this.currentToken);
            this.advance();
            return nodeResult(new Decl.Hotkey(k1, and, k2), 
                              []);
        }
        this.eatAndThrow(
            TokenType.hotkey,
            'Expect a "::" at the end of hotkey declaration',
            Decl.Hotkey
        );
        return nodeResult(new Decl.Hotkey(k1), []);
    }

    private hotstring(): INodeResult<Decl.HotString> {
        const option = this.eat();
        const str = this.eatAndThrow(
            TokenType.hotstringEnd,
            'Expect a hotstring in hotstring',
            Decl.HotString
        );
        // TODO: FINISH X OPTION
        if (this.atLineEnd()) {
            const expend = this.eat();
            return nodeResult(new Decl.HotString(option, str, expend), []);
        }
        const expend = this.eatAndThrow(
            TokenType.string,
            'Expect a expend string in hotstring',
            Decl.HotString
        );
        return nodeResult(new Decl.HotString(option, str, expend), []);
    } 

    private statement(): INodeResult<Stmt.Stmt> {
        switch (this.currentToken.type) {
            case TokenType.id:
                return this.idLeadStatement();
            case TokenType.openBrace:
                return this.block();
            // case TokenType.command:
            //     return this.command();
            case TokenType.if:
                return this.ifStmt();
            case TokenType.break:
                return this.breakStmt();
            case TokenType.continue:
                return this.continueStmt();
            case TokenType.return:
                return this.returnStmt();
            case TokenType.switch:
                return this.switchStmt();
            case TokenType.loop:
                return this.loopStmt();
            case TokenType.while:
                return this.whileStmt();
            case TokenType.for:
                return this.forStmt();
            case TokenType.try:
                return this.tryStmt();
            case TokenType.throw:
                return this.throwStmt();
            case TokenType.drective:
                return this.drective();
            case TokenType.command:
                return this.command();
            default:
                throw this.error(
                    this.currentToken,
                    'UnKnown statment found',
                    undefined);
        }
    }

    private idLeadStatement(): INodeResult<Stmt.Stmt> {
        const p = this.peek()
        switch (p.type) {
            case TokenType.openParen:
                return this.func();
            case TokenType.equal:
            case TokenType.aassign:
            case TokenType.dot:
            case TokenType.openBracket:
                // expression is only allowed in assignment in AHK
                return this.assign();
            case TokenType.hotkeyand:
            case TokenType.hotkey:
                return this.hotkey();
            // 其他是语法错误，统一当作有错误的赋值语句
            default:
                if (p.type >= TokenType.aassign && p.type <= TokenType.lshifteq)
                    return this.assign();
                throw this.error(p,
                    'Invalid follower(s) of identifer',
                    undefined);
        }
    }

    private block(): INodeResult<Stmt.Block> {
        const open = this.eatDiscardCR(TokenType.openBrace);
        if (!open) {
            throw this.error(
                this.currentToken,
                'Expect a "{" at begining of block',
                Stmt.Block
            );
        }
        const errors: ParseError[] = [];
        const block: Stmt.Stmt[] = [];
        this.jumpWhiteSpace();
        while (this.currentToken.type !== TokenType.closeBrace &&
            this.currentToken.type !== TokenType.EOF) {
            // FIXME: 在192行左右有什么错误
            const stmt = this.declaration();
            errors.push(...stmt.errors);
            block.push(stmt.value);
            this.jumpWhiteSpace();
        }
        const close = this.eatAndThrow(
            TokenType.closeBrace,
            'Expect a "}" at block end',
            Stmt.Block
        );

        return nodeResult(
            new Stmt.Block(open, block, close),
            errors
        );
    }

    private ifStmt(): INodeResult<Stmt.If> {
        const iftoken = this.currentToken;
        this.advance();
        const errors: ParseError[] = [];
        const condition = this.expression();
        errors.push(...condition.errors);
        // skip all EOL
        this.jumpWhiteSpace();
        const body = this.declaration();
        errors.push(...body.errors);

        // parse else branch if found else
        this.jumpWhiteSpace();
        if (this.currentToken.type === TokenType.else) {
            const elseStmt = this.elseStmt();
            errors.push(...elseStmt.errors);
            return nodeResult(
                new Stmt.If(
                    iftoken,
                    condition.value,
                    elseStmt.value
                ),
                errors
            );
        }

        return nodeResult(
            new Stmt.If(
                iftoken,
                condition.value,
                body.value
            ),
            errors
        );
    }

    private elseStmt(): INodeResult<Stmt.Else> {
        const elsetoken = this.eat();
        const errors: ParseError[] = [];
        if (this.matchTokens([TokenType.if])) {
            const elif = this.ifStmt();
            errors.push(...elif.errors);
            return nodeResult(
                new Stmt.Else(
                    elsetoken,
                    elif.value
                ),
                errors
            );
        }
        const body = this.declaration();
        errors.push(...body.errors);
        return nodeResult(
            new Stmt.Else(
                elsetoken,
                body.value
            ),
            errors
        );
    }

    private breakStmt(): INodeResult<Stmt.Break> {
        const breakToken = this.currentToken;
        this.advance();

        // If there are break label, parse it
        if (!this.atLineEnd()) {
            
            // ',' is negotiable
            this.eatDiscardCR(TokenType.comma);
            const label = this.eatAndThrow(
                TokenType.id,
                'Expect a label name',
                Stmt.Break
            );
            this.terminal(Stmt.Break);
            return nodeResult(
                new Stmt.Break(breakToken, label),
                []
            );
        }

        this.terminal(Stmt.Break);
        return nodeResult(new Stmt.Break(breakToken), []);
    }

    private returnStmt(): INodeResult<Stmt.Return> {
        const returnToken = this.eat();
        
        // If expersions parse all
        if (!this.atLineEnd()) {
            // ',' is negotiable
            this.eatDiscardCR(TokenType.comma);
            const expr = this.expression();
            this.terminal(Stmt.Return)
            return nodeResult(
                new Stmt.Return(returnToken, expr.value),
                expr.errors
            );
        }
        this.terminal(Stmt.Return);
        return nodeResult(new Stmt.Return(returnToken), []);
    }

    private continueStmt(): INodeResult<Stmt.Continue> {
        const continueToken = this.eat();
        if (!this.atLineEnd()) {
            this.eatDiscardCR(TokenType.comma);
            const label = this.eatAndThrow(
                TokenType.id,
                'Expect a label name',
                Stmt.Continue
            );
            this.terminal(Stmt.Break);
            return nodeResult(
                new Stmt.Continue(continueToken, label),
                []
            );
        }
        return nodeResult(new Stmt.Continue(continueToken), []);
    }

    private switchStmt(): INodeResult<Stmt.SwitchStmt> {
        const switchToken = this.eat();
        const errors: ParseError[] = [];

        const cond = this.expression();
        errors.push(...cond.errors);

        this.jumpWhiteSpace();
        const open = this.eatAndThrow(
            TokenType.openBrace,
            'Expect a "{"',
            Stmt.SwitchStmt
        );
        
        const cases: Stmt.CaseStmt[] = [];
        let inloop = true;
        while (inloop) {
            switch (this.currentToken.type) {
                case TokenType.closeBrace:
                    // TODO: warning 0 case found
                    inloop = false;
                    break;
                case TokenType.case:
                    const caseToken = this.eat();
                    const conditions: IExpr[] = []
                    
                    do {
                        const cond = this.expression();
                        errors.push(...cond.errors);
                        conditions.push(cond.value);
                    } while (this.eatDiscardCR(TokenType.comma));
                    
                    const colon = this.eatAndThrow(
                        TokenType.colon,
                        'Expect a ":" at end of case',
                        Stmt.SwitchStmt
                    );
                    const stmts = this.stmtList();
                    errors.push(...stmts.errors);
                    cases.push(
                        new Stmt.CaseStmt(
                            new Stmt.CaseExpr(caseToken, conditions, colon),
                            stmts.value
                        )
                    );
                    break;
                case TokenType.label:
                    if (this.currentToken.content === 'default') {
                        // TODO: warning multidefault found
                        const caseToken = this.eat();
                        const CaseNode = new Stmt.DefaultCase(caseToken);
                        const stmts = this.stmtList();
                        errors.push(...stmts.errors);
                        cases.push(
                            new Stmt.CaseStmt(
                                CaseNode,
                                stmts.value
                            )
                        );
                        break;
                    }
                // skip WhiteSpace
                case TokenType.EOL:
                    this.jumpWhiteSpace();
                    continue;
                // throw other label to default
                default:
                    throw this.error(
                        this.currentToken,
                        'Expect "case" statement or "default:"',
                        Stmt.SwitchStmt
                    );
            }

        }
        const close = this.eatAndThrow(
            TokenType.closeBrace,
            'Expect a "}"',
            Stmt.SwitchStmt
        );
        return nodeResult(
            new Stmt.SwitchStmt(
                switchToken, cond.value,
                open, cases, close
            ), errors
        );
    }

    /**
     * Parse all statement below a case,
     * for switch-case statement
     * 用来解析switch下面的没有大括号的语句
     */
    private stmtList(): INodeResult<Stmt.Stmt[]> {
        const stmts: Stmt.Stmt[] = [];
        const errors: ParseError[] = [];
        do {
            const stmt = this.declaration();
            stmts.push(stmt.value);
            errors.push(...stmt.errors);

            // stop at default case
            if (this.currentToken.type === TokenType.label && 
                this.currentToken.content === 'default')
                break;
            this.jumpWhiteSpace();
        } while (!this.matchTokens([
            TokenType.case,
            TokenType.closeBrace
        ]));

        return nodeResult(stmts, errors);
    }

    private loopStmt(): INodeResult<Stmt.LoopStmt> {
        const loop = this.eat();
        // TODO: LOOP Funtoins
        // if no expression follows, check if is until loop
        if (this.matchTokens([
            TokenType.EOL,
            TokenType.EOF,
            TokenType.openBrace
        ])) {
            this.jumpWhiteSpace();
            const body = this.declaration();
            if (this.matchTokens([TokenType.until])) {
                const until = this.eatAndThrow(
                    TokenType.until,
                    'Expect a until in loop-until',
                    Stmt.UntilLoop
                );
                const cond = this.expression();
                this.terminal(Stmt.UntilLoop);
                return nodeResult(
                    new Stmt.UntilLoop(loop, body.value, 
                        until, cond.value),
                    body.errors.concat(cond.errors)
                );
            }
            return nodeResult(
                new Stmt.Loop(loop, body.value),
                body.errors
            );
        }
        
        // TODO: syntax check for loop command
        // just skip all command for now
        if (this.currentToken.type === TokenType.comma) {
            while (!this.matchTokens([
                TokenType.EOL,
                TokenType.EOF,
                TokenType.openBrace
            ])) {
                this.advance();
            }
            if (this.atLineEnd()) this.advance();
            const body = this.declaration();
            return nodeResult(
                new Stmt.Loop(loop, body.value, new Expr.Invalid(loop.start, [])),
                body.errors
            );
        }

        const cond = this.expression();
        this.jumpWhiteSpace();
        const body = this.declaration();
        return nodeResult(
            new Stmt.Loop(loop, body.value, cond.value),
            cond.errors.concat(body.errors)
        );
    }

    private whileStmt(): INodeResult<Stmt.WhileStmt> {
        const whileToken = this.currentToken;
        this.advance();
        const cond = this.expression();
        // skip all EOL
        this.jumpWhiteSpace();
        const body = this.declaration();

        return nodeResult(
            new Stmt.WhileStmt(whileToken, cond.value, body.value),
            cond.errors.concat(body.errors)
        );
    }

    private forStmt(): INodeResult<Stmt.ForStmt> {
        const forToken = this.currentToken;
        this.advance();
        const id1 = this.eatAndThrow(
            TokenType.id,
            'Expect an identifer in for loop',
            Stmt.ForStmt
        );
        if (this.currentToken.type === TokenType.comma) {
            const comma = this.eat();
            const id2 = this.eatAndThrow(
                TokenType.id,
                'Expect second identifer after `,` in for loop',
                Stmt.ForStmt
            );
            const inToken = this.eatAndThrow(
                TokenType.in,
                'Expect in keyword in for loop',
                Stmt.ForStmt
            );
            const iterable = this.expression();
            const body = this.declaration();
            return nodeResult(
                new Stmt.ForStmt(
                    forToken, inToken,
                    iterable.value,
                    body.value, 
                    id1, comma, id2
                ),
                iterable.errors.concat(body.errors)
            );
        }

        const inToken = this.eatAndThrow(
            TokenType.in,
            'Expect in keyword in for loop',
            Stmt.ForStmt
        );
        const iterable = this.expression();
        const body = this.declaration();
        return nodeResult(
            new Stmt.ForStmt(
                forToken, inToken,
                iterable.value,
                body.value,
                id1
            ),
            iterable.errors.concat(body.errors)
        );
    }

    private tryStmt(): INodeResult<Stmt.TryStmt> {
        const tryToken = this.currentToken;
        this.advance();
        this.jumpWhiteSpace();
        const body = this.declaration();
        const errors = body.errors;
        let catchStmt: Maybe<Stmt.CatchStmt>;
        let finallyStmt: Maybe<Stmt.FinallyStmt>;

        if (this.eatDiscardCR(TokenType.catch)) {
            const catchToken = this.previous();
            const errorVar = this.eatAndThrow(
                TokenType.id,
                'Expect an identifer as output variable',
                Stmt.TryStmt
            );
            this.jumpWhiteSpace();
            const body = this.declaration();
            errors.push(...body.errors);
            catchStmt = new Stmt.CatchStmt(
                catchToken, errorVar, body.value
            );
        }

        if (this.eatDiscardCR(TokenType.finally)) {
            const finallyToken = this.previous();
            this.jumpWhiteSpace();
            const body = this.declaration();
            errors.push(...body.errors);
            finallyStmt = new Stmt.FinallyStmt(finallyToken, body.value);
        }

        return nodeResult(
            new Stmt.TryStmt(tryToken, body.value, catchStmt, finallyStmt),
            errors
        );
    }

    private throwStmt(): INodeResult<Stmt.Throw> {
        const throwToken = this.eat();
        const expr = this.expression();
        return nodeResult(
            new Stmt.Throw(throwToken, expr.value),
            expr.errors
        );
    }

    // TODO: Need Finish
    private drective(): INodeResult<Stmt.Drective> {
        const drective = this.currentToken;
        if (drective.content.toLowerCase() === 'include') {
            this.tokenizer.isLiteralToken = true;
            this.advance();
            const includePath = this.eat();
            this.includes.add(includePath.content);
            this.terminal(Stmt.Drective);
            return nodeResult(
                new Stmt.Drective(drective, []),
                []
            )
        }
        const errors: ParseError[] = [];
        const args: IExpr[] = [];
        this.advance();
        while (!this.atLineEnd()) {
            if (this.matchTokens([TokenType.comma]))
                this.eat();
            const a = this.expression();
            errors.push(...a.errors);
            args.push(a.value);
        }

        this.terminal(Stmt.Drective);
        return nodeResult(
            new Stmt.Drective(drective, args),
            errors
        );
    }

    // assignment statemnet
    private assign(): INodeResult<Stmt.AssignStmt|Stmt.ExprStmt> {
        const left = this.factor();
        const errors = [...left.errors];
        if (this.currentToken.type >= TokenType.aassign &&
            this.currentToken.type <= TokenType.lshifteq) {
            const assign = this.currentToken;
            this.advance();
            const expr = this.expression();
            errors.push(...expr.errors);
            const trailers: Expr.Expr[] = [];

            if (this.eatDiscardCR(TokenType.comma)) {
                do {
                    const trailer = this.expression();
                    trailers.push(trailer.value);
                    errors.push(...trailer.errors);
                } while (this.eatDiscardCR(TokenType.comma));
            }

            this.terminal(Stmt.AssignStmt);
            return nodeResult(
                new Stmt.AssignStmt(left.value, assign, expr.value, trailers),
                errors
            );
        }
        if (this.currentToken.type === TokenType.equal) {
            // if is a `=` let tokenizer take literal token(string)
            this.tokenizer.isLiteralToken = true;
            this.tokenizer.setLiteralDeref(false);
            const assign = this.eat();
            const expr = this.expression();
            errors.push(...expr.errors);
            const trailers: Expr.Expr[] = [];

            if (this.eatDiscardCR(TokenType.comma)) {
                do {
                    const trailer = this.expression();
                    trailers.push(trailer.value);
                    errors.push(...trailer.errors);
                } while (this.eatDiscardCR(TokenType.comma));
            }

            this.terminal(Stmt.AssignStmt);
            return nodeResult(
                new Stmt.AssignStmt(left.value, assign, expr.value, trailers),
                errors
            );
        }

        return nodeResult(
            new Stmt.ExprStmt(left.value),
            left.errors
        );

    }

    // for test expresion
    public testExpr(): INodeResult<Expr.Expr> {
        this.tokens.pop();
        this.tokenizer.Reset();
        this.tokenizer.isParseHotkey = false;
        this.currentToken = this.nextToken(TokenType.EOL);
        this.tokens.push(this.currentToken);
        return this.expression();
    }

    private expression(p: number = 0): INodeResult<Expr.Expr> {
        let start = this.pos;
        // let tokenizer parse operators as normal
        // 让分词器不进行热键分词正常返回符号
        this.tokenizer.isParseHotkey = false;
        let result: INodeResult<Expr.Expr>;

        try {
            switch (this.currentToken.type) {
                // all Unary operator
                case TokenType.plus:
                case TokenType.minus:
                case TokenType.and:
                case TokenType.multi:
                case TokenType.not:
                case TokenType.bnot:
                case TokenType.pplus:
                case TokenType.mminus:
                case TokenType.new:
                    const saveToken = this.currentToken;
                    this.advance();
                    const q = (saveToken.type >= TokenType.pplus &&
                        saveToken.type <= TokenType.mminus) ?
                        Precedences[TokenType.pplus] :
                        UnaryPrecedence;
                    const expr = this.expression(q);
                    result = nodeResult(
                        new Expr.Unary(saveToken, expr.value),
                        expr.errors);
                    break;
                case TokenType.openParen:
                    // TODO: Process paren expression
                    let OPar = this.currentToken;
                    this.advance();
                    result = this.expression();
                    let CPar = this.currentToken;
                    this.advance();
                    break;
                case TokenType.number:
                case TokenType.string:
                case TokenType.openBrace:
                case TokenType.openBracket:
                case TokenType.id:
                case TokenType.precent:
                    // TODO: process array, dict, and precent expression
                    result = this.factor();
                    break;
                default:
                    // TODO: Allow all keywords as identifier and warn this
                    if (isValidIdentifier(this.currentToken.type)) {
                        result = this.factor();
                        break;
                    }
                    throw this.error(
                        this.currentToken,
                        'Expect an experssion',
                        Expr.Factor
                    );
            }

            // pratt parse
            while (true) {
                this.tokenizer.isParseHotkey = false;
                // infix left-associative 
                if ((this.currentToken.type >= TokenType.power &&
                    this.currentToken.type <= TokenType.logicor) &&
                    Precedences[this.currentToken.type] >= p) {
                    const saveToken = this.currentToken;
                    this.advance();
                    // array extend expression
                    if (saveToken.type === TokenType.multi && !this.matchTokens([
                        TokenType.plus, TokenType.minus, TokenType.and,
                        TokenType.multi, TokenType.not, TokenType.bnot,
                        TokenType.pplus, TokenType.mminus, TokenType.new,
                        TokenType.openParen, TokenType.number, TokenType.string,
                        TokenType.openBrace, TokenType.openBracket, TokenType.id,
                        TokenType.precent
                    ])) {
                        return nodeResult(
                            new Expr.Unary(
                                saveToken,
                                result.value
                            ), result.errors
                        );
                    }
                    const q = Precedences[saveToken.type];
                    const right = this.expression(q + 1);
                    result = nodeResult(
                        new Expr.Binary(
                            result.value,
                            saveToken,
                            right.value
                        ),
                        result.errors.concat(right.errors)
                    );
                    continue;
                }

                // postfix
                if ((this.currentToken.type >= TokenType.pplus &&
                    this.currentToken.type <= TokenType.mminus) &&
                    Precedences[this.currentToken.type] >= p) {
                    const saveToken = this.currentToken;
                    this.advance();
                    const q = Precedences[saveToken.type];
                    result = nodeResult(
                        new Expr.Unary(
                            saveToken,
                            result.value
                        ),
                        result.errors
                    );
                    continue;
                }

                // infix and ternary, right-associative 
                if ((this.currentToken.type >= TokenType.question &&
                    this.currentToken.type <= TokenType.lshifteq) &&
                    Precedences[this.currentToken.type] >= p) {
                    const saveToken = this.currentToken;
                    this.advance();
                    const q = Precedences[saveToken.type];

                    // ternary expression
                    if (saveToken.type === TokenType.question) {
                        // This expression has no relation 
                        // with next expressions. Thus, 0 precedence
                        const trueExpr = this.expression();
                        const colon = this.eatAndThrow(
                            TokenType.colon,
                            'Expect a ":" in ternary expression',
                            Expr.Ternary
                        );
                        // right-associative 
                        const falseExpr = this.expression(q);
                        result = nodeResult(
                            new Expr.Ternary(
                                result.value,
                                saveToken,
                                trueExpr.value,
                                colon,
                                falseExpr.value
                            ),
                            result.errors
                                .concat(trueExpr.errors)
                                .concat(falseExpr.errors)
                        );
                    }
                    // other assignments
                    else {
                        // right-associative 
                        const right = this.expression(q);
                        result = nodeResult(
                            new Expr.Binary(
                                result.value,
                                saveToken,
                                right.value
                            ),
                            result.errors.concat(right.errors)
                        );
                    }
                    continue;
                }

                // Implicit connect
                if ((this.currentToken.type >= TokenType.string &&
                    this.currentToken.type <= TokenType.precent) &&
                    Precedences[TokenType.sconnect] >= p) {
                    const right = this.expression(Precedences[TokenType.sconnect] + 1);
                    result = nodeResult(
                        new Expr.Binary(
                            result.value,
                            new Token(TokenType.implconn, ' ',
                                result.value.end,
                                right.value.start),
                            right.value
                        ),
                        result.errors.concat(right.errors)
                    );
                    continue;
                }

                break;
            }
            this.tokenizer.isParseHotkey = true;
            return result;
        }
        catch (error) {
            if (error instanceof ParseError) {
                // this.logger.verbose(JSON.stringify(error.partial));
                // this.synchronize(error.failed);
                this.synchronize(error.failed);

                // TODO: Correct error token list
                const tokens = this.tokens.slice(start, this.pos);
                tokens.push(this.currentToken);

                return nodeResult(
                    new Expr.Invalid(
                        tokens[0].start,
                        tokens
                    ),
                    [error]
                );
            }

            throw error;
        }
    }

    private factor(): INodeResult<Expr.Factor> {
        const suffixTerm = this.suffixTerm();
        const factor = new Expr.Factor(suffixTerm.value);
        const errors = suffixTerm.errors;

        // check is if factor has a suffix
        if (this.currentToken.type === TokenType.dot) {
            // create first suffix for connecting all suffix togther
            // TODO: Why use linked list here?
            // Is linked list more efficient than Array?
            let dot = this.currentToken;
            this.advance();
            let suffixTerm = this.suffixTerm(true);
            errors.push(...suffixTerm.errors);

            // link suffix to factor with trailer
            let trailer = new SuffixTerm.SuffixTrailer(suffixTerm.value);
            factor.dot = dot;
            factor.trailer = trailer;
            let current = trailer;

            // parse down and link all while is suffix
            while (this.currentToken.type === TokenType.dot) {
                let dot = this.currentToken;
                this.advance();
                let suffixTerm = this.suffixTerm(true);
                errors.push(...suffixTerm.errors);

                let trailer = new SuffixTerm.SuffixTrailer(suffixTerm.value);
                current.dot = dot;
                current.trailer = trailer;
            }
        }
        return nodeResult(factor, errors);
    }

    private suffixTerm(isTailor: boolean = false): INodeResult<SuffixTerm.SuffixTerm> {
        const atom = this.atom(isTailor);
        const trailers: SuffixTermTrailer[] = [];
        const errors: ParseError[] = [...atom.errors];

        const isValid = !(atom.value instanceof SuffixTerm.Invalid);

        // parse all exist trailor  
        while (isValid) {
            if (this.currentToken.type === TokenType.openBracket) {
                const bracket = this.arrayBracket();
                errors.push(...bracket.errors);
                trailers.push(bracket.value);
            }
            else if (this.currentToken.type === TokenType.openParen) {
                const callTrailer = this.funcCallTrailer();
                errors.push(...callTrailer.errors);
                trailers.push(callTrailer.value);
            }
            else
                break;
        }

        return nodeResult(
            new SuffixTerm.SuffixTerm(atom.value, trailers),
            errors
        );
    }

    private atom(isTailor: boolean = false): INodeResult<Atom> {
        switch (this.currentToken.type) {
            // TODO: All keywords is allowed in suffix.
            // But not allowed at first atom
            case TokenType.id:
                this.advance();
                return nodeResult(new SuffixTerm.Identifier(this.previous()), []);
            case TokenType.number:
            case TokenType.string:
                let t = this.currentToken;
                this.advance();
                return nodeResult(new SuffixTerm.Literal(t), []);
            case TokenType.precent:
                // TODO: Finish precent deference expresion
                let open = this.currentToken;
                this.advance();
                let derefAtom = this.atom();
                const errors = derefAtom.errors;
                if (this.currentToken.type === TokenType.precent) {
                    this.advance();
                    return nodeResult(derefAtom.value, errors);
                }
                else
                    throw this.error(
                        this.currentToken,
                        'Expect "%" in precent expression',
                        SuffixTerm.Identifier
                    );
            case TokenType.openBracket:
                return this.arrayTerm();
            case TokenType.openBrace:
                return this.associativeArray();
            default:
                // TODO: Allow all keywords here, and warn this
                if (isValidIdentifier(this.currentToken.type)) {
                    this.advance();
                    return nodeResult(new SuffixTerm.Identifier(this.previous()), []);
                }
                if (isTailor) {
                    const previous = this.previous();

                    return nodeResult(new SuffixTerm.Invalid(previous.end), [
                        this.error(previous, 'Expected suffix', undefined)
                    ]);
                }

                throw this.error(this.currentToken, 'Expected an expression', undefined);
        }
    }

    private arrayTerm(): INodeResult<SuffixTerm.ArrayTerm> {
        const open = this.currentToken;
        this.advance();
        const items: IExpr[] = [];
        const errors: ParseError[] = [];

        // if there are items parse them all
        if (this.currentToken.type !== TokenType.closeBracket &&
            this.currentToken.type !== TokenType.EOF) {
            let a = this.expression();
            items.push(a.value);
            errors.push(...a.errors);
            while (this.eatDiscardCR(TokenType.comma)) {
                a = this.expression();
                items.push(a.value);
                errors.push(...a.errors);
            }
        }

        const close = this.eatAndThrow(
            TokenType.closeBracket,
            'Expect a "]" to end array',
            SuffixTerm.ArrayTerm
        );

        return nodeResult(
            new SuffixTerm.ArrayTerm(open, close, items),
            errors
        );
    }

    private associativeArray(): INodeResult<SuffixTerm.AssociativeArray> {
        const open = this.currentToken;
        this.advance();
        const pairs: SuffixTerm.Pair[] = [];
        const errors: ParseError[] = [];

        // if there are pairs parse them all
        if (this.currentToken.type !== TokenType.closeBrace &&
            this.currentToken.type !== TokenType.EOF) {
            do {
                let a = this.pair();
                pairs.push(a.value);
                errors.push(...a.errors);
            } while (this.eatDiscardCR(TokenType.comma))
        }

        // try to skip every wrong pair and close dictionary
        if (this.currentToken.type !== TokenType.closeBrace) {
            errors.push(this.error(
                this.currentToken,
                'Wrong Expression for key-value pairs',
                SuffixTerm.Pair
            ));
            while (!this.matchTokens([TokenType.closeBrace]) && !this.atLineEnd()) {
                this.advance();
            }
        }
        const close = this.eatAndThrow(
            TokenType.closeBrace,
            'Expect a "}" at the end of associative array',
            SuffixTerm.AssociativeArray
        )

        return nodeResult(
            new SuffixTerm.AssociativeArray(open, close, pairs),
            errors
        );
    }

    private pair(): INodeResult<SuffixTerm.Pair> {
        const key = this.expression();
        const errors = key.errors;
        if (this.eatDiscardCR(TokenType.colon)) {
            const colon = this.previous();
            const value = this.expression();
            errors.push(...value.errors);
            return nodeResult(
                new SuffixTerm.Pair(key.value, colon, value.value),
                errors
            );
        }

        // if no colon, generate an error
        // and contiune parsing rest of dict
        errors.push(this.error(
            this.currentToken,
            'Expect a ":" on key-value pairs in associative array',
            SuffixTerm.Pair
        ));
        return nodeResult(
            new SuffixTerm.Pair(
                key.value,
                this.currentToken,
                new Expr.Invalid(this.currentToken.start, [this.currentToken])
            ),
            errors
        );
    }

    private arrayBracket(): INodeResult<SuffixTerm.BracketIndex> {
        const open = this.currentToken;
        this.advance();
        const indexs: Expr.Expr[] = [];
        const errors: ParseError[] = [];
        
        // Found all index and parse them
        // [index, index, ...]
        do {
            const index = this.expression();
            errors.push(...index.errors);
            indexs.push(index.value);
        } while (this.eatDiscardCR(TokenType.comma))

        const close = this.eatAndThrow(
            TokenType.closeBracket,
            'Expected a "]" at end of array index ',
            SuffixTerm.BracketIndex
            );

        return nodeResult(
            new SuffixTerm.BracketIndex(open, indexs, close),
            errors
        );
    }

    private funcCallTrailer(): INodeResult<SuffixTerm.Call> {
        const open = this.currentToken;
        this.advance();
        const args: IExpr[] = [];
        const errors: ParseError[] = [];

        // if there are arguments parse them all
        if (this.currentToken.type !== TokenType.closeParen &&
            this.currentToken.type !== TokenType.EOF) {
            if (this.currentToken.type === TokenType.comma)
                args.push(this.emptyArg());
            else {
                let a = this.expression();
                args.push(a.value);
                errors.push(...a.errors);
            }
            while (this.eatDiscardCR(TokenType.comma)) {
                if (this.currentToken.type === TokenType.comma)
                    args.push(this.emptyArg());
                else {
                    let a = this.expression();
                    args.push(a.value);
                    errors.push(...a.errors);
                }
            }
        }
        const close = this.eatAndThrow(
            TokenType.closeParen,
            'Expected a ")" at end of call',
            SuffixTerm.Call
        );
        return nodeResult(
            new SuffixTerm.Call(open, args, close),
            errors
        );
    }

    private emptyArg(): Expr.Expr {
        return new Expr.Factor(
            new SuffixTerm.SuffixTerm(
                new SuffixTerm.Literal(new Token(
                    TokenType.string, '',
                    Position.create(-1, -1),
                    Position.create(-1, -1)
                )), []
            )
        );
    }

    /**
     * Parse all condition related to Function statements
     */
    private func(): INodeResult<Stmt.ExprStmt|Decl.FuncDef> {
        let token = this.currentToken
        this.advance();
        const pos = this.pos;
        let unclosed: number = 1;
        while (unclosed > 0 && !this.atLineEnd()) {
            let t = this.peek().type
            if (t === TokenType.closeParen)
                unclosed--;
            if (t === TokenType.openParen) 
                unclosed++;
            this.advance();
        }

        this.advance();
        if (this.eatDiscardCR(TokenType.openBrace)) {
            this.backto(pos);
            return this.funcDefine(token);
        }

        this.backto(pos);
        return this.funcCall(token);
    }

    private funcDefine(name: Token): INodeResult<Decl.FuncDef> {
        let parameters = this.parameters();
        let block = this.block();
        let errors = parameters.errors.concat(block.errors);
        return {
            errors: errors,
            value: new Decl.FuncDef(
                name,
                parameters.value,
                block.value
            )
        };
    }

    /**
     * Parse a function call statement,
     * also parse statement with ',' expression trailer
     * @param name Name token of a function call
     */
    private funcCall(name: Token): INodeResult<Stmt.ExprStmt> {
        const call = this.funcCallTrailer();
        const errors: ParseError[] = [...call.errors];
        const trailers: Expr.Expr[] = [];
        
        if (this.eatDiscardCR(TokenType.comma)) {
            do {
                const trailer = this.expression();
                trailers.push(trailer.value);
                errors.push(...trailer.errors);
            } while (this.eatDiscardCR(TokenType.comma));
        }

        const callFactor = new Expr.Factor(
            new SuffixTerm.SuffixTerm(
                new SuffixTerm.Identifier(name),
                [call.value]
            )
        );

        this.terminal(Stmt.AssignStmt);
        return nodeResult(
            new Stmt.ExprStmt(callFactor, trailers),
            errors
        );
    }

    private parameters(): INodeResult<Decl.Param> {
        const open = this.eat();
        const errors: ParseError[] = [];
        const requiredParameters: Decl.Parameter[] = [];
        const DefaultParameters: Decl.DefaultParam[] = [];
        let isDefaultParam = false;

        if (this.currentToken.type !== TokenType.closeParen) {
            do {
                if (TokenType.byref === this.currentToken.type) 
                    this.eat();
                try {
                    if (isDefaultParam) {
                        const param = this.defaultParameter();
                        errors.push(...param.errors);
                        DefaultParameters.push(param.value);
                    }
                    else {
                        const p = this.peek();
                        // check if it is a default parameter
                        if (p.type === TokenType.aassign || p.type === TokenType.equal) {
                            isDefaultParam = true;
                            const param = this.defaultParameter();
                            errors.push(...param.errors);
                            DefaultParameters.push(param.value);
                        }
                        else if (p.type === TokenType.multi) {
                            isDefaultParam = true;
                            const param = this.defaultParameter(true);
                            errors.push(...param.errors);
                            DefaultParameters.push(param.value);
                        }
                        else {
                            const param = this.requiredParameter();
                            requiredParameters.push(param.value);
                        }
                    }
                }
                catch (e) {
                    if (e instanceof ParseError) {
                        // synchronize parser, try to parse next parameter
                        while (!this.matchTokens([
                            TokenType.comma,
                            TokenType.closeParen
                        ])) {
                            this.advance();
                        }
                    }
                    else
                        throw e;
                }

                
            } while(this.eatDiscardCR(TokenType.comma));
        }

        const close = this.eatAndThrow(
            TokenType.closeParen,
            'Expect a ")"',
            Decl.Param
        );
        return nodeResult(
            new Decl.Param(
                open,
                requiredParameters,
                DefaultParameters,
                close
            ), errors
        );
    }

    private requiredParameter():  INodeResult<Decl.Parameter> {
        const name = this.eatAndThrow(
            TokenType.id,
            'Expect an identifier in parameter',
            Decl.Parameter
        );

        return nodeResult(new Decl.Parameter(name), []);
    }

    /**
     * Parse default parameter of function
     * @param isExtend if parameter is array extend parameter
     */
    private defaultParameter(isExtend: Boolean = false):  INodeResult<Decl.DefaultParam> {
        const errors: ParseError[] = [];
        const name = this.eatAndThrow(
            TokenType.id,
            'Expect an identifier in parameter',
            Decl.DefaultParam
        );

        // if is parameter*
        if (isExtend) {
            const star = this.eat();
            return nodeResult(
                new Decl.DefaultParam(
                    name, star, new Expr.Invalid(star.start, [star])
                ), []
            );
        }

        if (this.matchTokens([
            TokenType.aassign,
            TokenType.equal
        ])) {
            const assign = this.eat();
            const dflt = this.expression();
            errors.push(...dflt.errors);
            return nodeResult(
                new Decl.DefaultParam(
                    name, assign, dflt.value
                ),
                errors
            );
        }
        throw this.error(
            this.currentToken,
            'Expect a optional parameter',
            Decl.DefaultParam
        );
    }

    private command(): INodeResult<Stmt.Stmt> {
        const cmd = this.eat();
        // TODO: syntax check for command
        // just jump everything for now
        while (!this.atLineEnd()) {
            this.advance();
        }
        return nodeResult(
            new Stmt.Invalid(cmd.start, []),
            []
        );
    }

    /**
     * Check the the statement is terminated
     * @param failed failed constructor context
     */
    private terminal(failed: Maybe<NodeConstructor>) {
        if (this.currentToken.type !== TokenType.EOF)
            this.eatAndThrow(
                TokenType.EOL,
                'Expect "`n" to terminate statement',
                failed
            );
    }

    /**
     * backwards tokens
     * @param pos position to
     */
    private backto(pos: number) {
        this.pos = pos;
        this.currentToken = this.tokens[pos];
    }

    /**
     * check if token match type,
     * and when token is return 
     * check next token 
     */
    private eatDiscardCR(t: TokenType): Maybe<Token> {
        if (this.currentToken.type === TokenType.EOL) {
            if (this.peek().type === t) {
                this.advance().advance();
                return this.previous();
            }
        }
        else if (this.check(t)) {
            this.advance();
            return this.previous();
        }
        return undefined;
    }

    private check(t: TokenType): boolean {
        return t === this.currentToken.type;
    }

    private eat(): Token {
        this.advance();
        return this.previous();
    }

    private eatAndThrow(t: TokenType, message: string, failed: Maybe<NodeConstructor>) {
        if (this.currentToken.type === t) {
            this.advance();
            return this.previous();
        }
        else
            throw this.error(this.currentToken, message, failed);
    }

    /**
     * check if current token matches a set of tokens
     * @param ts match types array 
     */
    private matchTokens(ts: TokenType[]): boolean {
        if (this.currentToken.type === TokenType.EOF) return false;
        for (const t of ts) {
            if (t === this.currentToken.type)
                return true;
        }
        return false;
    }

    private jumpWhiteSpace() {
        while (this.currentToken.type === TokenType.EOL)
            this.advance();
    }

    private atLineEnd(): boolean {
        return this.currentToken.type === TokenType.EOL ||
               this.currentToken.type === TokenType.EOF;
    }

    // attempt to synchronize parser
    private synchronize(failed: FailedConstructor): void {
        // need to confirm this is the only case
        // if this is not a statement fail, 
        // we no need to skip all expressions 
        // Just check if next some is able to parse 
        if (failed.stmt === undefined) {
          this.advance();
        }

        while (this.currentToken.type !== TokenType.EOF) {
            // try to parse next statement
            if (this.previous().type === TokenType.EOL) return;
            // skip until next statement
            // and try to parse them
            switch (this.currentToken.type) {
                // declarations
                case TokenType.local:
                case TokenType.global:
                case TokenType.static:
                case TokenType.class:

                // commands
                case TokenType.command:

                // control flow
                case TokenType.if:
                case TokenType.loop:
                case TokenType.while:
                case TokenType.until:
                case TokenType.return:
                case TokenType.break:
                case TokenType.switch:
                case TokenType.for: 
                case TokenType.try:
                case TokenType.throw:
                
                // drective
                case TokenType.drective:

                // expression spliter
                // case TokenType.comma:
                    return
                // close scope
                case TokenType.closeBrace:
                    return;
                
                default:
                    break;
            }

            this.advance();
        }
    }

}