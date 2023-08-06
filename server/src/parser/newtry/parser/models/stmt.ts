import { Position, Range } from 'vscode-languageserver';
import { IExpr, IStmt, IStmtVisitor, SyntaxKind, Token } from '../../types';
import { NodeBase } from './nodeBase';
import * as Expr from './expr'
import { joinLines } from '../utils/stringUtils';
import { DelimitedList } from './delimtiedList';

/**
 * Statement base class
 */
export abstract class Stmt extends NodeBase implements IStmt {
	/**
	 * Return the tree node type of statement
	 */
	get tag(): SyntaxKind.stmt {
		return SyntaxKind.stmt;
	}

	/**
	 * All statement implement the accept method
	 * Called when he node should execute the visitors methods
	 * @param visitor visitor object
	 */
	public abstract accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T>;
}

export class Invalid extends Stmt {
	/**
	 * Construct a new invalid statement
	 * @param pos Provides the start position of this statement
	 * @param tokens tokens involved in this invalid statement
	 */
	constructor(
		public readonly pos: Position,
		public readonly tokens: Token[]
	) {
		super();
	}

	/**
	 * Convert this invalid statement into a set of line
	 */
	public toLines(): string[] {
		return [this.tokens.map(t => t.content).join(' ')];
	}

	/**
	 * What is the start position of this statement
	 */
	public get start(): Position {
		return this.tokens.length > 0 ? this.tokens[0].start : this.pos;
	}

	/**
	 * What is the end position of this statement
	 */
	public get end(): Position {
		return this.tokens.length > 0
			? this.tokens[this.tokens.length - 1].end
			: this.pos;
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

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	  ): ReturnType<T> {
		return visitor.visitStmtInvalid(this, parameters);
	}
}

export class AssignStmt extends Stmt {
	/**
	 * @param left Variable to be assigned
	 * @param assign Assign token
	 */
	constructor(
		public readonly left: Expr.Factor,
		public readonly assign: Token,
		public readonly expr: Expr.Expr,
		public readonly trailerExpr?: TrailerExprList
	) {
		super();
	}

	public toLines(): string[] {
		const exprLines = this.expr.toLines();
		const idLines = this.left.toLines();
		return joinLines(this.assign.content, idLines, exprLines);
	}

	public get start(): Position {
		return this.left.start;
	}

	public get end(): Position {
		return this.expr.end;
	}

	public get ranges(): Range[] {
		return [this.expr];
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	  ): ReturnType<T> {
		return visitor.visitAssign(this, parameters);
	}
}

/**
 * class containing function call and ',' expressions
 */
export class ExprStmt extends Stmt {
	constructor(
		public readonly expression: Expr.Expr,
		public readonly trailerExpr?: TrailerExprList
	) {
		super();
	}

	public toLines(): string[] {
		const suffixLines = this.expression.toLines();
		suffixLines[suffixLines.length - 1] = `${suffixLines[suffixLines.length - 1]}`;

		return suffixLines;
	}

	public get start(): Position {
		return this.expression.start;
	}

	public get end(): Position {
		if (this.trailerExpr) return this.trailerExpr.end;
		return this.expression.end;
	}

	public get ranges(): Range[] {
		return [this.expression];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitExpr(this, parameters);
	}
}

export class TrailerExprList extends Stmt {
	constructor(
		public readonly delimiter: Token,
		public readonly exprList: DelimitedList<Expr.Expr>
	) {
		super();
	}

	// TODO
	public get ranges(): Range[] {
		throw new Error('Method not implemented.');
	}
	public toLines(): string[] {
		throw new Error('Method not implemented.');
	}
	public get start(): Position {
		throw new Error('Method not implemented.');
	}
	public get end(): Position {
		throw new Error('Method not implemented.');
	}
	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T> {
			throw new Error('Method not implemented.');
	}
	
}

export class CommandCall extends Stmt {
	constructor(
		public readonly command: Token,
		public readonly args: DelimitedList<Expr.Expr>
	) {
		super();
	}

	public toLines(): string[] {
		return [this.command.content, ...this.args.toLines()];
	}

	public get start(): Position {
		return this.command.start;
	}

	public get end(): Position {
		return  (this.args.length === 0) ?
				this.command.end :
				this.args.end;;
	}

	public get ranges(): Range[] {
		return [this.command, ...this.args.ranges];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitCommandCall(this, parameters);
	}
}

export class Block extends Stmt {

	constructor(
		public readonly open: Token,
		public readonly stmts: Stmt[],
		public readonly close: Token
	) {
		super();
	}

	public toLines(): string[] {
		const lines = this.stmts.flatMap(stmt => stmt.toLines());

		if (lines.length === 0) {
			return [`${this.open.content} ${this.close.content}`];
		}

		if (lines.length === 1) {
			return [`${this.open.content} ${lines[0]} ${this.close.content}`];
		}

		return [`${this.open.content}`].concat(
			...lines.map(line => `    ${line}`),
			`${this.close.content}`,
		);
	}

	public get start(): Position {
		return this.open.start;
	}

	public get end(): Position {
		return this.close.end;
	}

	public get ranges(): Range[] {
		return [this.open, ...this.stmts, this.close];
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitBlock(this, parameters);
	}
}

export class If extends Stmt {

	constructor(
		public readonly ifToken: Token,
		public readonly condition: Expr.Expr,
		public readonly body: IStmt,
		public readonly elseStmt?: Else
	) {
		super();
	}

	public toLines(): string[] {
		const conditionLines = this.condition.toLines();
		const stmtLines = this.body.toLines();

		conditionLines[0] = `${this.ifToken.content} ${conditionLines[0]}`;
		const lines = conditionLines;

		if (this.elseStmt !== undefined) {
			const elseLines = this.elseStmt.toLines();
			return lines;
		}

		return lines;
	}

	public get start(): Position {
		return this.ifToken.start;
	}

	public get end(): Position {
		return (this.elseStmt === undefined) ? this.body.end : this.elseStmt.end;
	}

	public get ranges(): Range[] {
		const ranges = [this.ifToken, this.condition, this.body];
		if (this.elseStmt !== undefined) {
			ranges.push(this.elseStmt);
		}

		return ranges;
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitIf(this, parameters);
	}
}

export class Else extends Stmt {

	constructor(
		public readonly elseToken: Token,
		public readonly body: IStmt,
		public readonly condition?: IExpr
	) {
		super();
	}

	public toLines(): string[] {
		const lines = this.body.toLines();
		lines[0] = `${this.elseToken.content} ${lines[0]}`;
		return lines;
	}

	public get start(): Position {
		return this.elseToken.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		return [this.elseToken, this.body];
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitElse(this, parameters);
	}
}

export class SwitchStmt extends Stmt {

	constructor(
		public readonly switchToken: Token,
		public readonly condition: Expr.Expr,
		public readonly open: Token,
		public readonly cases: CaseStmt[],
		public readonly close: Token
	) {
		super();
	}

	public toLines(): string[] {
		const conditionLines = this.condition.toLines();
		const casesLines = this.caseLines();

		conditionLines[0] = `${this.switchToken.content} ${conditionLines[0]}`;

		return joinLines(' ', conditionLines, casesLines);
	}

	private caseLines(): string[] {
		const lines = this.cases.flatMap(stmt => stmt.toLines());

		if (lines.length === 0) {
			return [`${this.open.content} ${this.close.content}`];
		}

		if (lines.length === 1) {
			return [`${this.open.content} ${lines[0]} ${this.close.content}`];
		}

		return [`${this.open.content}`].concat(
			...lines.map(line => `    ${line}`),
			`${this.close.content}`,
		);
	}

	public get start(): Position {
		return this.switchToken.start;
	}

	public get end(): Position {
		return this.close.end;
	}

	public get ranges(): Range[] {
		const casesRange = this.cases.flatMap(c => c.ranges);
		return [
			this.switchToken, ...this.condition.ranges,
			this.open, ...casesRange, this.close
		];
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitSwitch(this, parameters);
	}
}

export class CaseStmt extends Stmt {

	constructor(
		public readonly CaseNode: CaseExpr | DefaultCase,
		public readonly body: IStmt[]
	) {
		super();
	}

	public toLines(): string[] {
		const CaseNodeLines = this.CaseNode.toLines();
		const bodyLines = this.body.map(stmt => stmt.toLines());

		return joinLines(' ', CaseNodeLines, ...bodyLines);
	}

	public get start(): Position {
		return this.CaseNode.start;
	}

	public get end(): Position {
		if (this.body.length === 0)
			return this.CaseNode.end;
		else
			return this.body[this.body.length - 1].end;
	}

	public get ranges(): Range[] {
		const bodyRange = this.body.flatMap(b => b.ranges);
		return [...this.CaseNode.ranges, ...bodyRange];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
	  return visitor.visitCase(this, parameters);
	}
}

export class CaseExpr extends NodeBase {
	constructor(
		public readonly caseToken: Token,
		public readonly conditions: DelimitedList<Expr.Expr>,
		public readonly colon: Token
	) {
		super();
	}

	public toLines(): string[] {
		const conditionLines = this.conditions.toLines();

		conditionLines[0] = `${this.caseToken.content} ${conditionLines[0]}`;
		conditionLines[conditionLines.length - 1] += this.colon.content;
		return conditionLines;
	}

	public get start(): Position {
		return this.caseToken.start;
	}

	public get end(): Position {
		return this.colon.end;
	}

	public get ranges(): Range[] {
		const condRange = this.conditions.ranges;
		return [this.caseToken, ...condRange, this.colon];
	}

	// public accept<T extends (...args: any) => any>(
	//   visitor: IStmtVisitor<T>,
	//   parameters: Parameters<T>,
	// ): ReturnType<T> {
	//   return visitor.visitWhen(this, parameters);
	// }
}

export class DefaultCase extends NodeBase {
	constructor(
		public readonly defaultToken: Token
	) {
		super();
	}

	public toLines(): string[] {
		return [`${this.defaultToken.content}:`];
	}

	public get start(): Position {
		return this.defaultToken.start;
	}

	public get end(): Position {
		return this.defaultToken.end;
	}

	public get ranges(): Range[] {
		return [this.defaultToken];
	}

	// public accept<T extends (...args: any) => any>(
	//   visitor: IStmtVisitor<T>,
	//   parameters: Parameters<T>,
	// ): ReturnType<T> {
	//   return visitor.visitWhen(this, parameters);
	// }
}

export class Loop extends Stmt {

	constructor(
		public readonly loop: Token,
		public readonly body: IStmt,
		public readonly condition?: DelimitedList<Expr.Expr>
	) {
		super();
	}

	public toLines(): string[] {
		const bodyLines = this.body.toLines();
		if (this.condition !== undefined) {
			const conditionLines = this.condition.toLines();
	
			conditionLines[0] = `${this.loop.content} ${conditionLines[0]}`;
	
			return joinLines(' ', conditionLines, bodyLines);
		}
		return joinLines(' ', [this.loop.content], bodyLines);
	}

	public get start(): Position {
		return this.loop.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		return this.condition ? 
			[this.loop, this.condition, this.body] :
			[this.loop, this.body];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
	  return visitor.visitLoop(this, parameters);
	}
}

export class UntilLoop extends Stmt {

	constructor(
		public readonly loop: Token,
		public readonly body: IStmt,
		public readonly until: Token,
		public readonly condition: Expr.Expr,
	) {
		super();
	}

	public toLines(): string[] {
		const conditionLines = this.condition.toLines();
		const bodyLines = this.body.toLines();

		bodyLines[0] = `${this.loop.content} ${bodyLines[0]}`;
		conditionLines[0] = `${this.until.content} ${conditionLines[0]}`;

		return joinLines(' ', bodyLines, conditionLines);
	}

	public get start(): Position {
		return this.loop.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		return [this.loop, this.condition, this.body];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
	  return visitor.visitLoop(this, parameters);
	}
}

export class WhileStmt extends Stmt {

	constructor(
		public readonly whileToken: Token,
		public readonly condition: Expr.Expr,
		public readonly body: IStmt
	) {
		super();
	}

	public toLines(): string[] {
		const conditionLines = this.condition.toLines();
		const bodyLines = this.body.toLines();

		conditionLines[0] = `${this.whileToken.content} ${conditionLines[0]}`;

		return joinLines(' ', conditionLines, bodyLines);
	}

	public get start(): Position {
		return this.whileToken.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		return [this.whileToken, this.condition, this.body];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
	  return visitor.visitWhile(this, parameters);
	}
}

// TODO: Finish for loop
export class ForStmt extends Stmt {
	constructor(
		public readonly forToken: Token,
		public readonly inToken: Token,
		public readonly iterable: Expr.Expr,
		public readonly body: IStmt,
		public readonly iter1id: Token,
		public readonly comma?: Token,
		public readonly iter2id?: Token
	) {
		super();
	}

	public toLines(): string[] {
		const iterLine = this.comma && this.iter2id ?
		 				`${this.iter1id.content} ${this.comma} ${this.iter2id}` :
						 this.iter1id.content;
		const bodyLines = this.body.toLines();

		return joinLines(' ', [iterLine], bodyLines);
	}

	public get start(): Position {
		return this.forToken.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		if (this.comma && this.iter2id)
			return [this.forToken, this.iter1id, this.comma, this.iter2id, this.inToken, this.body];
		return [this.forToken, this.iter1id, this.inToken, this.body];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
	  return visitor.visitFor(this, parameters);
	}
}

export class Continue extends Stmt {
	/**
	 * 
	 * @param continueToken break token
	 * @param label label jumping to
	 */
	 constructor(
		public readonly continueToken: Token,
		public readonly label?: Token
	) {
		super();
	}

	public toLines(): string[] {
		return this.label !== undefined ?
			[`${this.continueToken.content} ${this.label.content}`] :
			[`${this.continueToken.content}`];
	}

	public get start(): Position {
		return this.continueToken.start;
	}

	public get end(): Position {
		return this.continueToken.end;
	}

	public get ranges(): Range[] {
		return [this.continueToken];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitContinue(this, parameters);
	}
}

export class Break extends Stmt {
	/**
	 * 
	 * @param breakToken break token
	 * @param label label jumping to
	 */
	constructor(
		public readonly breakToken: Token,
		public readonly label?: Token
	) {
		super();
	}

	public toLines(): string[] {
		return this.label !== undefined ?
			[`${this.breakToken.content} ${this.label.content}`] :
			[`${this.breakToken.content}`];
	}

	public get start(): Position {
		return this.breakToken.start;
	}

	public get end(): Position {
		return this.breakToken.end;
	}

	public get ranges(): Range[] {
		return [this.breakToken];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitBreak(this, parameters);
	}
}

export class Return extends Stmt {

	constructor(
		public readonly returnToken: Token,
		public readonly value?: Expr.Expr
	) {
		super();
	}

	public toLines(): string[] {
		if (this.value !== undefined) {
			const exprLines = this.value.toLines();

			exprLines[0] = `${this.returnToken.content} ${exprLines[0]}`;
			exprLines[exprLines.length - 1] = `${exprLines[exprLines.length - 1]}.`;
			return exprLines;
		}

		return [`${this.returnToken.content}`];
	}

	public get start(): Position {
		return this.returnToken.start;
	}

	public get end(): Position {
		return this.value === undefined ? this.returnToken.end : this.value.end;
	}

	public get ranges(): Range[] {
		let ranges: Range[] = [this.returnToken];
		if (this.value !== undefined) {
			ranges = ranges.concat(this.value.ranges);
		}

		return ranges;
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitReturn(this, parameters);
	}
}

export class TryStmt extends Stmt {

	constructor(
		public readonly tryToken: Token,
		public readonly body: IStmt,
		public readonly catchStmt?: CatchStmt,
		public readonly finallyStmt?: FinallyStmt
	) {
		super();
	}

	public toLines(): string[] {
		const stmtLines = this.body.toLines();
		stmtLines[0] = `${this.tryToken.content} ${stmtLines[0]}`;

		let lines = stmtLines;

		if (this.catchStmt !== undefined) {
			lines = joinLines(' ', lines, this.catchStmt.toLines());
		}

		if (this.finallyStmt !== undefined) {
			lines = joinLines(' ', lines, this.finallyStmt.toLines());
		}

		return lines;
	}

	public get start(): Position {
		return this.tryToken.start;
	}

	public get end(): Position {
		return (this.catchStmt === undefined) ? this.body.end : this.catchStmt.end;
	}

	public get ranges(): Range[] {
		const ranges: Range[] = [this.tryToken, this.body];
		if (this.catchStmt !== undefined) {
			ranges.push(...this.catchStmt.ranges);
		}

		if (this.finallyStmt !== undefined) {
			ranges.push(...this.finallyStmt.ranges);
		}

		return ranges;
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	): ReturnType<T> {
		return visitor.visitTry(this, parameters);
	}
}

export class CatchStmt extends Stmt {

	constructor(
		public readonly catchToken: Token,
		public readonly errors: Token,
		public readonly body: IStmt
	) {
		super();
	}

	public toLines(): string[] {
		const conditionLines = `${this.catchToken.content} ${this.errors.content}`;
		const bodyLines = this.body.toLines();

		return joinLines(' ', [conditionLines], bodyLines);
	}

	public get start(): Position {
		return this.catchToken.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		return [this.catchToken, this.errors, this.body];
	}

	public accept<T extends (...args: any) => any>(
	  visitor: IStmtVisitor<T>,
	  parameters: Parameters<T>,
	): ReturnType<T> {
	  return visitor.visitCatch(this, parameters);
	}
}

export class FinallyStmt extends Stmt {

	constructor(
		public readonly finallToken: Token,
		public readonly body: IStmt
	) {
		super();
	}

	public toLines(): string[] {
		const bodyLines = this.body.toLines();

		bodyLines[0] = `${this.finallToken.content} ${bodyLines[0]}`;

		return bodyLines;
	}

	public get start(): Position {
		return this.finallToken.start;
	}

	public get end(): Position {
		return this.body.end;
	}

	public get ranges(): Range[] {
		return [this.finallToken, this.body];
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	  ): ReturnType<T> {
		return visitor.visitFinally(this, parameters);
	}
}

export class Throw extends Stmt {
	constructor(
		public readonly throwToken: Token,
		public readonly expr: Expr.Expr
	) {
		super();
	}

	public toLines(): string[] {
		const exprLines = this.expr.toLines();

		exprLines[0] = `${this.throwToken.content} ${exprLines[0]}`;

		return exprLines;
	}

	public get start(): Position {
		return this.throwToken.start;
	}

	public get end(): Position {
		return this.expr.end;
	}

	public get ranges(): Range[] {
		return [this.throwToken, this.expr];
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	  ): ReturnType<T> {
		return visitor.visitThrow(this, parameters);
	}
}

export class Drective extends Stmt {
	constructor(
		public readonly drective: Token,
		public readonly args: DelimitedList<Expr.Expr>
	) {
		super();
	}

	public get start(): Position {
		return this.drective.start;
	}

	public get end(): Position {
		return (this.args.length === 0) ?
				this.drective.end :
				this.args.end;
	}

	public get ranges(): Range[] {
		return [this.drective, ...this.args.ranges];
	}

	public toLines(): string[] {
		if (this.args.childern.length === 0) {
			return [`${this.drective.content}`];
		}

		const argsLines = this.args.toLines();
		const argsResult = joinLines(', ', argsLines);

		argsResult[0] = `${this.drective.content}${argsResult[0]}`;
		return argsResult;
	}

	public accept<T extends (...args: any) => any>(
		visitor: IStmtVisitor<T>,
		parameters: Parameters<T>,
	  ): ReturnType<T> {
		return visitor.visitDrective(this, parameters);
	}
}

export type LoopStmt = Loop | UntilLoop;