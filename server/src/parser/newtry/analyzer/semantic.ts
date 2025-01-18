import { Diagnostic, Position } from 'vscode-languageserver-types';
import { DiagnosticSeverity, Range } from 'vscode-languageserver';
import { TreeVisitor } from './treeVisitor';
import * as Stmt from '../parser/models/stmt';
import * as Decl from '../parser/models/declaration';
import * as Expr from '../parser/models/expr';
import * as SuffixTerm from '../parser/models/suffixterm';
import { SymbolTable } from './models/symbolTable';
import { Atom, IScript } from '../types';
import { AHKDynamicPropertySymbol, AHKGetterSetterSymbol, AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, HotkeySymbol, HotStringSymbol, LabelSymbol, ParameterSymbol, VariableSymbol } from './models/symbol';
import { IScope, VarKind } from './types';
import { TokenType } from '../tokenizor/tokenTypes';
import { NodeBase } from '../parser/models/nodeBase';
import { MissingToken, SkipedToken, Token } from '../tokenizor/types';
import { ICallInfomation } from '../../../services/types';

type Diagnostics = Diagnostic[];
interface ProcessResult {
	table: SymbolTable;
	callInfomation: ICallInfomation[];
	diagnostics: Diagnostics;
}

export class PreProcesser extends TreeVisitor<Diagnostics> {
	private table: SymbolTable;
	private stack: IScope[];
	private currentScope: IScope;
	private callInfomation: ICallInfomation[];

	constructor(
		public readonly script: IScript,
		builtinScope: Map<string, AHKSymbol>
	) {
		super();
		this.table = new SymbolTable(script.uri, 'global', 1, builtinScope);
		this.stack = [this.table];
		this.currentScope = this.stack[this.stack.length-1];
		this.callInfomation = [];
	}

	public process(): ProcessResult {
		const stmts = this.script.stmts;
		const errors: Diagnostic[] = [];
		for (const stmt of stmts) {
			const error = stmt.accept(this, []);
			errors.push(...error);
		}
		return {
			table: this.table,
			callInfomation: this.callInfomation,
			diagnostics: errors
		};
	}

	public visitDeclVariable(decl: Decl.VarDecl): Diagnostics {
		const errors: Diagnostics = this.checkDiagnosticForNode(decl);
		const [e, vs] = this.createVarSym(decl.assigns);
		errors.push(...e);
		if (decl.scope.type === TokenType.static) {
			if (!(this.currentScope instanceof AHKObjectSymbol) &&
				!(this.currentScope instanceof AHKMethodSymbol)) {
				errors.push(
					this.error(
						Range.create(decl.start, decl.end),
						'Static declaration can only be used in class'
					)
				);
			}
			// Define static property of class
			vs.forEach(v => this.currentScope.define(v));
			return errors;
		}

		// global and local declaration is not allowed in class
		// report errors and return
		if (this.currentScope instanceof AHKObjectSymbol) {
			// TODO: 正确的local和global错误信息
			errors.push(
				this.error(
					Range.create(decl.start, decl.end),
					'global and local are not allowed in class body'
				)
			);
			return errors;
		}

		// TODO: 变量在local和global上重复定义的问题
		// Define global and local variable
		if (decl.scope.type === TokenType.local) 
			vs.forEach(v => this.currentScope.define(v));
		else {
			for (const sym of vs) {
				// global declaration in global
				if (this.currentScope.name === 'global')
					this.table.define(sym);
				const globalSym = this.table.resolve(sym.name);
				// if variable exists in global
				// add it to local, make it visible in local
				if (globalSym)
					this.currentScope.define(sym);
				// if not add to both
				else {
					this.currentScope.define(sym);
					this.table.define(sym);
				}
			}
		}
		return errors;
	}

	public visitDeclFunction(decl: Decl.FuncDef): Diagnostics {
		const errors = this.checkDiagnosticForNode(decl);
		const params = decl.params;
		let isAlreadyVariadic = false;
		for (const param of params.ParamaterList.getElements()) {
			if (isAlreadyVariadic)
				errors.push(this.error(
					copyRange(param),
					'Only last parameter can be variadic.',
					DiagnosticSeverity.Error
				));
			errors.push(...this.checkDiagnosticForNode(param));
			if (param instanceof Decl.DefaultParameter && param.value)
				errors.push(...this.processExpression(param.value));
			if (param instanceof Decl.SpreadParameter)
				isAlreadyVariadic = true;
		}
		const reqParams = this.paramAction(params.requiredParameters);
		const dfltParams = this.paramAction(params.optionalParameters);
		const sym = new AHKMethodSymbol(
			this.script.uri,
			decl.nameToken.content,
			copyRange(decl),
			reqParams,
			dfltParams,
			this.table,
			this.currentScope instanceof AHKObjectSymbol ?
				this.currentScope : undefined
		);
		if (decl.nameToken.comment)
			sym.document = decl.nameToken.comment.content;
		// this.supperGlobal.define(sym);
		// this.supperGlobal.addScoop(sym);
		// this.table.define(sym);
		// this.table.addScoop(sym);
		this.currentScope.define(sym);
		this.currentScope.addScope(sym);

		this.enterScoop(sym);
		errors.push(...decl.body.accept(this, []));
		this.leaveScoop();
		return errors;
	}

	private paramAction(params: Decl.Parameter[]): ParameterSymbol[] {
		const syms: ParameterSymbol[] = [];
		for(const param of params) {
			syms.push(new ParameterSymbol(
				this.script.uri,
				param.identifier.content,
				copyRange(param),
				VarKind.parameter,
				param.byref !== undefined,
				param instanceof Decl.SpreadParameter,
				this.currentScope
			));
		}
		return syms;
	}
	
	public visitDeclClass(decl: Decl.ClassDef): Diagnostics {
		const errors: Diagnostics = this.checkDiagnosticForNode(decl);
		// TODO: parent scoop of class
		const parentScoop = undefined;
		const objTable = new AHKObjectSymbol(
			this.script.uri,
			decl.name.content,
			copyRange(decl),
			parentScoop,
			this.currentScope
		);
		
		this.currentScope.define(objTable);
		this.enterScoop(objTable);
		errors.push(... decl.body.accept(this, []));
		this.leaveScoop();
		return errors;
	}

	public visitPropertyDeclaration(decl: Decl.PropertyDeclaration): Diagnostics {
		const errors: Diagnostics = this.checkDiagnosticForNode(decl);
		for (const e of decl.propertyElements.getElements()) {
			this.processExpression(e);
		}
		return errors;
	}

	public visitDynamicProperty(decl: Decl.DynamicProperty): Diagnostics {
		const errors: Diagnostics = this.checkDiagnosticForNode(decl);
		if (!(this.currentScope instanceof AHKObjectSymbol)) return errors;
		const dynamicProperty = new AHKDynamicPropertySymbol(
			this.script.uri,
			decl.name.content,
			copyRange(decl),
			this.currentScope
		);
		this.currentScope.define(dynamicProperty);

		// ShortDynamicProperty
		if (decl.body instanceof Stmt.ExprStmt) {
			errors.push(...this.checkDiagnosticForNode(decl.body));
			return errors;
		}

		for (const getterSetter of decl.body.stmts) {
			// 虽然基本不可能发生，动态属性里是固定的getter和setter
			if (!(getterSetter instanceof Decl.GetterSetter)) {
				errors.push(...getterSetter.accept(this, []));
				continue;
			}
			const funcType = getterSetter.nameToken.content.toLowerCase();
			const symName = funcType === 'get' ? 'get' : 'set';
			const sym = new AHKGetterSetterSymbol(
				this.script.uri,
				symName,
				decl.name.content,
				copyRange(getterSetter),
				this.currentScope,
				this.table
			)
			dynamicProperty.define(sym);
			this.enterScoop(sym);
			errors.push(...getterSetter.accept(this, []));
			this.leaveScoop();
		}
		return errors;
	}

	public visitDeclGetterSetter(decl: Decl.GetterSetter): Diagnostics {
		// FIXME: finish getter setter function
		return this.checkDiagnosticForNode(decl).concat(decl.body.accept(this, []));
	}

	public visitDeclHotkey(decl: Decl.Hotkey): Diagnostics {
		const key1 = `${decl.key1.modifiers?.content ?? ''}${decl.key1.key.content}`;
		const keyfull = decl.key2 ? `${key1} & ${decl.key2.key.content}`: key1;
		const name = `${keyfull} ${decl.up ? 'UP' : ''}`
		this.table.define(
			new HotkeySymbol(
				this.script.uri,
				name,
				copyRange(decl)
			)
		);
		return this.checkDiagnosticForNode(decl);
	}

	public visitDeclHotString(decl: Decl.HotString): Diagnostics {
		this.table.define(
			new HotStringSymbol(
				this.script.uri,
				decl.str.content,
				copyRange(decl)
			)
		);
		return this.checkDiagnosticForNode(decl);
	}

	public visitDeclLabel(decl: Decl.Label): Diagnostics {
		this.table.define(
			new LabelSymbol(
				this.script.uri,
				decl.name.content,
				copyRange(decl)
			)
		);
		return this.checkDiagnosticForNode(decl);
	}

	public visitStmtInvalid(stmt: Stmt.Invalid): Diagnostics {
		if (!stmt.error)
			return stmt.tokens.flatMap(token => this.checkDiagnosticForUnexpectedToken(token) ?? []);
		const error: Diagnostic = {
			range: copyRange(stmt.error),
			message: stmt.error.message,
			severity: DiagnosticSeverity.Error
		};
		return [error];
	}

	public visitDirective(stmt: Stmt.Directive): Diagnostics {
		// Nothing to do in first scanning
		return this.checkDiagnosticForNode(stmt);
	}

	public visitBlock(stmt: Stmt.Block): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		for (const singleStmt of stmt.stmts) {
			const e = singleStmt.accept(this, []);
			errors.push(...e);
		}
		return errors;
	}

	public visitAssign(stmt: Stmt.AssignStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		const resultType = this.checkExprResultType(stmt.expr);
		errors.push(...this.processAssignVar(stmt.left, stmt, resultType));
		errors.push(...this.processExpression(stmt.expr));
		errors.push(...this.processTrailerExpression(stmt.trailerExpr));
		return errors;
	}

	public visitExpr(stmt: Stmt.ExprStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		errors.push(...this.processExpression(stmt.expression));
		errors.push(...this.processTrailerExpression(stmt.trailerExpr));
		return errors;
	}

	public visitCommandCall(stmt: Stmt.CommandCall): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		for (const arg of stmt.args.getElements()) {
			errors.push(...this.processExpression(arg));
		}
		this.callInfomation.push({
			callee: [stmt.command.content],
			parameterPosition: this.getArgumentPosition(stmt.args.childern),
			position: stmt.start,
			isCommand: true
		});
		return errors;
	}


	private processTrailerExpression(trailer: Maybe<Stmt.TrailerExprList>): Diagnostics {
		const errors: Diagnostics = [];
		if (!trailer) return errors;
		errors.push(...this.checkDiagnosticForNode(trailer));
		for (const expr of trailer.exprList.getElements()) {
			errors.push(...this.processExpression(expr));
		}
		const atom =1
		
		return errors;
	}

	private processExpression(expr: Expr.Expr): Diagnostics {
		const errors = this.checkDiagnosticForNode(expr);
		if (expr instanceof Expr.Factor) {
			const suffix = expr.suffixTerm;
			let termIndex = 0
			const terms = suffix.getElements()
			for (const term of terms) {
				termIndex++;
				const atom = term.atom;
				if (atom instanceof Expr.ParenExpr) {
					if (atom.expr instanceof Expr.Expr)
						errors.push(...this.processExpression(atom.expr))
					else
						for (const e of atom.expr.getElements())
							errors.push(...this.processExpression(e))
				}
				else {
					errors.push(...this.processSuffixTerm(atom));
					for (const bracket of term.brackets)
						errors.push(...this.processSuffixTerm(bracket));
					// Collect call infomation for inlay hint
					if (term.brackets.length !== 1)
						continue;
					const call = term.brackets[0];
					if (!(call instanceof SuffixTerm.Call))
						continue;
					this.getCallInfomation(call, terms.slice(0, termIndex))
				}
			}
		}
		else if (expr instanceof Expr.Unary) {
			errors.push(...this.processExpression(expr.factor));
		}
		else if (expr instanceof Expr.Binary) {
			// if contains assign expression
			// check if create a new variable检查是否有新的变量赋值
			const resultType = this.checkExprResultType(expr.right);
			if (expr.operator.type === TokenType.aassign &&
				expr.left instanceof Expr.Factor) {
				errors.push(...this.processAssignVar(expr.left, expr, resultType));
			}
			else
				errors.push(...this.processExpression(expr.left));
			errors.push(...this.processExpression(expr.right));
		}
		else if (expr instanceof Expr.Ternary) {
			errors.push(...this.processExpression(expr.condition));
			errors.push(...this.processExpression(expr.trueExpr));
			errors.push(...this.processExpression(expr.falseExpr));
		}
		else if (expr instanceof Expr.ParenExpr) {
			if (expr.expr instanceof Expr.Expr)
				errors.push(...this.processExpression(expr.expr));
			else 
				expr.expr.getElements().forEach(e => errors.push(...this.processExpression(e)));
		}
		else if (expr instanceof Expr.AnonymousFunctionCreation) {
			errors.push(...this.processExpression(expr.body));
		}
		else if (expr instanceof Expr.CommandArgumentExpression) {
			errors.push(...this.processExpression(expr.expression));
		}
		
		return errors;
	}

	private getCallInfomation(call: SuffixTerm.Call, calleeInfomation: SuffixTerm.SuffixTerm[]): void {
		let argumentsPosition = this.getArgumentPosition(call.args.childern);

		if (calleeInfomation.find(t => !(t.atom instanceof SuffixTerm.Identifier)))
			return;
		if (calleeInfomation.slice(0, -1).find(t => t.brackets.length > 0))
			return;
		this.callInfomation.push({
			callee: calleeInfomation.map(t => (<SuffixTerm.Identifier>t.atom).token.content),
			parameterPosition: argumentsPosition,
			position: call.start,
			isCommand: false
		});
	}

	private getArgumentPosition(args: (Expr.Expr | Token)[]) {
		let argumentsPosition: Maybe<Position>[] = [];
		for (let i = 0; i < args.length; i++) {
			// If enconter delimiter, got an empty arguments
			if (args[i] instanceof Token) {
				argumentsPosition.push(undefined);
				continue;
			}
			argumentsPosition.push(args[i].start);
			// Skip delimiter
			i++;
		}
		return argumentsPosition;
	}

	/**
	 * Find the result type of an expression.
	 * For temporary usage. Retrieve the class name of a `new classname(.classname)?()` 
	 * @param expr Expression to check
	 */
	private checkExprResultType(expr: Expr.Expr): Maybe<string[]> {
		const isNewClass = expr instanceof Expr.Unary && 
						   expr.operator.type === TokenType.new &&
						   expr.factor instanceof Expr.Factor &&
						   expr.factor.termCount >= 1;
		// v2 syntax python like and `FileOpen()` in v1
		// Case: `f := FileOpen()`
		//        typeof(f) -> File 
		// FIXME: Now only works on `FileOpen()`
		if (expr instanceof Expr.Factor && expr.termCount === 1) {
			const firstTerm = expr.suffixTerm.getElements()[0];
			const brackets = firstTerm.brackets;
			const atom = firstTerm.atom;
			if (!(atom instanceof SuffixTerm.Identifier)) return undefined;
			if (brackets.length > 1) return undefined;
			const trailer = brackets[0];
			if (trailer instanceof SuffixTerm.Call)
				return atom.token.content.toLowerCase() === 'fileopen' ? ['File'] : undefined;
		}
		if (!isNewClass) return undefined;
		
		let objectNames: string[] = [];
		const factor = expr.factor;
		const terms = factor.suffixTerm.getElements();
		for (const term of terms.slice(0, -1)) {
			const atom = term.atom;
			if (!(atom instanceof SuffixTerm.Identifier)) return undefined;
			if (term.brackets.length > 0) return undefined;
			objectNames.push(atom.token.content);
		}

		// does not check calling more than one
		// Too complex for this simple type checker
		const lastTerm = terms[terms.length - 1];
		if (!(lastTerm.atom instanceof SuffixTerm.Identifier)) return undefined;
		const brackets = lastTerm.brackets;
		//  Case 1: `new Object()`
		if (brackets.length === 1) {
			const trailer = brackets[0]
			if (trailer instanceof SuffixTerm.Call)
				return objectNames.concat(lastTerm.atom.token.content);
			return undefined;
		}
		// Case 2: `new Object`
		if (brackets.length === 0) 
			return objectNames.concat(lastTerm.atom.token.content);
		return objectNames;
	}

	private processAssignVar(left: Expr.Factor, fullRange: Range, varType: Maybe<string[]>): Diagnostics {
		const errors = this.checkDiagnosticForNode(left);

		switch (left.termCount) {
			// Assign to variable
			// case: variable := value
			case 1:{
				const firstTerm = left.suffixTerm.getElements()[0];
				if (!(firstTerm.atom instanceof SuffixTerm.Identifier))
					return errors;
				// if only variable 标识符只有一个
				// 就是变量赋值定义这个变量
				if (firstTerm.brackets.length !== 0) 
					return errors;
				const idName = firstTerm.atom.token.content;
				if (!this.currentScope.resolve(idName)) {
					const kind = this.currentScope instanceof AHKObjectSymbol ?
								VarKind.property : VarKind.variable;
					const sym = new VariableSymbol(
						this.script.uri,
						idName,
						copyRange(left),
						kind,
						undefined
					);
					if (varType) sym.setType(varType);
					this.currentScope.define(sym);
				}
				return errors;
			}
			// Assign to property
			// case: this.property := value
			case 2:{
				const firstTerm = left.suffixTerm.getElements()[0];
				if (!(firstTerm.atom instanceof SuffixTerm.Identifier))
					return errors;
				if (firstTerm.brackets.length !== 0) 
					return errors;
				if (firstTerm.atom.token.content.toLowerCase() !== 'this')
					return errors;
				if (!(this.currentScope instanceof AHKMethodSymbol &&
					this.currentScope.parentScope instanceof AHKObjectSymbol)) {
					errors.push(Diagnostic.create(
						copyRange(left),
						'Assign a property out of class'
					));
					return errors;
				}
				const propertyTerm = left.suffixTerm.getElements()[1];
				if (!(propertyTerm.atom instanceof SuffixTerm.Identifier))
					return errors;
				if (propertyTerm.brackets.length !== 0) 
					return errors;
				if (this.currentScope.parentScope.resolve(propertyTerm.atom.token.content)) 
					return errors;
				const sym = new VariableSymbol(
					this.script.uri,
					propertyTerm.atom.token.content,
					copyRange(fullRange),
					VarKind.property,
					undefined
				);
				if (varType) sym.setType(varType);
				this.currentScope.parentScope.define(sym);
			}
		}
		return errors;
	}

	private processSuffixTerm(atom: SuffixTerm.SuffixTermBase): Diagnostics {
		const errors = this.checkDiagnosticForNode(atom);
		errors.push(...this.checkDiagnosticForNode(atom));
		if (atom instanceof SuffixTerm.Invalid) {
			// Non trailer exists when atom is invalid
			return errors.concat(this.error(
				copyRange(atom),
				`${TokenType[atom.token.type]} expect in suffix.`
			));
		}
		if (atom instanceof SuffixTerm.ArrayTerm) {
			for (const iterm of atom.items.getElements()) 
				errors.push(...this.processExpression(iterm));
		}
		else if (atom instanceof SuffixTerm.AssociativeArray) {
			for (const pair of atom.pairs.getElements()) {
				errors.push(...this.processExpression(pair.key));
				errors.push(...this.processExpression(pair.value));
			}
		}
		else if (atom instanceof SuffixTerm.Call) {
			let argumentsPosition: Position[] = [];
			for (const arg of atom.args.getElements()) {
				argumentsPosition.push(arg.start);
				errors.push(...this.processExpression(arg));
			}
		}
		else if (atom instanceof SuffixTerm.Identifier || atom instanceof SuffixTerm.PercentDereference || atom instanceof SuffixTerm.PseudoArray) {
			const idName = atom instanceof SuffixTerm.Identifier ? atom.token : atom.dereferencable;
			if (!this.currentScope.resolve(idName.content)) { 
				errors.push(this.error(
					copyRange(atom),
					`Variable "${idName}" is used before defination`,
					DiagnosticSeverity.Warning
				));
			}
		}
		else 
			atom;

		return errors;
	}

	public visitIf(stmt: Stmt.If): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		const condExpr = stmt.condition;
		errors.push(...this.processExpression(condExpr));
		errors.push(...stmt.body.accept(this, []));
		if (stmt.elseStmt) {
			const elseStmt = stmt.elseStmt;
			errors.push(...elseStmt.accept(this, []));
		}
		return errors;
	}

	public visitElse(stmt: Stmt.Else): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		// TODO: else if
		errors.push(...stmt.body.accept(this, []));
		return errors;
	}

	public visitReturn(stmt: Stmt.Return): Diagnostics {
		// If any value returns process them
		if (stmt.value) {
			return this.processExpression(stmt.value)
		}
		return this.checkDiagnosticForNode(stmt);
	}

	public visitBreak(stmt: Stmt.Break): Diagnostics {
		// Nothing need to do with break in propcesss
		// Since label can be defined after break
		return this.checkDiagnosticForNode(stmt);
	}

	public visitContinue(stmt: Stmt.Continue): Diagnostics {
		// Nothing need to do with break in propcesss
		// Since label can be defined after break
		return this.checkDiagnosticForNode(stmt);
	}

	public visitSwitch(stmt: Stmt.SwitchStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		errors.push(...this.processExpression(stmt.condition));
		// process every case
		for (const caseStmt of stmt.cases) {
			errors.push(...caseStmt.accept(this, []));
		}

		return errors;
	}

	public visitCase(stmt: Stmt.CaseStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		// if is case <experssion>, process every expressions
		if (stmt.CaseNode instanceof Stmt.CaseExpr) {
			for (const cond of stmt.CaseNode.conditions.getElements()) {
				errors.push(...this.processExpression(cond));
			}
		}
		// process every single statement under this case
		for (const s of stmt.body) {
			errors.push(...s.accept(this, []));
		}

		return errors;
	}

	public visitLoop(stmt: Stmt.LoopStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		// loop <expression> body
		if (stmt instanceof Stmt.Loop) {
			// if any expression
			if (stmt.condition) {
				for (const expr of stmt.condition.getElements())
					errors.push(...this.processExpression(expr));
			}
			errors.push(...stmt.body.accept(this, []));
			return errors;
		}

		// loop body until <expression>
		errors.push(...stmt.body.accept(this, []));
		errors.push(...this.processExpression(stmt.condition));
		return errors;
	}

	public visitWhile(stmt: Stmt.WhileStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		errors.push(...this.processExpression(stmt.condition));
		errors.push(...stmt.body.accept(this, []));
		return errors;
	}

	public visitFor(stmt: Stmt.ForStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		const id1 = stmt.iter1id.suffixTerm.getElements()[0];
		const id2 = stmt.iter2id?.suffixTerm.getElements()[0];
		errors.push(...this.visitIterId(id1, stmt));
		if (id2) 
			errors.push(...this.visitIterId(id2, stmt));

		return errors.concat(stmt.body.accept(this, []));
	}

	private visitIterId(oneId: SuffixTerm.SuffixTerm, stmt: Stmt.ForStmt): Diagnostics {
		const errors: Diagnostics = [];
		errors.push(...this.processSuffixTerm(oneId));

		if (errors.length === 0) {
			// 如果没有错误发生, 则parser 已经确保 oneId 一定为标识符
			const id = oneId.atom as SuffixTerm.Identifier;
			// check if iter variable is defined, if not define them
			if (!this.currentScope.resolve(id.token.content)) {
				const sym = new VariableSymbol(
					this.script.uri,
					id.token.content,
					copyRange(stmt.iter1id),
					VarKind.variable,
					undefined
				);
				this.currentScope.define(sym);
			}
		}
		return errors;
	}

	public visitTry(stmt: Stmt.TryStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		errors.push(...stmt.body.accept(this, []));
		if (stmt.catchStmt) {
			errors.push(...stmt.catchStmt.accept(this, []));
		}
		if (stmt.finallyStmt) {
			errors.push(...stmt.finallyStmt.accept(this, []));
		}
		return errors;
	}

	public visitCatch(stmt: Stmt.CatchStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		// check if output variable is defined, if not define it
		if (stmt.errors && !this.currentScope.resolve(stmt.errors.content)) {
			const sym = new VariableSymbol(
				this.script.uri,
				stmt.errors.content,
				copyRange(stmt.errors),
				VarKind.variable,
				undefined
			);
			this.currentScope.define(sym);
		}
		return errors.concat(stmt.body.accept(this, []));
	}

	public visitFinally(stmt: Stmt.FinallyStmt): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		return errors.concat(stmt.body.accept(this, []));
	}

	public visitThrow(stmt: Stmt.Throw): Diagnostics {
		const errors = this.checkDiagnosticForNode(stmt);
		return errors.concat(this.processExpression(stmt.expr));
	}

	private enterScoop(scoop: IScope) {
		this.stack.push(scoop);
		this.currentScope = scoop;
	}

	private leaveScoop() {
		this.stack.pop();
		this.currentScope = this.stack[this.stack.length-1];
	}

	private createVarSym(assigns: Expr.ExpersionList): [Diagnostics, VariableSymbol[]] {
		const errors: Diagnostics = [];
		const varSym: VariableSymbol[] = [];
		for (const assign of assigns.getElements()) {
			errors.push(...this.checkDiagnosticForNode(assign));
			const kind = this.currentScope instanceof AHKObjectSymbol ?
							 VarKind.property : VarKind.variable;

			// if there are any assign in variable declaration, 如果scoop声明里有赋值
			if (assign instanceof Expr.Binary && 
				assign.operator.type === TokenType.aassign &&
				assign.left instanceof Expr.Factor &&
				assign.left.suffixTerm instanceof SuffixTerm.Identifier) {
				const id = assign.left.suffixTerm.token;
				const sym = new VariableSymbol(
					this.script.uri,
					id.content,
					copyRange(id),
					kind,
					undefined
				);
				varSym.push(sym);
				continue;
			}
			// If a variable is decleared
			// `static` variable
			if (assign instanceof Expr.Factor && 
				assign.suffixTerm instanceof SuffixTerm.Identifier) {
				const id = assign.suffixTerm.token;
				if (!this.currentScope.resolve(id.content)) {
					const sym = new VariableSymbol(
						this.script.uri,
						id.content,
						copyRange(id),
						kind,
						undefined
					);
					varSym.push(sym);
					continue;
				}
			}
		}
		return [errors, varSym];
	}
	private checkDiagnosticForNode(node: NodeBase): Diagnostics {
		const errors: Diagnostics = [];
		for (const child of Object.values(node)) {
			if (child instanceof Token) {
				const tokenErr = this.checkDiagnosticForUnexpectedToken(child);
				if (tokenErr) errors.push(tokenErr);
			}
		}
		return errors
	}

	/**
	 * @todo 应该传个node进去，针对不同的语法节点给出不同的错误
	 */
	private checkDiagnosticForUnexpectedToken(token: Token): Maybe<Diagnostic> {
		if (token instanceof MissingToken) 
			return this.error(
				copyRange(token),
				`"${TokenType[token.type]}" expect.`
			)
		if (token instanceof SkipedToken)
			return this.error(
				copyRange(token),
				`Unexpect token "${TokenType[token.type]}".`
			)
		return undefined;
	}

	private error(range: Range, message: string, severity?: DiagnosticSeverity): Diagnostic {
		return Diagnostic.create(
			range,
			message,
			severity ?? DiagnosticSeverity.Error
		);
	}
} 

function copyRange(r: Range) {
	return Range.create(r.start, r.end);
}