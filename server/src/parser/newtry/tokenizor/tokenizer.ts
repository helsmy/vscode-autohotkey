import {
    Token,
    ITokenMap,
} from "../types";

import { TokenType } from "./tokenTypes"
import { Position, Range } from 'vscode-languageserver';
import { TakeComment, TakeDiagnostic, TakeMultiToken, TakeToken, TokenKind, TokenResult } from './types';

export class Tokenizer {
    /**
     * character position of full document
     */
    private pos: number = 0;
    private document: string;
    public isLiteralToken: boolean = false;
    private isLiteralDeref: boolean = false;
    /**
     * content of current character
     */
    private currChar: string;
    /**
     * line of current character
     */
    private line: number = 0;
    /**
     * character position of line
     */
    private chr: number = 0;
    private EscapeChar = '"';
    public isParseHotkey: boolean = false;

    constructor(document: string) {
        this.document = document;
        this.currChar = document[this.pos];
    }

    public setLiteralDeref(bool: boolean) {
        this.isLiteralDeref = bool;
    }

    private Advance() {
        this.pos++;
        this.chr++;
        if (this.pos >= this.document.length) {
            this.currChar = "EOF";
        } else {
            this.currChar = this.document[this.pos];
        }
        return this;
    }

    private AdvanceLine() {
        this.Advance();
        this.chr = 0;
        this.line++;
    }

    /**
     * Peek Character
     * @param len Peek n position
     * @param skipWhite Skip WhiteSpace(\s\t) before character of not
     * @returns Peek Character
     */
    public Peek(len: number = 1, skipWhite: boolean = false): string {
        if (this.pos+len >= this.document.length) {
            return "EOF";
        }
        if (skipWhite) {
            if (!this.isWhiteSpace(this.currChar)) {
                return this.document[this.pos+len];
            }
            let char = this.currChar;
            let pos = this.pos;
            do {
                char = this.document[pos];
                pos++;
            } while(this.isWhiteSpace(char))
            if (pos >= this.document.length) return "EOF";
            // If we need skip whitespace then we only need peek 1 char
            // So just return char we found
            return char;
        }
        return this.document[this.pos + len];
    }

    private BackPeek(backstartlen: number = 1, skipWhite: boolean = false): string {
        let pos = this.pos - backstartlen;
        if (pos === 0) return "\n";
        if (skipWhite) {
            let nwp = 1;
            while (this.document[pos - nwp] && this.document[pos - nwp].trim().length === 0) {
                ++nwp;
            }
            if (pos - nwp <= 0) {
                return "\n"
            }
            return this.document[pos - nwp];
        }
        return this.document[pos];
    }

    private SkipWhiteSpace() {
        while (this.currChar === ' ' ||
            this.currChar === '\t' ||
            this.currChar === '\r')
            this.Advance();
    }

    private BlockComment(): TakeComment {
        const offset = this.pos;
        const p = this.genPosition();
        this.Advance().Advance();
        while (this.currChar !== 'EOF' &&
            !this.matchWord('*/')) {
            if (this.currChar === '\n') {
                this.AdvanceLine();
                continue;
            }
            this.Advance();
        }
        this.Advance().Advance();
        const s = this.document.slice(offset, this.pos);
        // collect comments
        return this.CreateComment(TokenType.blockComment, s, p, this.genPosition());
    }

    private LineComment(): TakeComment {
        const offset = this.pos;
        const p = this.genPosition();
        this.Advance();
        while (this.currChar !== 'EOF' &&
            this.currChar !== '\n') {
            this.Advance();
        }
        const s = this.document.slice(offset, this.pos);
        // collect comments
        return this.CreateComment(TokenType.lineComment, s, p, this.genPosition());
    }

    /**
     * Return current character position
     */
    private genPosition(): Position {
        return Position.create(this.line, this.chr);
    }

    private NumberAdvance() {
        while (this.isDigit(this.currChar)) {
            this.Advance();
        }
    }

    private HexNumberAdvance() {
        while (this.isHexNumber(this.currChar)) {
            this.Advance()
        }
    }

    private GetNumber(): TokenResult {
        const offset = this.pos;
        let p = this.genPosition();
        // Hex
        if (this.currChar === '0' && this.Peek().toLowerCase() === 'x') {
            this.Advance().Advance();
            this.HexNumberAdvance();
            const sNum = this.document.slice(offset, this.pos);
            return this.CreateToken(TokenType.number, sNum, p, this.genPosition());
        }
        // Point number
        this.NumberAdvance();
        if (this.currChar === '.') {
            this.Advance();
            this.NumberAdvance();
        }
        // Scientific notation
        if (this.currChar === 'e' || this.currChar === 'E') {
            this.Advance();
            this.NumberAdvance();
        }
        const sNum = this.document.slice(offset, this.pos);
        return this.CreateToken(TokenType.number, sNum, p, this.genPosition());
    }

    /**
     * If is a Escaped "
     */
    private IsEscapeChar(): boolean {
        if (this.Peek() === '"') {
            this.Advance();
            return true;
        }
        return false;
    }

    /**
     * if current character is end of line
     * return the length of CR character,
     * else return 0
     */
    private IsEOLAndLength(): number {
        if (this.currChar === '\n')
            return 1;
        if (this.currChar === '\r')
            return this.Peek() === '\n' ? 2 : 1;
        return 0;
    }

    private IsEOF(): boolean {
        return this.currChar === 'EOF';
    }

    private IsEndOfMutliString(): boolean {
        if (this.currChar === ')' 
            && this.Peek() === '"'
            && this.Peek(2) !== '"') {
            return true;
        }
        return false;
    }

    private GetString(): TokenResult {
        let offset = this.pos;
        let p = this.genPosition();
        this.Advance();

        // Check if is multiline string
        if (this.IsMultiString())
            return this.GetMultiString(p, offset);
        
        while (this.currChar !== '"' || this.IsEscapeChar()) {
            if (this.currChar === 'EOF' || this.currChar === '\n' || this.currChar === '\r') {
                return this.CreateError(
                    this.document.slice(offset + 1, this.pos),
                    p, this.genPosition()
                );
            }
            this.Advance();
        }
        const str = this.document.slice(offset + 1, this.pos);
        this.Advance();
        return this.CreateToken(TokenType.string, str, p, this.genPosition());
    }

    /**
     * Return if current is start of multiline string. 
     * Pattern `" EOL [\s\t]* (`
     */
    private IsMultiString(): boolean {
        const EOLLength = this.IsEOLAndLength();
        if (!EOLLength) return false;

        const offset = this.pos;
        const p = this.genPosition();
        for (let i = 0; i < EOLLength; i++) {
            this.Advance();
        }
        const peekChar = this.Peek(1, true);

        if (peekChar === '(') {
            // 为了多行的开始部分的换行
            // 把行数加一
            this.AdvanceLine();
            return true;
        }
        // no match backwards
        this.pos = offset;
        this.currChar = this.document[offset];
        this.line = p.line;
        this.chr = p.character;
        return false;
    }

    private GetMultiString(position: Position, offset: number): TokenResult {
        // if we are counter a multiline string, 
        // the start part is checked, just custom all them
        if (this.isWhiteSpace(this.currChar))
            this.SkipWhiteSpace();
        this.Advance();
        
        while (!this.IsEndOfMutliString()) {
            if (this.IsEOF()) {
                return this.CreateError(
                    this.document.slice(offset + 1, this.pos),
                    position, this.genPosition()
                );
            }
            if (this.IsEOLAndLength()) {
                this.AdvanceLine();
            }
            this.Advance();
        }

        const str = this.document.slice(offset + 1, this.pos);
        this.Advance();
        return this.CreateToken(TokenType.string, str, position, this.genPosition());
    }

    private GetId(preType: TokenType): TakeToken|TakeMultiToken {
        let offset = this.pos;
        let p = this.genPosition();
        this.Advance();
        while (this.isAlphaNumeric(this.currChar) && this.currChar !== "EOF")
            this.Advance();
        const value = this.document.slice(offset, this.pos);
        const keyword = RESERVED_KEYWORDS.get(value.toLowerCase());
        if (keyword) {
            return this.CreateToken(keyword, value, p, this.genPosition());
        }
        // if (preType === TokenType.EOL && this.currChar === ':') {
        //     const pchar = this.Peek(1, true); 
        //     if (this.isWhiteSpace(pchar) || pchar === '\n' || pchar === 'EOF') {
        //         this.Advance();
        //         return this.CreateToken(TokenType.label, value, p, this.genPosition());
        //     }
        //     // only store the name of label
        // }

        // A id token confirmed, check if it is a command start
        if (preType === TokenType.EOL &&
            COMMAND_TEST.has(value.toLowerCase())) {
            return this.GetCommand(p, value);
        }
        return this.CreateToken(TokenType.id, value, p, this.genPosition());
    }

    private GetCommand(start: Position, cmd: string): TakeToken|TakeMultiToken {
        const offset = this.pos;
        const end = this.genPosition();
        // If this is a call
        if (this.currChar === '(') 
            return this.CreateToken(TokenType.id, cmd, start, end);
        if (this.isWhiteSpace(this.currChar))
            this.SkipWhiteSpace();
        if (this.ischars(this.currChar, '~','<','>','!',':','+','-','*','/','.','|','&','^')) {
            const mark = this.GetMark();
            // If is an assign rather than Command
            if (
                mark.kind === TokenKind.Token && (
                    (mark.result.type >= TokenType.pluseq &&
                    mark.result.type <= TokenType.lshifteq) ||
                    mark.result.type === TokenType.regeq ||
                    mark.result.type === TokenType.aassign ||
                    mark.result.type === TokenType.equal
                )
            ) {
                const id = this.CreateToken(TokenType.id, cmd, start, end);
                return {
                    result: [
                        id.result,
                        mark.result
                    ],
                    kind: TokenKind.Multi
                }
            }

            // Not assign then backwards
            this.BackTo(offset);
            // set command scan start flag
            this.isLiteralToken = true;
            return this.CreateToken(TokenType.command, cmd, start, end);
        }
        // set command scan start flag
        this.isLiteralToken = true;
        return this.CreateToken(TokenType.command, cmd, start, end);
    }

    /**
     * If # is a Drective return drective,
     * else return key token '#' 
     */
    private GetDrectivesOrSharp(): TokenResult {
        const start = this.pos;
        const p = this.genPosition();
        const pospre = Position.create(this.line, this.chr - 1);
        while (this.isAscii(this.currChar) && this.currChar !== "EOF")
            this.Advance();
        const d = this.document.slice(start, this.pos);
        if (DRECTIVE_TEST.has(d.toLowerCase()))
            return this.CreateToken(TokenType.drective, d, p, this.genPosition());
        // if not drective, store the id token for next
        this.BackTo(start + 1);
        return this.CreateError("#", pospre, p);
    }

    private GetMark(): TokenResult {
        let currstr = this.currChar;
        let p = this.genPosition();
        const p1 = currstr + this.Peek();
        const p2 = p1 + this.Peek(2);
        let mark = OTHER_MARK.get(p2);
        if (mark !== undefined) {
            // 3-char token
            this.Advance().Advance().Advance();
            return this.CreateToken(mark, p2, p, this.genPosition());
        }
        mark = OTHER_MARK.get(p1);
        if (mark !== undefined) {
            // 2-char token
            this.Advance().Advance();
            currstr += this.currChar;
            return this.CreateToken(mark, p1, p, this.genPosition());
        }
        mark = OTHER_MARK.get(currstr);
        if (mark !== undefined) {
            // 1-char token
            this.Advance();
            return this.CreateToken(mark, currstr, p, this.genPosition());
        }
        this.Advance();
        return this.CreateError(currstr, p, this.genPosition());
    }

    private LiteralToken(): TokenResult {
        let start = this.pos;
        let p = this.genPosition();
        while (this.Peek() !== ',' 
            && this.Peek() !== '%' 
            && this.Peek() !== '\n'
            && this.currChar !== "EOF") {
            this.Advance();
        }
        this.Advance();
        let end = this.pos;
        const value = this.document.slice(start, this.pos).trim();
        return this.CreateToken(TokenType.string, value, p, this.genPosition());
    }

    private getHotString(): TokenResult {
        const offset = this.pos;
        const p = this.genPosition();
        while (!(this.currChar === ':') &&
               !(this.currChar === '\n') &&
               !(this.Peek() === ':') &&
               this.currChar !== 'EOF') {
            this.Advance();
        }
        // take RAW_STRING:: as a whole token
        // eg. {content: "abcde::"}
        // addtional 2 advancement for "::"
        this.Advance().Advance().Advance();
        if (offset === this.pos) 
            return this.CreateError('', p, this.genPosition());
        const content = this.document.slice(offset, this.pos);
        return this.CreateToken(TokenType.hotstringEnd, content, p, this.genPosition());
    }

    private getExpendString(): TokenResult {
        if (this.isWhiteSpace(this.currChar)) {
            this.SkipWhiteSpace();
        }
        const offset = this.pos;
        // FIXME: "/r" and "/r/n" return line
        if (this.currChar === '\n') {
            // check  multi-line expend
            if (this.Peek() === '(') {
                this.Advance();
                return this.getLiteralString();
            }
            // if not multi-line expend return eol
            const p = this.genPosition();
            this.Advance();
            return this.CreateToken(TokenType.EOL, '\n', p, this.genPosition());
        }
        
        const p = this.genPosition();
        while (this.currChar !== '\n' && this.currChar !== 'EOF') {
            this.Advance();
        }
        const content = this.document.slice(offset, this.pos);
        return this.CreateToken(TokenType.string, content, p, this.genPosition());
    }

    private getLiteralString() : TokenResult {
        const p = this.genPosition();
        const offset = this.pos;
        this.Advance();
        while (this.Peek() !== ')' && this.currChar !== 'EOF') {
            this.Advance();
        }
        this.Advance();
        const content = this.document.slice(offset, this.pos);
        return this.CreateToken(TokenType.string, content, p, this.genPosition());
    }

    public GetNextToken(preType: TokenType = TokenType.EOL): TokenResult {
        while (this.currChar !== "EOF") {
            let p = this.genPosition();
            if (preType === TokenType.hotstringOpen) {
                return this.getHotString();
            }
            if (preType === TokenType.hotstringEnd) {
                return this.getExpendString();
            }
            
            // For Command
            if (this.isLiteralToken) {
                switch (this.currChar) {
                    case ' ':
                    case '\t':
                    case '\r':
                        // skip
                        this.SkipWhiteSpace();
                        continue;
                    case '%':
                        // If next character is a space, 
                        if (this.Peek() === ' ') {
                            this.isLiteralDeref = true;
                            this.Advance();
                            break;
                        }
                        this.Advance();
                        // TODO: AHK allows number as identifier to be derefered
                        // This is for get cli parameter
                        let token = this.GetId(TokenType.precent);
                        // FIXME: check close % of %% dereference
                        this.Advance();
                        return token;
                    case ',':
                        // this.isLiteralDeref = false;
                        this.Advance();
                        return this.CreateToken(TokenType.comma, ',', p, this.genPosition());
                    case '\n':
                        // `=` `\n` `(...)` multiline string
                        if (this.BackPeek(1, true) === '=' && this.Peek(1, true) === '(') {
                            return this.getLiteralString();
                        }
                        // Generate a empty string token
                        // 给换行的字符串token产生一个空字符串
                        // 为了`var=\n`产生空占位符
                        this.isLiteralToken = false;
                        if (preType === TokenType.equal ||
                            preType === TokenType.comma)
                            return this.CreateToken(TokenType.string, '', p, p);
                        else
                            continue;
                    default:
                        // is deref 
                        if (this.isLiteralDeref) break;
                        return this.LiteralToken();

                }
            }

            if (this.ischars(this.currChar ,' ', '\t', '\r')) {
                this.SkipWhiteSpace();
                continue;
            }
            if (this.currChar === '\n') {
                this.AdvanceLine();
                return this.returnSkipEmptyLine(p);
            }

            const checkHotkeyResult = preType === TokenType.EOL && this.CheckHotkey();
            if (checkHotkeyResult) {
                const hotkeytypemap = [
                    TokenType.hotkeyModifer,
                    TokenType.key,
                    TokenType.hotkeyand,
                    TokenType.key,
                    TokenType.hotkeyModifer,
                    TokenType.hotkey,
                ];
                // Remove first whole match result
                const tokens = checkHotkeyResult.slice(1).map(
                    (e, i) => {
                        if (e === undefined) return;
                        const t = hotkeytypemap[i];
                        const p = this.genPosition();
                        // if is ` & ` ,  3 step advance is all we need
                        let step = ((t !== TokenType.hotkeyand) ? e.length : 3);
                        while (step--) this.Advance();
                        const c = t !== TokenType.hotkeyand ? e : ' & '; 
                        return new Token(hotkeytypemap[i], c, p, this.genPosition());
                    }
                ).filter(t => t !== undefined) as Token[];
                return {
                    result: tokens,
                    kind: TokenKind.Multi
                }
            }

            if (this.isDigit(this.currChar)) {
                return this.GetNumber();
            }

            if (this.isAlpha(this.currChar)) {
                return this.GetId(preType);
            }
            
            switch (this.currChar) {
                case '.':
                    if (this.isDigit(this.Peek())) {
                        return this.GetNumber();
                    }
                    else {
                        if (this.isWhiteSpace(this.Peek()) && this.isWhiteSpace(this.BackPeek())) {
                            this.Advance();
                            return this.CreateToken(TokenType.sconnect, " . ", p, this.genPosition());
                        }
                        else if (this.Peek() === '=') {
                            this.Advance().Advance();
                            return this.CreateToken(TokenType.sconneq, ".=", p, this.genPosition())
                        }
                        this.Advance();
                        return this.CreateToken(TokenType.dot, ".", p, this.genPosition());
                    }
                case '"':
                    return this.GetString();
                case "#":
                    this.Advance();
                    return this.GetDrectivesOrSharp();
                case '/':
                    if (this.Peek() === '*') {
                        return this.BlockComment();
                    }
                    this.Advance();
                    if (this.currChar === '/') {
                        this.Advance();
                        return this.CreateToken(TokenType.fdiv, '//', p, this.genPosition());
                    }
                    return this.CreateToken(TokenType.div, '/', p, this.genPosition());
                case ';':
                    return this.LineComment();
                case '&':
                    this.Advance();
                    return this.CreateToken(TokenType.and, "&", p, this.genPosition());
                case ':':
                    // check if hotstring
                    // ahk的破烂语法真难解析
                    if (preType === TokenType.EOL &&
                        this.isParseHotkey) {
                        return this.CheckHotString();
                    }

                    const pchar = this.Peek();
                    if (pchar === '=') {
                        this.Advance().Advance();
                        return this.CreateToken(TokenType.aassign, ':=', p, this.genPosition());
                    } 
                    this.Advance();
                    return this.CreateToken(TokenType.colon, ':', p, this.genPosition());
                default:
                        // last check if current char is a mark,
                        // if not return a unknown token in the function
                        return this.GetMark();
            }
        }
        return this.CreateToken(TokenType.EOF, "EOF", this.genPosition(), this.genPosition());
    }

    public *GenToken(): Generator<Exclude<TokenResult, TakeMultiToken>, never, unknown> {
        let preType = TokenType.EOL;
        while (true) {
            const tokenResult = this.GetNextToken(preType);
            switch (tokenResult.kind) {
                case TokenKind.Commnet:
                case TokenKind.Diagnostic:
                case TokenKind.Token:
                    yield tokenResult;
                    if (tokenResult.kind === TokenKind.Token)
                        preType = tokenResult.result.type
                    break;
                case TokenKind.Multi:
                    for (const token of tokenResult.result) 
                        yield {
                            result: token,
                            kind: TokenKind.Token
                        };
                    preType = tokenResult.result[tokenResult.result.length - 1].type;
                    break;
            }
        }
    }

    private CheckHotString(): TokenResult {
        const p = this.genPosition();
        const offset = this.pos;
        this.Advance();
        
        // 6 char is enough for hotstring, I think
        for (let i = 0; i < 6; i++) {
            if (this.currChar === ':') {
                this.Advance();
                const content = this.document.slice(offset, this.pos);
                return this.CreateToken(
                    TokenType.hotstringOpen, 
                    content, p, this.genPosition()
                );
            }
            // take any number for k option
            if (this.currChar.toLowerCase() === 'k') {
                // :k-1:
                if (this.currChar === '-') this.Advance();
                this.NumberAdvance();
            }
            this.Advance();
        } 
        // take as a ':' key
        this.BackTo(offset + 1);
        return this.CreateToken(TokenType.colon, ':', p, this.genPosition());
    }

    /**
     * Check if current line is possible to be a hotkey define line
     */ 
    private CheckHotkey() {
        const testStr = this.document.slice(this.pos, this.pos + MAX_HOTKEY_LENGTH);
        return  HOTKEY_TEST.exec(testStr);
    }

    private matchWord(s: string): boolean {
        let w = this.document.slice(this.pos, this.pos + s.length);
        return w === s;
    }

    private BackTo(offset: number) {
        const delta = this.pos - offset;
        this.pos = offset;
        this.chr -= delta;
        this.currChar = this.document[offset];
    }

    private CreateToken(t: TokenType, c: string, start: Position, end: Position): TakeToken {
        return {
            result: new Token(t, c, start, end),
            kind: TokenKind.Token
        };
    }

    private CreateError(c: string, start: Position, end: Position): TakeDiagnostic {
        return {
            result: {
                content: c,
                range: Range.create(start, end)
            },
            kind: TokenKind.Diagnostic
        };
    }

    private CreateComment(t: TokenType, c: string, start: Position, end: Position): TakeComment {
        return {
            result: new Token(t, c, start, end),
            kind: TokenKind.Commnet
        };
    }

    private isDigit(s: string): boolean {
        return s >= '0' && s <= '9';
    }

    private isHexNumber(s: string): boolean {
        return s !== 'EOF' && (this.isDigit(s) || (s >= 'a' && s <= 'f') || (s >= 'A' && s <= 'F'))
    }

    private isAlpha(s: string): boolean {
        return this.isAscii(s) || s === '_' || identifierTest.test(s);
    }

    private isAlphaNumeric(s: string): boolean {
        return this.isAlpha(s) || this.isDigit(s);
    }

    private isAscii(s: string): boolean {
        return (s >= 'A' && s <= 'Z') || (s >= 'a' && s <= 'z');
    }

    private isWhiteSpace(s: string): boolean {
        return s === ' ' || s === '\t'
    }

    private isMark(s: string): boolean {
        return (s >= '!' && s <= '~') && !this.isAscii(s) && !this.isDigit(s);
    }

    private ischars(c: string ,...chars: string[]): boolean {
        for (const char of chars) {
            if (char === c)
                return true;
        }
        return false;
    }

    /**
     * skip empty line and return first '\n' token
     * @param p start position
     */
    private returnSkipEmptyLine(p: Position): TokenResult {
        const t = this.CreateToken(TokenType.EOL, "\n", p, this.genPosition());
        this.SkipWhiteSpace();
        // skip empty line
        while (this.currChar === '\n') {
            this.AdvanceLine();
            if (this.isWhiteSpace(this.currChar))
                this.SkipWhiteSpace();
        }
        // skip whitespace at begin
        if (this.isWhiteSpace(this.currChar)) {
            this.SkipWhiteSpace();
        }
        // check if is drective
        // if (this.currChar === '#') {
        //     this.Advance();
        //     return this.GetDrectivesOrSharp();
        // }
        if (this.currChar === '/' && this.Peek() === '*') {
            this.BlockComment()
            return t;
        }
        return t;
    }
    /**
     * reset tokenizer for new loop
     * @param document optional string to split
     */
    Reset(document?: string): void {
        this.pos = -1;
        this.line = 1;
        this.chr = 0;
        if (document) {
            this.document = document;
        }
        this.Advance();
    }
}

// Max length to find '::' token
const MAX_HOTKEY_LENGTH = 40;

// defines unicode range of all language letters
const identifierTest = new RegExp(
    '^[\u0041-\u005A\u0061-\u007A\u00AA\u00B5\u00BA\u00C0-' +
    '\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-' +
    '\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-' +
    '\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-' +
    '\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559' +
    '\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A' +
    '\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE' +
    '\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-' +
    '\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-' +
    '\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-' +
    '\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-' +
    '\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-' +
    '\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE' +
    '\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A' +
    '\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33' +
    '\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-' +
    '\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-' +
    '\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0' +
    '\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-' +
    '\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D' +
    '\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90' +
    '\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3' +
    '\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C' +
    '\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39' +
    '\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-' +
    '\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD' +
    '\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-' +
    '\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-' +
    '\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD' +
    '\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46' +
    '\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-' +
    '\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA' +
    '\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4' +
    '\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C' +
    '\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-' +
    '\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081' +
    '\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-' +
    '\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D' +
    '\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5' +
    '\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-' +
    '\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-' +
    '\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-' +
    '\u16EA\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-' +
    '\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7' +
    '\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5' +
    '\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB' +
    '\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-' +
    '\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-' +
    '\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-' +
    '\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-' +
    '\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-' +
    '\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4' +
    '\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-' +
    '\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-' +
    '\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-' +
    '\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-' +
    '\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E' +
    '\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4' +
    '\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D' +
    '\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-' +
    '\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-' +
    '\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006' +
    '\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F' +
    '\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E' +
    '\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC' +
    '\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F' +
    '\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6E5' +
    '\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793' +
    '\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A' +
    '\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7' +
    '\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-' +
    '\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B' +
    '\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6' +
    '\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA' +
    '\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16' +
    '\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3' +
    '\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9' +
    '\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-' +
    '\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44' +
    '\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7' +
    '\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A' +
    '\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF' +
    '\uFFD2-\uFFD7\uFFDA-\uFFDC]*$',
);

const HOTKEY_TEST = /^([#!^+&<>*~$]+|(?:<\^>!))?([!-\/]|[:-@]|[\[-`]|[\{-~]|[a-zA-Z0-9]+)(\s&\s([!-\/]|[:-@]|[\[-`]|[\{-~]|[a-zA-Z0-9]+))?([ \t]+UP)?(::)/i

const RESERVED_KEYWORDS = (() => {
	let keyword: ITokenMap = new Map();
	for (let k = TokenType.if; k <= TokenType.byref; k++)
		keyword.set(TokenType[k], k);
    keyword.set("or", TokenType.keyor)
    keyword.set("and", TokenType.keyand)
    keyword.set("not", TokenType.keynot)
	return keyword;
})();

const OTHER_MARK: ITokenMap = new Map([
    ["{", TokenType.openBrace], ["}", TokenType.closeBrace],
    ["[", TokenType.openBracket], ["]", TokenType.closeBracket],
    ["(", TokenType.openParen], [")", TokenType.closeParen],
    [";", TokenType.lineComment], ["=", TokenType.equal],
    ["#", TokenType.sharp], [",", TokenType.comma], [".", TokenType.dot], ["!", TokenType.not],
    ["&", TokenType.and], ["|", TokenType.or], ["^", TokenType.xor],
    ["&&", TokenType.logicand], ["||", TokenType.logicor],
    ["+", TokenType.plus], ["-", TokenType.minus], ["*", TokenType.multi],
    ["/", TokenType.div], ["//", TokenType.fdiv], ["**", TokenType.power], [">", TokenType.greater],
    ["<", TokenType.less], [">=", TokenType.greaterEqual], ["<=", TokenType.lessEqual],
    ["?", TokenType.question], [":", TokenType.colon], ["::", TokenType.hotkey],
    ["%", TokenType.precent], [">>", TokenType.rshift], ["<<", TokenType.lshift],
    ["++", TokenType.pplus], ["--", TokenType.mminus], ["~", TokenType.bnot],
    ["$", TokenType.dollar],
    // equals
    [":=", TokenType.aassign], ["=", TokenType.equal], ["+=", TokenType.pluseq],
    ["-=", TokenType.minuseq], ["*=", TokenType.multieq], ["/=", TokenType.diveq],
    ["//=", TokenType.idiveq], [".=", TokenType.sconneq], ["|=", TokenType.oreq],
    ["&=", TokenType.andeq], ["^=", TokenType.xoreq], [">>=", TokenType.rshifteq],
    ["<<=", TokenType.lshifteq], ["~=", TokenType.regeq], ["==", TokenType.dequal],
    ["<>", TokenType.glnequal], ["!=", TokenType.notEqual]
]);

const DRECTIVE_TEST: Set<string> = new Set([
    "allowsamelinecomments", "clipboardtimeout", "commentflag", "errorstdout",
    "escapechar", "hotkeyinterval", "hotkeymodifiertimeout", "hotstring", "if",
    "iftimeout", "ifwinactive", "ifwinactiveclose", "ifwinexist", "ifwinexistclose",
    "ifwinnotactive", "ifwinnotactiveclose", "ifwinnotexist", "include", "includeagain",
    "inputlevel", "installkeybdhook", "installmousehook", "keyhistory", "ltrim",
    "maxhotkeysperinterval", "maxmem", "maxthreads", "maxthreadsbuffer", "maxthreadsperhotkey",
    "menumaskkey", "noenv", "notrayicon", "persistent", "singleinstance", "usehook", "warn", 
    "winactivateforce", "requires"
])

const COMMAND_TEST: Set<string> = new Set([
    "autotrim","blockinput","click","clipwait","control","controlclick","controlfocus","controlget",
    "controlgetfocus","controlgetpos","controlgettext","controlmove","controlsend","controlsendraw","controlsettext","coordmode",
    "critical","detecthiddentext","detecthiddenwindows","drive","driveget","drivespacefree","edit","envadd",
    "envdiv","envget","envmult","envset","envsub","envupdate","exit","exitapp",
    "fileappend","filecopy","filecopydir","filecreatedir","filecreateshortcut","filedelete","fileencoding","filegetattrib",
    "filegetshortcut","filegetsize","filegettime","filegetversion","fileinstall","filemove","filemovedir","fileread",
    "filereadline","filerecycle","filerecycleempty","fileremovedir","fileselectfile","fileselectfolder","filesetattrib","filesettime",
    "formattime","getkeystate","groupactivate","groupadd","groupclose","groupdeactivate","gui","guicontrol",
    "guicontrolget","hotkey","imagesearch","inidelete","iniread","iniwrite","input","inputbox",
    "keyhistory","keywait","listhotkeys","listlines","listvars","menu","mouseclick","mouseclickdrag",
    "mousegetpos","mousemove","msgbox","onexit","outputdebug","pause","pixelgetcolor","pixelsearch",
    "postmessage","process","progress","random","regdelete","regread","regwrite","reload",
    "run","runas","runwait","send","sendevent","sendinput","sendlevel","sendmessage",
    "sendmode","sendplay","sendraw","setbatchlines","setcapslockstate","setcontroldelay","setdefaultmousespeed","setenv",
    "setformat","setkeydelay","setmousedelay","setnumlockstate","setregview","setscrolllockstate","setstorecapslockmode","settimer",
    "settitlematchmode","setwindelay","setworkingdir","shutdown","sleep","sort","soundbeep","soundget",
    "soundgetwavevolume","soundplay","soundset","soundsetwavevolume","splashimage","splashtextoff","splashtexton","splitpath",
    "statusbargettext","statusbarwait","stringcasesense","stringgetpos","stringleft","stringlen","stringlower","stringmid",
    "stringreplace","stringright","stringsplit","stringtrimleft","stringtrimright","stringupper","suspend","sysget",
    "thread","tooltip","transform","traytip","urldownloadtofile","winactivate","winactivatebottom","winclose",
    "winget","wingetactivestats","wingetactivetitle","wingetclass","wingetpos","wingettext","wingettitle","winhide",
    "winkill","winmaximize","winmenuselectitem","winminimize","winminimizeall","winminimizeallundo","winmove","winrestore",
    "winset","winsettitle","winshow","winwait","winwaitactive","winwaitclose","winwaitnotactive",    
])

export const DOCUMENT_START_TOKEN = new Token(TokenType.EOL, '', Position.create(-1, -1), Position.create(-1, -1))