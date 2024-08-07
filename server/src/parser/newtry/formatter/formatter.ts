import { TreeVisitor } from '../analyzer/treeVisitor';
import { IAST, IStmtVisitor } from '../types';
import * as Stmt from '../parser/models/stmt';
import * as Decl from '../parser/models/declaration';
import * as Expr from '../parser/models/expr';
import * as SuffixTerm from '../parser/models/suffixterm';
import { Token } from '../tokenizor/types';
import { Range } from 'vscode-languageserver/node';

interface FormatOptions {
	// format document to which version of Autohotkey
	version: 1 | 2
}

const defaultOption: FormatOptions = {
	version: 1
}

// export class AHKFormatter extends TreeVisitor<string[][]> {
// 	private option = defaultOption;

// 	public format(AST: IAST, option: Partial<FormatOptions>): string[] {
// 		this.option = defaultOption;
// 		const lines: string[][] = []
// 		for (const s of AST.script.stmts) {
// 			lines.push(...s.accept(this, []));
// 		}
// 		return lines.map(l => l.join(''));
// 	}

// 	public visitDeclVariable(decl: Decl.VarDecl): string[][] {
// 		const lines = new FormatLines();
// 		lines.printToken(decl.scope);
// 		let pre: Range = decl.scope;
// 		for (const expr of decl.assigns.childern) {
// 			if (expr instanceof Token) 
// 				lines.printToken(expr, pre);
// 			else
// 				lines.concatString(this.processExpr(expr), expr, pre);
// 			pre = expr;
// 		}
// 		return lines.lines;
// 	}

// 	public visitDeclFunction(decl: Decl.FuncDef): string[][] {
// 		const errors = this.checkDiagnosticForNode(decl);
// 		const params = decl.params;
// 		for (const param of params.ParamaterList.getElements()) {
// 			errors.push(...this.checkDiagnosticForNode(param));
// 			if (param instanceof Decl.DefaultParam)
// 				errors.push(...this.processExpr(param.value))
// 		}
// 		const reqParams = this.paramAction(params.requiredParameters);
// 		const dfltParams = this.paramAction(params.optionalParameters);
// 		const sym = new AHKMethodSymbol(
// 			this.script.uri,
// 			decl.nameToken.content,
// 			copyRange(decl),
// 			reqParams,
// 			dfltParams,
// 			this.table,
// 			this.currentScoop instanceof AHKObjectSymbol ?
// 				this.currentScoop : undefined
// 		);
// 		// this.supperGlobal.define(sym);
// 		// this.supperGlobal.addScoop(sym);
// 		// this.table.define(sym);
// 		// this.table.addScoop(sym);
// 		this.currentScoop.define(sym);
// 		this.currentScoop.addScope(sym);

// 		this.enterScoop(sym);
// 		errors.push(...decl.body.accept(this, []));
// 		this.leaveScoop();
// 		return errors;
// 	}

// 	private paramAction(params: Decl.Parameter[]): ParameterSymbol[] {
// 		const syms: ParameterSymbol[] = [];
// 		for(const param of params) {
// 			syms.push(new ParameterSymbol(
// 				this.script.uri,
// 				param.identifier.content,
// 				copyRange(param),
// 				VarKind.parameter,
// 				param.byref !== undefined,
// 				param instanceof Decl.SpreadParameter
// 			));
// 		}
// 		return syms;
// 	}
	
// 	public visitDeclClass(decl: Decl.ClassDef): string[][] {
// 		const errors: string[][] = this.checkDiagnosticForNode(decl);
// 		// TODO: parent scoop of class
// 		const parentScoop = undefined;
// 		const objTable = new AHKObjectSymbol(
// 			this.script.uri,
// 			decl.name.content,
// 			copyRange(decl),
// 			parentScoop,
// 			this.currentScoop
// 		);
		
// 		this.currentScoop.define(objTable);
// 		this.enterScoop(objTable);
// 		errors.push(... decl.body.accept(this, []));
// 		this.leaveScoop();
// 		return errors;
// 	}

// 	public visitDynamicProperty(decl: Decl.DynamicProperty): string[][] {
// 		const errors: string[][] = this.checkDiagnosticForNode(decl);
// 		if (!(this.currentScoop instanceof AHKObjectSymbol)) return errors;
// 		const dynamicProperty = new AHKDynamicPropertySymbol(
// 			this.script.uri,
// 			decl.name.content,
// 			copyRange(decl),
// 			this.currentScoop
// 		);
// 		this.currentScoop.define(dynamicProperty);
// 		for (const getterSetter of decl.body.stmts) {
// 			// 虽然基本不可能发生，动态属性里是固定的getter和setter
// 			if (!(getterSetter instanceof Decl.GetterSetter)) {
// 				errors.push(...getterSetter.accept(this, []));
// 				continue;
// 			}
// 			const funcType = getterSetter.nameToken.content.toLowerCase();
// 			const symName = funcType === 'get' ? 'get' : 'set';
// 			const sym = new AHKGetterSetterSymbol(
// 				this.script.uri,
// 				symName,
// 				decl.name.content,
// 				copyRange(getterSetter),
// 				this.currentScoop,
// 				this.table
// 			)
// 			dynamicProperty.define(sym);
// 			this.enterScoop(sym);
// 			errors.push(...getterSetter.accept(this, []));
// 			this.leaveScoop();
// 		}
// 		return errors;
// 	}

// 	public visitDeclGetterSetter(decl: Decl.GetterSetter): string[][] {
// 		// FIXME: finish getter setter function
// 		return this.checkDiagnosticForNode(decl).concat(decl.body.accept(this, []));
// 	}

// 	public visitDeclHotkey(decl: Decl.Hotkey): string[][] {
// 		const key1 = `${decl.key1.modifiers?.content ?? ''}${decl.key1.key.content}`;
// 		const keyfull = decl.key2 ? `${key1} & ${decl.key2.key.content}`: key1;
// 		const name = `${keyfull} ${decl.up ? 'UP' : ''}`
// 		this.table.define(
// 			new HotkeySymbol(
// 				this.script.uri,
// 				name,
// 				copyRange(decl)
// 			)
// 		);
// 		return this.checkDiagnosticForNode(decl);
// 	}

// 	public visitDeclHotString(decl: Decl.HotString): string[][] {
// 		this.table.define(
// 			new HotStringSymbol(
// 				this.script.uri,
// 				decl.str.content,
// 				copyRange(decl)
// 			)
// 		);
// 		return this.checkDiagnosticForNode(decl);
// 	}

// 	public visitDeclLabel(decl: Decl.Label): string[][] {
// 		this.table.define(
// 			new LabelSymbol(
// 				this.script.uri,
// 				decl.name.content,
// 				copyRange(decl)
// 			)
// 		);
// 		return this.checkDiagnosticForNode(decl);
// 	}

// 	public visitStmtInvalid(stmt: Stmt.Invalid): string[][] {
// 		const lines = new FormatLines()
// 		stmt.tokens.forEach(t => lines.printToken(t));
// 		return lines.lines;
// 	}

// 	public visitdirective(stmt: Stmt.directive): string[][] {
// 		// Nothing to do in first scanning
// 		return this.checkDiagnosticForNode(stmt);
// 	}

// 	public visitBlock(stmt: Stmt.Block): string[][] {
// 		const lines = new FormatLines()
// 		lines.printToken(stmt.open);
// 		let pre: Range = stmt.open;
// 		for (const singleStmt of stmt.stmts) {
// 			lines.concat(this, singleStmt, pre);
// 			pre = singleStmt;
// 		}
// 		return lines.lines;
// 	}

// 	public visitAssign(stmt: Stmt.AssignStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		const resultType = this.checkExprResultType(stmt.expr);
// 		errors.push(...this.processAssignVar(stmt.left, stmt, resultType));
// 		errors.push(...this.processExpr(stmt.expr));
// 		errors.push(...this.processTrailerExpr(stmt.trailerExpr));
// 		return errors;
// 	}

// 	public visitExpr(stmt: Stmt.ExprStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		errors.push(...this.processExpr(stmt.expression));
// 		errors.push(...this.processTrailerExpr(stmt.trailerExpr));
// 		return errors;
// 	}

// 	public visitCommandCall(stmt: Stmt.CommandCall): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		for (const arg of stmt.args.getElements()) {
// 			errors.push(...this.processExpr(arg));
// 		}

// 		return errors;
// 	}


// 	private processTrailerExpr(trailer: Maybe<Stmt.TrailerExprList>): string[][] {
// 		const errors: string[][] = [];
// 		if (!trailer) return errors;
// 		errors.push(...this.checkDiagnosticForNode(trailer));
// 		for (const expr of trailer.exprList.getElements()) {
// 			errors.push(...this.processExpr(expr));
// 		}
// 		return errors;
// 	}

// 	private processExpr(expr: Expr.Expr): string[][] {
// 		const errors = this.checkDiagnosticForNode(expr);
// 		if (expr instanceof Expr.Factor) {
// 			if (!expr.trailer) {
// 				const atom = expr.suffixTerm.atom;
// 				if (atom instanceof SuffixTerm.Identifier && 
// 					expr.suffixTerm.brackets.length === 0) {
// 					// Only check variable defination in first scanning
// 					const idName = atom.token.content;
// 					if (!this.currentScoop.resolve(idName)) { 
// 						errors.push(this.error(
// 							copyRange(atom),
// 							`Variable "${idName}" is used before defination`,
// 							string[][]everity.Warning
// 						));
// 					}
// 				}
// 				for (const bracket of expr.suffixTerm.brackets) {
// 					errors.push(...this.checkDiagnosticForNode(bracket))
// 					if (bracket instanceof SuffixTerm.Call) 
// 						bracket.args.getElements().forEach(
// 							arg => errors.push(...this.processExpr(arg))
// 						);
// 					else 
// 						bracket.items.getElements().forEach(
// 							index => errors.push(...this.processExpr(index))
// 						);
// 				}
// 			}
// 			// TODO: Call and backet identifer check
// 		}
// 		else if (expr instanceof Expr.Unary) {
// 			errors.push(...this.processExpr(expr.factor));
// 		}
// 		else if (expr instanceof Expr.Binary) {
// 			// if contains assign expression
// 			// check if create a new variable检查是否有新的变量赋值
// 			const resultType = this.checkExprResultType(expr.right);
// 			if (expr.operator.type === TokenType.aassign &&
// 				expr.left instanceof Expr.Factor) {
// 				errors.push(...this.processAssignVar(expr.left, expr, resultType));
// 			}
// 			else
// 				errors.push(...this.processExpr(expr.left));
// 			errors.push(...this.processExpr(expr.right));
// 		}
// 		else if (expr instanceof Expr.Ternary) {
// 			errors.push(...this.processExpr(expr.condition));
// 			errors.push(...this.processExpr(expr.trueExpr));
// 			errors.push(...this.processExpr(expr.falseExpr));
// 		}
// 		else if (expr instanceof Expr.ParenExpr) {
// 			errors.push(...this.processExpr(expr.expr));
// 		}
		
// 		return errors;
// 	}

// 	/**
// 	 * Find the result type of an expression.
// 	 * For temporary usage. Retrieve the class name of a `new classname(.classname)?()` 
// 	 * @param expr Expression to check
// 	 */
// 	private checkExprResultType(expr: Expr.Expr): Maybe<string[]> {
// 		const isNewClass = expr instanceof Expr.Unary && 
// 						   expr.operator.type === TokenType.new &&
// 						   expr.factor instanceof Expr.Factor &&
// 						   expr.factor.suffixTerm.atom instanceof SuffixTerm.Identifier;
// 		if (isNewClass) {
// 			let objectNames: string[] = [];
// 			const brackets = expr.factor.suffixTerm.brackets;
// 			const atom = expr.factor.suffixTerm.atom;
// 			// no check calling more than one
// 			if (brackets.length > 1) return undefined;
// 			// new Object()
// 			if (brackets.length === 1) {
// 				const trailer = brackets[0]
// 				if (trailer instanceof SuffixTerm.Call && !expr.factor.trailer)
// 					return [atom.token.content];
// 				return undefined;
// 			}
// 			// new Object
// 			if (brackets.length === 0) return [atom.token.content];
// 			if (expr.factor.trailer) {
// 				objectNames.push(atom.token.content);
// 				for (const trailer of expr.factor.trailer.suffixTerm.getElements()) {
// 					const atom = trailer.atom;
// 					if (!(atom instanceof SuffixTerm.Identifier)) return undefined;
// 					if (trailer.brackets.length > 1) return undefined;
// 					if (trailer.brackets.length === 1) {
// 						const atomTrailer = trailer.brackets[0];
// 						if (atomTrailer instanceof SuffixTerm.Call && !expr.factor.trailer)
// 							return objectNames.concat(atom.token.content);
// 						return undefined;
// 					}
// 					objectNames.push(atom.token.content);
// 				}
// 				return objectNames;
// 			}
// 		}
// 		return undefined;
// 	}

// 	private processAssignVar(left: Expr.Factor, fullRange: Range, varType: Maybe<string[]>): string[][] {
// 		const errors = this.checkDiagnosticForNode(left);
// 		const id1 = left.suffixTerm.atom;
// 		if (id1 instanceof SuffixTerm.Identifier) {
// 			// if only variable 标识符只有一个
// 			// 就是变量赋值定义这个变量
// 			if (left.trailer === undefined) {
// 				const idName = id1.token.content;
// 				if (!this.currentScoop.resolve(idName)) {
// 					const kind = this.currentScoop instanceof AHKObjectSymbol ?
// 								 VarKind.property : VarKind.variable;
// 					const sym = new Variableymbol(
// 						this.script.uri,
// 						idName,
// 						copyRange(left),
// 						kind,
// 						undefined
// 					);
// 					if (varType) sym.setType(varType);
// 					this.currentScoop.define(sym);
// 				}
// 				return errors;
// 			}
			
// 			const trailer = left.trailer.suffixTerm.getElements();
// 			trailer.forEach(t => errors.push(...this.processSuffixTerm(t)))
// 			// check if assign to a property
// 			if (id1.token.content === 'this') {
// 				if (!(this.currentScoop instanceof AHKMethodSymbol &&
// 					  this.currentScoop.parentScoop instanceof AHKObjectSymbol)) {
// 					errors.push(Diagnostic.create(
// 						copyRange(left),
// 						'Assign a property out of class'
// 					));
// 					return errors;
// 				}
// 				// if only one property behind this
// 				// 就一个属性的时候, 是给这个属性赋值
				
// 				if (trailer.length === 1) {
// 					const prop = trailer[0];
// 					if (prop.atom instanceof SuffixTerm.Identifier) {
// 						if (!this.currentScoop.parentScoop.resolve(prop.atom.token.content)) {
// 							const sym = new VariableSymbol(
// 								this.script.uri,
// 								prop.atom.token.content,
// 								copyRange(fullRange),
// 								VarKind.property,
// 								undefined
// 							);
// 							if (varType) sym.setType(varType);
// 							this.currentScoop.parentScoop.define(sym);
// 						}
// 					}
// 					return errors;
// 				}
// 			}
// 			return errors;
// 		}

// 		if (left instanceof SuffixTerm.PercentDereference) 
// 			return errors;
// 		errors.push(Diagnostic.create(
// 			copyRange(left),
// 			'The left-hand side of an assignment expression must be a variable or a property access.'
// 		))
// 		return errors;
// 	}

// 	private processSuffixTerm(term: SuffixTerm.SuffixTerm): string[][] {
// 		const errors = this.checkDiagnosticForNode(term);
// 		const atom = term.atom;
// 		errors.push(...this.checkDiagnosticForNode(atom));
// 		if (atom instanceof SuffixTerm.Invalid) {
// 			// Non trailer exists when atom is invalid
// 			return errors.concat(this.error(
// 				copyRange(atom),
// 				`${TokenType[atom.token.type]} expect in suffix.`
// 			));
// 		}
// 		if (atom instanceof SuffixTerm.ArrayTerm) {
// 			for (const iterm of atom.items.getElements()) 
// 				errors.push(...this.processExpr(iterm));
// 		}
// 		else if (atom instanceof SuffixTerm.AssociativeArray) {
// 			for (const pair of atom.pairs.getElements()) {
// 				errors.push(...this.processExpr(pair.key));
// 				errors.push(...this.processExpr(pair.value));
// 			}
// 		}

// 		// trailers
// 		for (const trailer of term.brackets) {
// 			errors.push(...this.checkDiagnosticForNode(trailer));
// 			if (trailer instanceof SuffixTerm.Call) 
// 				trailer.args.getElements().forEach(
// 					arg => errors.push(...this.processExpr(arg))
// 				);
// 			else 
// 				trailer.items.getElements().forEach(
// 					index => errors.push(...this.processExpr(index))
// 				);
// 		}
// 		return errors;
// 	}

// 	public visitIf(stmt: Stmt.If): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		const condExpr = stmt.condition;
// 		errors.push(...this.processExpr(condExpr));
// 		errors.push(...stmt.body.accept(this, []));
// 		if (stmt.elseStmt) {
// 			const elseStmt = stmt.elseStmt;
// 			errors.push(...elseStmt.accept(this, []));
// 		}
// 		return errors;
// 	}

// 	public visitElse(stmt: Stmt.Else): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		// TODO: else if
// 		errors.push(...stmt.body.accept(this, []));
// 		return errors;
// 	}

// 	public visitReturn(stmt: Stmt.Return): string[][] {
// 		// If any value returns process them
// 		if (stmt.value) {
// 			return this.processExpr(stmt.value)
// 		}
// 		return this.checkDiagnosticForNode(stmt);
// 	}

// 	public visitBreak(stmt: Stmt.Break): string[][] {
// 		// Nothing need to do with break in propcesss
// 		// Since label can be defined after break
// 		return this.checkDiagnosticForNode(stmt);
// 	}

// 	public visitContinue(stmt: Stmt.Continue): string[][] {
// 		// Nothing need to do with break in propcesss
// 		// Since label can be defined after break
// 		return this.checkDiagnosticForNode(stmt);
// 	}

// 	public visitSwitch(stmt: Stmt.SwitchStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		errors.push(...this.processExpr(stmt.condition));
// 		// process every case
// 		for (const caseStmt of stmt.cases) {
// 			errors.push(...caseStmt.accept(this, []));
// 		}

// 		return errors;
// 	}

// 	public visitCase(stmt: Stmt.CaseStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		// if is case <experssion>, process every expressions
// 		if (stmt.CaseNode instanceof Stmt.CaseExpr) {
// 			for (const cond of stmt.CaseNode.conditions.getElements()) {
// 				errors.push(...this.processExpr(cond));
// 			}
// 		}
// 		// process every single statement under this case
// 		for (const s of stmt.body) {
// 			errors.push(...s.accept(this, []));
// 		}

// 		return errors;
// 	}

// 	public visitLoop(stmt: Stmt.LoopStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		// loop <expression> body
// 		if (stmt instanceof Stmt.Loop) {
// 			// if any expression
// 			if (stmt.condition) {
// 				for (const expr of stmt.condition.getElements())
// 					errors.push(...this.processExpr(expr));
// 			}
// 			errors.push(...stmt.body.accept(this, []));
// 			return errors;
// 		}

// 		// loop body until <expression>
// 		errors.push(...stmt.body.accept(this, []));
// 		errors.push(...this.processExpr(stmt.condition));
// 		return errors;
// 	}

// 	public visitWhile(stmt: Stmt.WhileStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		errors.push(...this.processExpr(stmt.condition));
// 		errors.push(...stmt.body.accept(this, []));
// 		return errors;
// 	}

// 	public visitFor(stmt: Stmt.ForStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		const id1 = stmt.iter1id.suffixTerm.atom;
// 		const id2 = stmt.iter2id?.suffixTerm.atom;
// 		errors.push(...this.visitIterId(id1, stmt));
// 		if (id2) 
// 			errors.push(...this.visitIterId(id2, stmt));

// 		return errors.concat(stmt.body.accept(this, []));
// 	}

// 	private visitIterId(id1: Atom, stmt: Stmt.ForStmt): string[][] {
// 		const errors: string[][] = [];
// 		if (id1 instanceof SuffixTerm.Invalid) {
// 			errors.push(this.error(
// 				copyRange(id1),
// 				'Expect an Identifier in for iter'
// 			));
// 		}
// 		else {
// 			// parser 已经确保 id1 一定为标识符
// 			const id = id1 as SuffixTerm.Identifier;
// 			// check if iter variable is defined, if not define them
// 			if (!this.currentScoop.resolve(id.token.content)) {
// 				const sym = new variableSymbol(
// 					this.script.uri,
// 					id.token.content,
// 					copyRange(stmt.iter1id),
// 					VarKind.variable,
// 					undefined
// 				);
// 				this.currentScoop.define(sym);
// 			}
// 		}
// 		return errors;
// 	}

// 	public visitTry(stmt: Stmt.TryStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		errors.push(...stmt.body.accept(this, []));
// 		if (stmt.catchStmt) {
// 			errors.push(...stmt.catchStmt.accept(this, []));
// 		}
// 		if (stmt.finallyStmt) {
// 			errors.push(...stmt.finallyStmt.accept(this, []));
// 		}
// 		return errors;
// 	}

// 	public visitCatch(stmt: Stmt.CatchStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		// check if output variable is defined, if not define it
// 		if (!this.currentScoop.resolve(stmt.errors.content)) {
// 			const sym = new VariableSymbol(
// 				this.script.uri,
// 				stmt.errors.content,
// 				copyRange(stmt.errors),
// 				VarKind.variable,
// 				undefined
// 			);
// 			this.currentScoop.define(sym);
// 		}
// 		return errors.concat(stmt.body.accept(this, []));
// 	}

// 	public visitFinally(stmt: Stmt.FinallyStmt): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		return errors.concat(stmt.body.accept(this, []));
// 	}

// 	public visitThrow(stmt: Stmt.Throw): string[][] {
// 		const errors = this.checkDiagnosticForNode(stmt);
// 		return errors.concat(this.processExpr(stmt.expr));
// 	}
// }

class FormatLines {
	public lines: string[][] = [];
	public oneline: string[] = [];
	constructor() {
		this.lines.push(this.oneline);
	}

	get push() {
		return this.oneline.push
	}
	
	/**
	 * print token content to current line. if current is in next line,
	 * generate a new line.
	 * @param cur current Token
	 * @param pre previous Token. if is not passed, cur will be print to current line directly
	 */
	public printToken(cur: Token, pre?: Range) {
		if (!pre) {
			this.oneline.push(cur.content);
			return;
		}
		this.concatString(cur.content, cur, pre);
	}

	public concat<T extends (...args: any) => any>
		(visitor: IStmtVisitor<T>, cur: Stmt.Stmt, pre: Range) {
		const ls = cur.accept(visitor, [] as any) as string[][];
		this.concatString(ls, cur, pre);
	}

	public concatString(s: string | string[][], cur: Range, pre: Range) {
		if (cur.start.line === pre.end.line) {
			const pending = ' '.repeat(cur.start.character - pre.end.character);
			if (pending.length > 0)
				this.oneline.push(pending);
			if (s instanceof Array) {
				this.oneline.push(...s[0]);
				this.lines.push(...s.slice(1));
				this.oneline = this.lines[this.lines.length - 1];
			}
			else
				this.oneline.push(s);
			return;
		}
		this.lines.push(this.oneline);
		if (s instanceof Array) 
			this.lines.push(...s);
		else
			this.lines.push([s]);
		this.oneline = this.lines[this.lines.length - 1];
	}
} 