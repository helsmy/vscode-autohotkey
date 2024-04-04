import { Position, Range } from 'vscode-languageserver';
import { TokenType } from './tokenTypes';

/**
 * all result kind of a tokenizor
 */
export const enum TokenKind {
	/**
	 * tokenizor got a token
	 */
	Token,
	/**
	 * tokenizor enconter an error
	 */
	Diagnostic,
	/**
	 * got a comment
	 */
	Commnet,
	/**
	 * Hotkey which contains all tokens in list
	 */
	Multi
}

export interface Result<T, TokenKind> {
	result: T,
	kind: TokenKind
};

/**
 * Infomation of an error
 */
export interface IDiagnosticInfo {
	/**
	 * what is scanned
	 */
	content: string,
	/**
	 * range of error
	 */
	range: Range
}

export type TakeToken = Result<Token, TokenKind.Token>;
export type TakeDiagnostic = Result<IDiagnosticInfo, TokenKind.Diagnostic>;
export type TakeComment = Result<Token, TokenKind.Commnet>;
export type TakeMultiToken = Result<Token[], TokenKind.Multi>;

export type TokenResult = 
	| TakeToken
	| TakeDiagnostic
	| TakeComment
	| TakeMultiToken;

export interface IToken {
	type: TokenType;
	content: string;
	start: Position;
	end: Position;
}

export type ITokenMap = Map<string, TokenType>;

export class Token implements IToken {
	public readonly type: TokenType;
	public readonly content: string;
	public readonly start: Position;
	public readonly end: Position;
	constructor(type: TokenType, content: string, start: Position, end: Position) {
		this.type = type;
		this.content = content;
		this.start = start;
		this.end = end;
	}
}

export class MissingToken extends Token {
	constructor(type: TokenType, start: Position) {
		super(
			type,
			'',
			start,
			start
		);
	}
}

export class SkipedToken extends Token {
	constructor(token: IToken) {
		super(
			token.type,
			token.content,
			token.start,
			token.end
		)
	}
}