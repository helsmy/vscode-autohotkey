import { Tokenizer } from "../tokenizor/tokenizer";
import { Atom, IAST, SuffixTermTrailer } from "../types";
import { isValidIdentifier, TokenType } from "../tokenizor/tokenTypes";
import { IParseError } from "../types";
import { ParseError } from './models/parseError';
import * as Stmt from './models/stmt';
import * as Expr from './models/expr';
import * as SuffixTerm from './models/suffixterm';
import { Precedences, UnaryPrecedence } from './models/precedences';
import * as Decl from './models/declaration';
import { IDiagnosticInfo, MissingToken, SkipedToken, Token, TokenKind } from '../tokenizor/types';
import { mockLogger } from '../../../utilities/logger';
import { Script } from '../models/script';
import { DelimitedList } from './models/delimtiedList';
import { NodeBase } from './models/nodeBase';
import { ParseContext } from './models/parseContext';
import { URI } from 'vscode-uri';
import { join } from 'path';
import { idFactor } from './utils/nodeBuilder';

type IsStartFn = (t: Token) => boolean;
type ParseFn<T> = () => T; 
export class AHKParser {
    private tokenizer: Tokenizer;
    private tokenGetter;
    private pos: number = -1;
    private readonly uri: string;

    private currentParseContext: number; 
    /**
     * list for storaging all tokens
     */
    private tokens: Token[] = [];
    private tokenErrors: IDiagnosticInfo[] = [];
    private comments: Token[] = [];
    private includes: Set<string> = new Set();

    private readonly logger: ILoggerBase;

    private readonly v2mode: boolean;

    constructor(document: string, uri: string, v2mode = false, logger: ILoggerBase = mockLogger) {
        this.v2mode = v2mode;
        this.tokenizer = new Tokenizer(document, v2mode, logger);
        this.tokenizer.isParseHotkey = true;
        this.tokenGetter = this.tokenizer.GenToken();
        this.advance();
        this.logger = logger;
        this.uri = uri;
        this.currentParseContext = 0;
    }

    private get currentToken(): Token {
        return this.tokens[this.pos];
    }

    /**
     * Retrieve next meaningful token,
     * any error or comment token will not be included
     * @returns 
     */
    private nextToken(): Token {
        let tokenResult = this.tokenGetter.next().value;
        while (tokenResult.kind !== TokenKind.Token) {
            switch (tokenResult.kind) {
                case TokenKind.Diagnostic:
                    this.tokenErrors.push(tokenResult.result);
                    tokenResult = this.tokenGetter.next().value;
                    continue;
                case TokenKind.Commnet:
                    this.comments.push(tokenResult.result);
                    tokenResult = this.tokenGetter.next().value;
                    continue;
            }
        }
        return tokenResult.result;
    }

    private advance() {
        this.pos++;
        if (this.pos >= this.tokens.length) {
            const token = this.nextToken();
            // AHK connect next line to current line
            // when next line start with operators and ','
            if (token.type === TokenType.EOL) 
                this.skipEOLIfNeed(token);
            else
                this.tokens.push(token);
        }
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

        let token = this.nextToken();

        if (token.type === TokenType.EOL) {
            this.skipEOLIfNeed(token);
            return this.tokens[this.pos+1];
        }
        this.tokens.push(token);
        return token;
    }

    private skipEOLIfNeed(token: Token) {
        const saveToken = token;
        do {
            token = this.nextToken();
        } while (token.type === TokenType.EOL);

        // 下一行是运算符或者','时丢弃EOL, `++` 和 `--`除外
        // discard EOL, 
        // see: https://www.autohotkey.com/docs/v2/Scripts.htm#continuation
        if ((this.isPossibleBinaryOperator(token.type)) ||
            // `:` in ternay expression and associative array
            token.type === TokenType.colon ||
            token.type === TokenType.comma ||
            token.type === TokenType.dot) {
            this.tokens.push(token);
        }
        else {
            this.tokens.push(saveToken);
            this.tokens.push(token);
        }
    }

    /**
     * If next character is matched 
     * @param skipWhite skip whitespace or not
     * @param chars char to be matched 
     */
    private matchPeekChar(skipWhite = false, ...chars: string[]): boolean {
        // 先检查有没有剩余的token，没有再向tokenizer请求
        const p = (this.pos + 1 <= this.tokens.length - 1) ? 
                    this.tokens[this.pos + 1].content[0]   :     
                    this.tokenizer.Peek(1, skipWhite);
        for (const c of chars) {
            if (p === c) return true;
        }
        return false;
    }

    private delimitedList<T extends NodeBase | Token>(
        delimiter: TokenType, isElementStartFn: IsStartFn, parseElementFn: ParseFn<T>, allowEmptyElement = false
    ): DelimitedList<T> {
        let list = new DelimitedList<T>();
        while (true) {
            // v2 allow `,` on the end of line, 
            // so there will be EOL be element
            if (this.v2mode && delimiter === TokenType.comma) 
                this.jumpWhiteSpace();
            if (isElementStartFn(this.currentToken)) {
                list.addElement(parseElementFn());
            }
            else if (!allowEmptyElement) {
                // TODO: Maybe that add a MissingToken is better then 
                // that just break here
                break;
            }
            const delimiterToken = this.eatOptional(delimiter);
            if (delimiterToken === undefined) {
                break;
            }
            list.addElement(delimiterToken);
        }
        return list;
    }

    private expressionList(): DelimitedList<Expr.Expr> {
        return this.delimitedList(
            TokenType.comma,
            this.isExpressionStart,
            () => this.expression()
        );
    }

    /**
     * Let tokenizer scan at Command mode. In other word,
     * generate string token for command
     * @param flag 
     */
    private setCommandScanMode(flag: boolean) {
        this.tokenizer.isLiteralToken = flag;
    }

    public parse(): IAST {
        const diagnostics: IParseError[] = [];
        const baseName = this.uri.split('/').slice(-1)[0];

        this.logger.info(`Parsing started for ${baseName}`);
        
        try {
            const start = Date.now();
            const statment = this.parseList(ParseContext.SourceElements);
            const end = Date.now();
            this.logger.info(`Parsing finished for ${baseName}, take ${end - start} ms`);

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
            this.logger.error(JSON.stringify(error));
        }

        return {
            script: new Script(this.uri, [], [], []),
            sytanxErrors: [],
            tokenErrors: []
        };
    }

    // Make Typescipt happy OTZ
    private parseList(listParseContext: ParseContext.SwitchStatementElements): Stmt.CaseStmt[]
    private parseList(listParseContext: ParseContext.CaseStatementElements): Stmt.Stmt[]
    private parseList(listParseContext: ParseContext.SourceElements): Stmt.Stmt[]
    private parseList(listParseContext: ParseContext.DynamicPropertyElemnets): Stmt.Stmt[]
    private parseList(listParseContext: ParseContext.BlockStatements): Stmt.Stmt[]
    private parseList(listParseContext: ParseContext.ClassMembers): Stmt.Stmt[]
    private parseList(listParseContext: ParseContext) {
        const savedContext = this.currentParseContext;
        this.currentParseContext |= 1 << listParseContext;
        const parseListElementFn = this.getParseListElementFn(listParseContext);

        let stmts: Stmt.Stmt[] = [];
        this.jumpWhiteSpace()
        while (!this.isListTerminator(listParseContext)) {
            if (this.isValidListStart(listParseContext)) {
                const element = parseListElementFn();
                stmts.push(element);
                this.jumpWhiteSpace();
                continue;
            }
            
            // Error handle logic
            // The current parse context does not know how to handle the current token,
            // so check if the enclosing contexts know what to do. If so, we assume that
            // the list has completed parsing, and return to the enclosing context.
            // 
            // For detail see: https://github.com/microsoft/tolerant-php-parser
            if (this.isCurrentTokenValidInEnclosingContexts()) {
                break;
            }

            // Current token is invaild. Generate a skippedToken, 
            // and try to parse next one in current context
            const token = new SkipedToken(this.currentToken);
            stmts.push(new Stmt.Invalid(token.start, [token]));
            this.advance();
            this.jumpWhiteSpace();
        }

        this.currentParseContext = savedContext;
        
        return stmts;
    }

    private getParseListElementFn(listParseContext: ParseContext): () => Stmt.Stmt {
        switch (listParseContext) {
            case ParseContext.SourceElements:
            case ParseContext.BlockStatements:
            case ParseContext.IfClause2Elements:
            case ParseContext.CaseStatementElements:
                return this.declaration.bind(this);
            case ParseContext.SwitchStatementElements:
                return this.caseStmtList.bind(this);
            case ParseContext.ClassMembers:
                return this.classMemberElement.bind(this);
            case ParseContext.DynamicPropertyElemnets:
                return this.dynamicPropertyMember.bind(this);
            default:
                throw new Error('Unrecognized parse context');
        }
    }

    private isListTerminator(listParseContext: ParseContext): boolean {
        const t = this.currentToken.type;
        
        if (t === TokenType.EOF) return true;

        switch (listParseContext) {
            case ParseContext.SourceElements:
                return false;
            case ParseContext.BlockStatements:
            case ParseContext.ClassMembers:
            case ParseContext.SwitchStatementElements:
            case ParseContext.DynamicPropertyElemnets:
                return t === TokenType.closeBrace;
            case ParseContext.IfClause2Elements:
                return t === TokenType.else;
            case ParseContext.CaseStatementElements:
                return t === TokenType.case || 
                       this.isDefauleCase() ||
                       t === TokenType.closeBrace;
            default:
            throw new Error('Unrecognized parse context');
        }
    }

    private isValidListStart(listParseContext: ParseContext): boolean {
        switch (listParseContext) {
            case ParseContext.SourceElements:
            case ParseContext.BlockStatements:
            case ParseContext.IfClause2Elements:
            case ParseContext.CaseStatementElements:
                return this.isStatementStart();
            case ParseContext.ClassMembers:
                return this.isClassMemberDeclarationStart();
            // TODO: Handle default:
            case ParseContext.SwitchStatementElements:
                return this.currentToken.type === TokenType.case || this.isDefauleCase();
            case ParseContext.DynamicPropertyElemnets:
                return this.isDynamicPropertyStart();
            default:
                throw new Error('Unrecognized parse context');
        }
    }

    /**
     * Aborts parsing list when one of the parent contexts understands something
     * @return bool
     */
    private isCurrentTokenValidInEnclosingContexts(): boolean {
        for (let contextKind = 0; contextKind < ParseContext.Count; contextKind++) {
            if (this.isInParseContext(contextKind)) {
                if (this.isValidListStart(contextKind) || this.isListTerminator(contextKind)) {
                    return true;
                }
            }
        }
        return false;
    }

    private isInParseContext(contextToCheck: number) {
        return (this.currentParseContext & (1 << contextToCheck));
    }

    private isStatementStart(): boolean {
        const t = this.currentToken.type;
            
        switch (t) {
            case TokenType.openBrace:
            case TokenType.key:
            case TokenType.hotkeyModifer:
            case TokenType.hotstringOpen:
            case TokenType.drective:
            case TokenType.command:
                return true;

            // Control flows
            case TokenType.if:
            case TokenType.switch:
            case TokenType.loop:
            case TokenType.for:
            case TokenType.while:
                return true;
            
            // Jump Statements
            case TokenType.break:
            case TokenType.continue:
            case TokenType.return:
            case TokenType.throw:
            case TokenType.gosub:
            case TokenType.goto:
                return true;
            
            // The try Statement
            case TokenType.try:
                return true;
            
            // Declaration Statements
            case TokenType.global:
            case TokenType.local:
            case TokenType.static:
                return true;

            default:
                return this.isAllowedExpressionStatementStart();
        }
    }

    private isAllowedExpressionStatementStart(): boolean {
        const t = this.currentToken.type;

        switch (t) {
            case TokenType.id:
                return true;
            // 有豁免检查 recognized action 能力的符号
            case TokenType.pplus:
            case TokenType.mminus:
            case TokenType.openParen:
            case TokenType.openBrace:
                return true;
        
            default:
                // TODO: check if is assignment statement start
                return isValidIdentifier(t);
        }
    }

    private isClassMemberDeclarationStart(): boolean {
        const t = this.currentToken.type;
        if (t >= TokenType.if && t <= TokenType.byref ||
            t === TokenType.id || t === TokenType.drective ||
            t === TokenType.class) 
            return true;
        return false;
    }

    private isDynamicPropertyStart(): boolean {
        const token = this.currentToken;
        const content = token.content.toLowerCase();
        // 也许应该检查下个token是不是 `{`
        return token.type === TokenType.id &&
            (content === 'get' || content === 'set');
    }

    public testDeclaration(): Stmt.Stmt {
        return this.declaration();
    }

    private declaration(): Stmt.Stmt {
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
                case TokenType.key:
                case TokenType.hotkeyModifer:
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

    private varDecl(): Decl.VarDecl {
        const scope = this.eat();

        const assign = this.expressionList();

        this.terminal();

        return new Decl.VarDecl(scope, assign);
    }

    private classDefine(): Decl.ClassDef {
        const classToken = this.eat();
        const name = this.eatType(TokenType.id);
        const extendsToken = this.eatOptional(TokenType.extends)
        if (extendsToken !== undefined) {
            const list = this.factor();
            const baseClass = new Decl.ClassBaseClause(
                extendsToken, list
            );
            const body = this.classMember();
            return new Decl.ClassDef(
                classToken, name,
                body, baseClass
            );
        }
        const body = this.classMember();
        return new Decl.ClassDef(classToken, name, body);
    }

    // TODO:  class block statement
    private classMember(): Stmt.Block {
        this.jumpWhiteSpace();
        const open = this.eatType(TokenType.openBrace)
        const block = this.parseList(ParseContext.ClassMembers);
        this.jumpWhiteSpace();
        const close = this.eatType(TokenType.closeBrace);

        return new Stmt.Block(open, block, close);
    }

    private classMemberElement(): Stmt.Stmt {
        // AHK only has one type of modifier in class, just match `static`.
        const modifier = this.eatOptional(TokenType.static);
        const token = this.currentToken;
        // FIXME: Report error and recode modifier, when modifier does not needed.
        // If class keyword is not used as name of property or method
        if (token.type === TokenType.class && !(this.tokenizer.Peek() === '(')) 
            return this.classDefine()
        if (isValidIdentifier(this.currentToken.type))
            return this.idLeadClassMember(modifier);
        if (token.type === TokenType.drective)
            return this.drective();
        return this.assignStmt();
    }

    private idLeadClassMember(modifier: Maybe<Token>): Stmt.Stmt {
        const p = this.peek();
        switch (p.type) {
            // function
            case TokenType.openParen:
                const name = this.eat();
                return this.funcDefine(name);
            case TokenType.openBracket:
            case TokenType.openBrace:
                return this.dynamicProperty();
            default:
                return this.propertyOrAssignExpression(modifier);
        }
    }

    private propertyOrAssignExpression(modifier: Maybe<Token>): Stmt.Stmt {
        // TODO: better handle error property
        if (modifier)
            return this.propertyDeclaration(modifier);
        return this.assignStmt();
    }

    private propertyDeclaration(modifier: Token): Stmt.Stmt {
        const expressions = this.expressionList();
        return new Decl.VarDecl(modifier, expressions);
    }

    /**
     * Getter Setter method
     * @returns 
     */
    private dynamicProperty(): Decl.DynamicProperty {
        const name = this.eat();
        let parameter: Maybe<Decl.Param>;
        if (this.currentToken.type == TokenType.openBracket)
            parameter = this.parameters(TokenType.closeBracket);
    
        // ShorterProperty[Parameters] '=>' expression
        if (this.v2mode) {
            const fatArrow = this.eatOptional(TokenType.fatArrow);
            if (fatArrow) {
                const expr = this.expression();
                const stmt = new Stmt.ExprStmt(expr);
                return new Decl.DynamicProperty(name, stmt, parameter);
            }
        }
        
        this.jumpWhiteSpace();
        const open = this.eatType(TokenType.openBrace);
        const block = this.parseList(ParseContext.DynamicPropertyElemnets);
        this.jumpWhiteSpace();
        const close = this.eatType(TokenType.closeBrace);
        const body = new Stmt.Block(open, block, close);

        return new Decl.DynamicProperty(
            name, body, parameter
        );
    }

    private dynamicPropertyMember(): Decl.GetterSetter {
        const name = this.eatType(TokenType.id);
        this.jumpWhiteSpace();

        // ('get'| 'set') '=>' expression
        if (this.v2mode) {
            const fatArrow = this.eatOptional(TokenType.fatArrow);
            if (fatArrow) {
                const expr = this.expression();
                const stmt = new Stmt.ExprStmt(expr);
                return new Decl.GetterSetter(name, stmt);
            }
        }
        
        const open = this.eatType(TokenType.openBrace);
        const block = this.parseList(ParseContext.BlockStatements);
        this.jumpWhiteSpace();
        const close = this.eatType(TokenType.closeBrace);
        const body = new Stmt.Block(open, block, close);
        
        return new Decl.GetterSetter(name, body);
    }

    private label(): Decl.Label {
        const name = this.eat();
        this.eatType(TokenType.colon);
        return new Decl.Label(name);
    }

    // v1 version
    private hotkey(): Decl.Hotkey {
        const modifier = this.eatOptional(TokenType.hotkeyModifer);
        const k1 = new Decl.Key(this.eatType(TokenType.key), modifier);
        const and = this.eatOptional(TokenType.hotkeyand);
        if (and) {
            const k2 = new Decl.Key(this.currentToken);
            this.advance();
            const up = this.eatOptional(TokenType.hotkeyModifer);
            const hotkey = this.eatType(TokenType.hotkey);
            return new Decl.Hotkey(k1, hotkey, up, and, k2);
        }
        const up = this.eatOptional(TokenType.hotkeyModifer);
        const hotkey = this.eatType(TokenType.hotkey);
        return new Decl.Hotkey(k1, hotkey, up);
    }

    private hotstring(): Decl.HotString {
        const option = this.eat();
        const str = this.eatType(TokenType.hotstringEnd);
        // TODO: FINISH X OPTION
        if (this.atLineEnd()) {
            const expend = this.eat();
            return new Decl.HotString(option, str, expend);
        }
        const expend = this.eatType(TokenType.string);
        return new Decl.HotString(option, str, expend);
    } 

    private statement(): Stmt.Stmt {
        switch (this.currentToken.type) {
            case TokenType.id:
                return this.idLeadStatement();
            case TokenType.openBrace:
                return this.block();
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
            // 有些符号有豁免检查 recognized action 的能力
            case TokenType.pplus:
            case TokenType.mminus:
            case TokenType.openParen:
            case TokenType.openBrace:
                return this.exprStmt();
            default:
                // 这里不可能发生，
                // isStatementStart 里允许的可能
                // 在这里已经枚举完
                this.logger.error(`In statement, Unexpect token[${this.currentToken.start.line}:${this.currentToken.start.character}]: ${this.currentToken.content}|${this.currentToken.type}`);
                return this.idLeadStatement();
        }
    }

    private idLeadStatement(): Stmt.Stmt {
        const p = this.peek()
        switch (p.type) {
            case TokenType.openParen:
                return this.func();
            case TokenType.hotkeyand:
            case TokenType.hotkey:
                return this.hotkey();            
            // 允许 var++ 的语法
            case TokenType.pplus:
            case TokenType.mminus:
                return this.exprStmt();
            case TokenType.colon:
                // 如果不是贴在一起的`:`就直接穿透到default case
                if (p.start.line === this.currentToken.end.line &&
                    p.start.character === this.currentToken.end.character)
                    return this.label();
            // 其他是语法错误，统一当作有错误的赋值语句
            default:
                return this.assignStmt();
        }
    }

    private block(): Stmt.Block {
        this.jumpWhiteSpace();
        const open = this.eatType(TokenType.openBrace);
        const block = this.parseList(ParseContext.BlockStatements);
        this.jumpWhiteSpace();
        const close = this.eatType(TokenType.closeBrace);

        return new Stmt.Block(open, block, close);
    }

    private ifStmt(): Stmt.If {
        const iftoken = this.currentToken;
        this.advance();
        const condition = this.expression();
        // skip all EOL
        this.jumpWhiteSpace();

        // FIXME: 这个if要怎么搞嘛还要可以单行语句
        const body = this.statement();

        // parse else branch if found else
        this.jumpWhiteSpace();
        if (this.currentToken.type === TokenType.else) {
            const elseStmt = this.elseStmt();
            return new Stmt.If(
                iftoken,
                condition,
                body,
                elseStmt
            );
        }

        return new Stmt.If(
            iftoken,
            condition,
            body
        );
    }

    private elseStmt(): Stmt.Else {
        const elsetoken = this.eat();
        if (this.matchTokens([TokenType.if])) {
            const elif = this.ifStmt();
            return new Stmt.Else(
                elsetoken,
                elif
            )
        }
        const body = this.declaration();
        return new Stmt.Else(
            elsetoken,
            body
        );
    }

    private breakStmt(): Stmt.Break {
        const breakToken = this.currentToken;
        this.advance();
        // FIXME: record comma
        this.eatOptional(TokenType.comma);

        // If there are break label, parse it
        if (!this.atLineEnd()) {
            
            // ',' is negotiable
            this.eatDiscardCR(TokenType.comma);
            const label = this.eatId();
            this.terminal();
            return new Stmt.Break(breakToken, label);
        }

        this.terminal();
        return new Stmt.Break(breakToken);
    }

    private returnStmt(): Stmt.Return {
        const returnToken = this.eat();
        // FIXME: record comma
        this.eatOptional(TokenType.comma);
        
        // If expersions parse all
        if (!this.atLineEnd()) {
            // ',' is negotiable
            this.eatDiscardCR(TokenType.comma);
            const expr = this.expression();
            this.terminal()
            return new Stmt.Return(returnToken, expr);
        }
        this.terminal();
        return new Stmt.Return(returnToken);
    }

    private continueStmt(): Stmt.Continue {
        const continueToken = this.eat();
        const comma = this.eatDiscardCR(TokenType.comma);
        if (!this.atLineEnd() && isValidIdentifier(this.currentToken.type)) {
            const label = this.eat();
            this.terminal();
            return new Stmt.Continue(continueToken, label);
        }
        this.terminal();
        return new Stmt.Continue(continueToken);
    }

    private switchStmt(): Stmt.SwitchStmt {
        const switchToken = this.eat();
        // FIXME: record comma
        this.eatOptional(TokenType.comma);
        const cond = this.expression();

        this.jumpWhiteSpace();
        const open = this.eatType(TokenType.openBrace);
        const cases = this.parseList(ParseContext.SwitchStatementElements);
        const close = this.eatType(TokenType.closeBrace);
        return new Stmt.SwitchStmt(
            switchToken, cond,
            open, cases, close
        );
    }

    private caseStmtList(): Stmt.CaseStmt {
        const caseToken = this.eat();
        // if is case statment
        if (caseToken.type === TokenType.case) {
            // FIXME: record comma
            this.eatOptional(TokenType.comma);
            const conditions = this.expressionList();
            const colon = this.eatType(TokenType.colon);
            const stmts = this.parseList(ParseContext.CaseStatementElements);
            return new Stmt.CaseStmt(
                new Stmt.CaseExpr(caseToken, conditions, colon),
                stmts
            );
        }
        // if is default statment
        this.eatType(TokenType.colon);
        const CaseNode = new Stmt.DefaultCase(caseToken);
        const stmts = this.parseList(ParseContext.CaseStatementElements);
        return new Stmt.CaseStmt(
            CaseNode,
            stmts
        );
    }

    private loopStmt(): Stmt.LoopStmt {       
        const loop = this.eat();

        // if no expression follows, check if is until loop
        if (this.matchTokens([
            TokenType.EOL,
            TokenType.EOF,
            TokenType.openBrace
        ])) {
            this.jumpWhiteSpace();
            const body = this.declaration();
            const until = this.eatOptional(TokenType.until)
            if (until) {
                const cond = this.expression();
                this.terminal();
                return new Stmt.UntilLoop(loop, body, until, cond);
            }
            return new Stmt.Loop(loop, body);
        }
        
        // TODO: syntax check for loop command
        // just skip all command for now
        // FIXME: record comma
        this.eatOptional(TokenType.comma);
        const loopmode = this.currentToken.content.toLowerCase();

        // TODO: LOOP Funtoins
        // Check if in any command loop mode
        if (loopmode === 'files' ||
            loopmode === 'parse' ||
            loopmode === 'read'  ||
            loopmode === 'reg') 
            this.setCommandScanMode(true);

        const param = this.expressionList();
        if (this.atLineEnd()) this.advance();
        const body = this.declaration();
        return new Stmt.Loop(loop, body, param);
    }

    private whileStmt(): Stmt.WhileStmt {
        const whileToken = this.currentToken;
        this.advance();
        const cond = this.expression();
        // skip all EOL
        this.jumpWhiteSpace();
        const body = this.declaration();

        return new Stmt.WhileStmt(whileToken, cond, body)
    }

    private forStmt(): Stmt.ForStmt {
        const forToken = this.eat();
        const id1 = idFactor(this.eatId());
        if (this.currentToken.type === TokenType.comma) {
            const comma = this.eat();
            const id2 = idFactor(this.eatId());
            const inToken = this.eatType(TokenType.in);
            const iterable = this.expression();
            const body = this.declaration();
            return new Stmt.ForStmt(
                forToken, inToken,
                iterable, body, 
                id1, comma, id2
            );
        }

        const inToken = this.eatType(TokenType.in);
        const iterable = this.expression();
        const body = this.declaration();
        return new Stmt.ForStmt(
            forToken, inToken,
            iterable, body, id1
        );
    }

    private tryStmt(): Stmt.TryStmt {
        const tryToken = this.eat();
        this.jumpWhiteSpace();
        const body = this.declaration();
        let catchStmt: Maybe<Stmt.CatchStmt>;
        let finallyStmt: Maybe<Stmt.FinallyStmt>;

        this.jumpWhiteSpace();
        const catchToken = this.eatOptional(TokenType.catch);
        if (catchToken) {
            const errorVar = this.eatId();
            const body = this.declaration();
            catchStmt = new Stmt.CatchStmt(
                catchToken, errorVar, body
            );
        }

        this.jumpWhiteSpace();
        const finallyToken = this.eatOptional(TokenType.finally);
        if (finallyToken) {
            const body = this.declaration();
            finallyStmt = new Stmt.FinallyStmt(finallyToken, body);
        }

        return new Stmt.TryStmt(tryToken, body, catchStmt, finallyStmt);
    }

    private throwStmt(): Stmt.Throw {
        const throwToken = this.eat();
        const expr = this.expression();
        this.terminal();
        return new Stmt.Throw(throwToken, expr);
    }

    // TODO: Need Finish
    private drective(): Stmt.Drective {
        const drective = this.currentToken;
        const drectiveName = drective.content.toLowerCase();
        if (drectiveName === 'include' ||
            drectiveName === 'includeagain') {
            this.setCommandScanMode(true);
            this.advance();
            if (this.currentToken.type === TokenType.id) {
                const v = this.currentToken.content.toLowerCase();
                this.eat();
                if (v === 'a_linefile') {
                    const prefix = URI.parse(this.uri).fsPath
                    const includePath = this.eatOptional(TokenType.string);
                    if (includePath) this.includes.add(join(prefix, includePath.content));
                }
            }
            else {
                const includePath = this.eat();
                this.includes.add(includePath.content);
            }
            this.setCommandScanMode(false);
            this.terminal();
            return new Stmt.Drective(drective, new DelimitedList)
        }
        this.eat();
        const args = this.delimitedList(
            TokenType.comma,
            this.isExpressionStart,
            () => this.expression(),
            true
        );
        this.terminal();
        return new Stmt.Drective(drective, args)
    }

    private exprStmt(): Stmt.ExprStmt {
        const expr = this.expression();
        const delimiter = this.eatOptional(TokenType.comma);
        if (delimiter) {
            const trailer = this.tailorExpr(delimiter);
            return new Stmt.ExprStmt(expr, trailer)
        }

        return new Stmt.ExprStmt(expr)
    }

    // assignment statemnet
    private assignStmt(): Stmt.AssignStmt|Stmt.ExprStmt {
        // const isExprStart = this.isExpressionStart(this.currentToken);
        const left = this.factor();

        // `,`豁免检查是否是赋值表达式
        const delimiter = this.eatOptional(TokenType.comma);
        if (delimiter) {
            const trailer = this.tailorExpr(delimiter);
            this.terminal();
            return new Stmt.ExprStmt(left, trailer);
        }

        if (this.check(TokenType.equal)) {
            // if is a `=` let tokenizer take literal token(string)
            this.tokenizer.isLiteralToken = true;
            this.tokenizer.setLiteralDeref(false);
        }

        if (this.checkFromTo(TokenType.aassign, TokenType.lshifteq) ||
            this.matchTokens([TokenType.equal, TokenType.regeq])) {
            const assign = this.eat();
            const expr = this.expression();

            const delimiter = this.eatOptional(TokenType.comma);
            // If there are `,`
            if (delimiter) {
                const trailer = this.tailorExpr(delimiter);
                return new Stmt.AssignStmt(left, assign, expr, trailer);
            }

            this.terminal();
            return new Stmt.AssignStmt(left, assign, expr);
        }

        this.terminal();
        return new Stmt.ExprStmt(left);
    }

    private tailorExpr(delimiter: Token): Stmt.TrailerExprList {
        const exprList = this.expressionList();
        return new Stmt.TrailerExprList(
            delimiter,
            exprList
        );
    }

    // for test expression
    public testExpr(): Expr.Expr {
        this.tokens.pop();
        this.tokenizer.Reset();
        this.tokenizer.isParseHotkey = false;
        this.tokens.push(this.nextToken());
        return this.expression();
    }

    private isExpressionStart(token: Token): boolean {
        switch (token.type) {
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

            case TokenType.openParen:

            case TokenType.number:
            case TokenType.string:
            case TokenType.openBrace:
            case TokenType.openBracket:
            case TokenType.id:
            case TokenType.precent:
                return true;

            default:
                // TODO: Allow all keywords as identifier and warn this
                return isValidIdentifier(token.type);
        }
    }

    private expression(p: number = 0): Expr.Expr {
        // let tokenizer parse operators as normal
        // 让分词器不进行热键分词正常返回符号
        this.tokenizer.isParseHotkey = false;
        let result: Expr.Expr = this.UnaryExpressionOrHigher();

        // pratt parse
        while (true) {
            this.tokenizer.isParseHotkey = false;
            // infix left-associative 
            if ((this.currentToken.type >= TokenType.power &&
                this.currentToken.type <= TokenType.logicOr) &&
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
                    return new Expr.Unary(
                        saveToken,
                        result
                    );
                }
                const q = Precedences[saveToken.type];
                const right = this.expression(q + 1);
                result = new Expr.Binary(
                    result,
                    saveToken,
                    right
                );
                continue;
            }

            // postfix
            if ((this.currentToken.type >= TokenType.pplus &&
                this.currentToken.type <= TokenType.mminus) &&
                Precedences[this.currentToken.type] >= p) {
                const saveToken = this.currentToken;
                this.advance();
                result = new Expr.Unary(
                    saveToken,
                    result
                )
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
                    const colon = this.eatType(TokenType.colon);
                    // right-associative 
                    const falseExpr = this.expression(q);
                    result = new Expr.Ternary(
                        result,
                        saveToken,
                        trueExpr,
                        colon,
                        falseExpr
                    );
                }
                // other assignments
                else {
                    // right-associative 
                    const right = this.expression(q);
                    result = new Expr.Binary(
                        result,
                        saveToken,
                        right
                    );
                }
                continue;
            }

            // Implicit connect
            if ((this.currentToken.type >= TokenType.string &&
                this.currentToken.type <= TokenType.precent) &&
                Precedences[TokenType.sconnect] >= p) {
                const right = this.expression(Precedences[TokenType.sconnect] + 1);
                result = new Expr.Binary(
                    result,
                    new Token(TokenType.implconn, ' ',
                        result.end,
                        right.start),
                    right
                );
                continue;
            }

            break;
        }
        this.tokenizer.isParseHotkey = true;
        return result;
    }

    private UnaryExpressionOrHigher(): Expr.Expr {
        do {
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
                    return new Expr.Unary(saveToken, expr);
                case TokenType.openParen:
                    let OPar = this.eat();
                    const mid = this.expression();
                    let CPar = this.eatType(TokenType.closeParen);
                    return new Expr.ParenExpr(OPar, mid, CPar);
                case TokenType.number:
                case TokenType.string:
                case TokenType.openBrace:
                case TokenType.openBracket:
                case TokenType.id:
                case TokenType.precent:
                    // TODO: process array, dict, and precent expression
                    return this.factor();
                case TokenType.EOL:
                    // v2 allows skip all EOL in expression
                    // v2 能够允许在表达式里面完全忽略换行
                    // 允许在运算符后忽略换行
                    if (this.v2mode && this.isPossibleBinaryOperator(this.peek().type)) {
                        this.eatType(TokenType.EOL);
                        continue;
                        // if nothing is matched, let it leak to default
                    }
                default:
                    // TODO: Allow all keywords as identifier and warn this
                    if (isValidIdentifier(this.currentToken.type)) {
                        return this.factor();
                    }
                    return new Expr.Invalid(this.currentToken.start, [this.currentToken]);
            }
        } while (true);
    }

    /**
     * If token type is operator that can discard EOL.
     * @param t tokentype
     */
    private isPossibleBinaryOperator(t: TokenType) {
        // ++ and -- is pure unary operator in autohotkey,
        // so EOL can not be discard for them.
        return (TokenType.power <= t && t <= TokenType.isKeyword) ||
               (TokenType.notKeyword <= t && t <= TokenType.logicRshiftEq);
    }

    private factor(): Expr.Factor {
        const suffixTerm = this.suffixTerm();
        // const factor = new Expr.Factor(suffixTerm.value);
        const dot = this.eatOptional(TokenType.dot);

        // if factor has a suffix
        if (dot) {
            const tailor = this.delimitedList(
                TokenType.dot,
                token => isValidIdentifier(token.type),
                () => this.suffixTerm(true)
            )

            return new Expr.Factor(
                suffixTerm,
                new SuffixTerm.SuffixTrailer(dot, tailor)
            );
        }

        return new Expr.Factor(suffixTerm);
    }

    private suffixTerm(isTailor: boolean = false): SuffixTerm.SuffixTerm {
        const atom = this.atom(isTailor);
        const isValid = !(atom instanceof SuffixTerm.Invalid);
        
        if (isValid) {
            const trailers = this.suffixTermTailor();
            return new SuffixTerm.SuffixTerm(atom, trailers);
        }
        return new SuffixTerm.SuffixTerm(atom, []);
    }

    private suffixTermTailor(): SuffixTermTrailer[] {
        const trailers: SuffixTermTrailer[] = [];
        // parse all exist trailor  
        while (true) {
            if (this.currentToken.type === TokenType.openBracket) {
                const bracket = this.arrayTerm();
                trailers.push(bracket);
            }
            else if (this.currentToken.type === TokenType.openParen) {
                const callTrailer = this.funcCallTrailer();
                trailers.push(callTrailer);
            }
            else
                break;
        }
        return trailers;
    }

    private atom(isTailor: boolean = false): Atom {
        switch (this.currentToken.type) {
            // TODO: All keywords is allowed in suffix.
            // But not allowed at first atom
            case TokenType.id:
                this.advance();
                return new SuffixTerm.Identifier(this.previous());
            case TokenType.number:
            case TokenType.string:
                let t = this.eat();
                return new SuffixTerm.Literal(t);
            case TokenType.precent:
                const open = this.eat();
                const derefAtom = this.eatId();
                const close = this.eatType(TokenType.precent);
                return new SuffixTerm.PercentDereference(
                    open, close, derefAtom
                );
            case TokenType.openBracket:
                return this.arrayTerm();
            case TokenType.openBrace:
                return this.associativeArray();
            default:
                // TODO: Allow all keywords here, and warn this
                const id = this.eatId();
                if (id instanceof MissingToken) {
                    return new SuffixTerm.Invalid(id);
                }
                return new SuffixTerm.Identifier(id);
                
        }
    }

    private arrayTerm(): SuffixTerm.ArrayTerm {
        const open = this.eat();
        const items = this.expressionList();
        const close = this.eatType(TokenType.closeBracket, true);

        return new SuffixTerm.ArrayTerm(open, close, items);
    }

    private associativeArray(): SuffixTerm.AssociativeArray {
        const open = this.eat();
        const pairs = this.delimitedList(
            TokenType.comma,
            this.isExpressionStart,
            () => this.pair()
        )
        const close = this.eatType(TokenType.closeBrace, true);

        return new SuffixTerm.AssociativeArray(open, close, pairs);
    }

    private pair(): SuffixTerm.Pair {
        const key = this.expression();
        const colon = this.eatType(TokenType.colon);
        const value = this.expression();
        return new SuffixTerm.Pair(key, colon, value);
    }

    private funcCallTrailer(): SuffixTerm.Call {
        const open = this.eat();
        // TODO: 想个更好的办法来处理空参数
        const args = this.delimitedList(
            TokenType.comma,
            this.isExpressionStart,
            () => this.expression(),
            true
        );
        const close = this.eatType(TokenType.closeParen, true);
        return new SuffixTerm.Call(open, args, close);
    }

    // private emptyArg(): Expr.Expr {
    //     return new Expr.Factor(
    //         new SuffixTerm.SuffixTerm(
    //             new SuffixTerm.Literal(new Token(
    //                 TokenType.string, '',
    //                 Position.create(-1, -1),
    //                 Position.create(-1, -1)
    //             )), []
    //         )
    //     );
    // }

    /**
     * Parse all condition related to Function statements
     */
    private func(): Stmt.ExprStmt|Decl.FuncDef {
        let token = this.eat();
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

    private funcDefine(name: Token): Decl.FuncDef {
        let parameters = this.parameters(TokenType.closeParen);
        let block = this.block();
        return new Decl.FuncDef(
            name,
            parameters,
            block
        )
    }

    /**
     * Parse a function call statement,
     * also parse statement with ',' expression trailer
     * @param name Name token of a function call
     */
    private funcCall(name: Token): Stmt.ExprStmt {
        const call = this.suffixTermTailor();
        
        const callFactor = new Expr.Factor(
            new SuffixTerm.SuffixTerm(
                new SuffixTerm.Identifier(name),
                call
            )
        );

        const delimiter = this.eatOptional(TokenType.comma);
        // If there are `,`
        if (delimiter) {
            const trailer = this.tailorExpr(delimiter);
            this.terminal();

            return new Stmt.ExprStmt(callFactor, trailer);
        }

        this.terminal();
        return new Stmt.ExprStmt(callFactor);
    }

    private parameters(closeTokenType: TokenType): Decl.Param {
        const open = this.eat();
        const requiredParameters: Decl.Parameter[] = [];
        const optionalParameters: Array<Decl.DefaultParam|Decl.SpreadParameter> = [];
        let isDefaultParam = false;
        const allParameters = this.delimitedList(
            TokenType.comma,
            token => isValidIdentifier(token.type) || token.type === TokenType.and,
            () => {
                // v2 use `&` instead of `byref` keyword
                const byref = this.eatOptional(this.v2mode ? TokenType.and : TokenType.byref);
                if (isDefaultParam) {
                    const param = this.optionalParameter(byref);
                    optionalParameters.push(param);
                    return param;
                }
                const p = this.peek();
                // check if it is a default parameter
                if (p.type === TokenType.aassign || p.type === TokenType.equal) {
                    isDefaultParam = true;
                    const param = this.optionalParameter(byref);
                    optionalParameters.push(param);
                    return param;
                }
                if (p.type === TokenType.multi) {
                    isDefaultParam = true;
                    const param = this.optionalParameter(byref, true);
                    optionalParameters.push(param);
                    return param;
                }
                const param = this.requiredParameter(byref);
                requiredParameters.push(param);
                return param;
            }
        )

        const close = this.eatType(closeTokenType, true);
        return new Decl.Param(
            open,
            allParameters,
            requiredParameters,
            optionalParameters,
            close
        );
    }

    private requiredParameter(byref?: Token):  Decl.Parameter {
        const name = this.eatType(TokenType.id);
        return new Decl.Parameter(name, byref);
    }

    /**
     * Parse default parameter of function
     * @param isExtend if parameter is array extend parameter
     */
    private optionalParameter(byref?: Token, isExtend: Boolean = false):  Decl.DefaultParam|Decl.SpreadParameter {
        const name = this.eatType(TokenType.id);

        // if is parameter*
        if (isExtend || this.currentToken.type === TokenType.multi) {
            const star = this.eat();
            return new Decl.SpreadParameter(name, byref, star);
        }

        const assign = this.eatTypes(
            TokenType.aassign,
            TokenType.equal
        );
        const dflt = this.expression();
        return new Decl.DefaultParam(name, byref, assign, dflt);
    }

    private command(): Stmt.Stmt {
        this.setCommandScanMode(true);
        const cmd = this.eat();
        // FIXME: 
        const delimiter = this.eatOptional(TokenType.comma);
        
        const args = this.delimitedList(
            TokenType.comma,
            this.isExpressionStart,
            () => {
                // Reset deref % expresion mark for every parameter
                this.tokenizer.setLiteralDeref(false);
                return this.expression();
            },
            true
        )

        this.setCommandScanMode(false);
        this.terminal();

        return new Stmt.CommandCall(cmd, args);
    }

    /**
     * Check the the statement is terminated
     * @param failed failed constructor context
     */
    private terminal() {
        if (this.currentToken.type !== TokenType.EOF)
            this.eatType(TokenType.EOL);
    }

    /**
     * backwards tokens
     * @param pos position to
     */
    private backto(pos: number) {
        this.pos = pos;
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

    /**
     * Retrieve the current token, and check if it's TokenType is between t1 and t2.
     * @param t1 Start TokenType
     * @param t2 End TokenType
     * @returns boolean
     */
    private checkFromTo(t1: TokenType, t2: TokenType): boolean {
        return this.currentToken.type >= t1 && this.currentToken.type <= t2;
    }

    /**
     * Retrieve the current token and custom it.
     * Used for token which type is checked
     * 
     * @returns Token
     */
    private eat(): Token {
        this.advance();
        return this.previous();
    }

    /**
     * Retrieve the current token, and check that it's of the TokenType.
     * If so, advance and return the token. Otherwise return a MissingToken for
     * the expected token.
     * 
     * @param t token type
     * @returns Token
     */
    private eatType(t: TokenType, skipEOL = false): Token {
        if (this.currentToken.type === TokenType.EOL && this.v2mode && skipEOL) {
            const p = this.peek();
            if (p.type === t) 
                this.advance();
        }
        if (this.currentToken.type === t) {
            this.advance();
            return this.previous();
        }
        return new MissingToken(t, this.currentToken.start);
    }

    /**
     * Retrieve the current token, and check that it's of the TokenType.
     * If so, advance and return the token. Otherwise return a MissingToken for
     * the expected token.
     * 
     * Used for checking mutli-types
     * 
     * @param t token type
     * @returns Token
     */
    private eatTypes(...ts: TokenType[]): Token {
        if (this.matchTokens(ts)) {
            this.advance();
            return this.previous();
        }
        return new MissingToken(ts[0], this.currentToken.start);
    }

    private eatId(): Token {
        if (isValidIdentifier(this.currentToken.type)) 
            return this.eat();
        return new MissingToken(TokenType.id, this.currentToken.start);
    }

    private eatOptional(t: TokenType): Maybe<Token> {
        if (this.currentToken.type === t) {
            this.advance();
            return this.previous();
        }
        return undefined;
    }

    private eatOptionals(...ts: TokenType[]): Maybe<Token> {
        if (this.matchTokens(ts)) {
            this.advance();
            return this.previous();
        }
        return undefined;
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

    private isDefauleCase(): boolean {
        if (this.currentToken.type === TokenType.id && this.currentToken.content.toLowerCase() === 'default') {
            const p = this.peek();
            return p.content === ':' && 
                   p.start.line === this.currentToken.end.line &&
                   p.start.character === this.currentToken.end.character;
        }
        return false;
    }
}