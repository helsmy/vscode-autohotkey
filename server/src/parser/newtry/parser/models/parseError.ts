import { Position, Range } from 'vscode-languageserver-types';
import { Token } from '../../types';
import { IParseError } from "../../types";
import { Expr } from './expr';
import { Stmt } from './stmt';

export class ParseError implements IParseError {
	public readonly token: Token;
	public readonly message: string;
	public readonly failed: FailedConstructor;

	constructor(token: Token, message: string, failed: FailedConstructor) {
		this.token = token;
		this.message = message;
		this.failed = failed;
	}

	get start(): Position {
		return this.token.start;
	}

	get end(): Position {
		return this.token.end;
	}
}

export class FailedConstructor {
	constructor(
		public stmt: Maybe<Constructor<Stmt>>,
		public expr: Maybe<Constructor<Expr>>,
	) { }
}

export type NodeConstructor =
	| Constructor<Expr>
	| Constructor<Stmt>
	| Constructor;

export const constructorToFailed = (constructor?: NodeConstructor) => {
	if (constructor === undefined) {
		return failedUnknown();
	}

	if (constructor.prototype instanceof Expr) {
		return failedExpr(constructor as any);
	}

	if (constructor.prototype instanceof Stmt) {
		return failedStmt(constructor as any);
	}

	return failedUnknown();
}

export const failedExpr = (
	expr: Maybe<Constructor<Expr>>,
): FailedConstructor => {
	return new FailedConstructor(undefined, expr);
};

export const failedStmt = (
	stmt: Maybe<Constructor<Stmt>>,
): FailedConstructor => {
	return new FailedConstructor(stmt, undefined);
};

export const failedUnknown = (): FailedConstructor => {
	return new FailedConstructor(undefined, undefined);
};
