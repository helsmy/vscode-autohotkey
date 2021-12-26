import { Diagnostic } from 'vscode-languageserver-types';
import { Range } from 'vscode-languageserver';
import { TreeVisitor } from './treeVisitor';
import * as Stmt from '../parser/models/stmt';
import * as Decl from '../parser/models/declaration';
import * as Expr from '../parser/models/expr';
import * as SuffixTerm from '../parser/models/suffixterm';
import { SymbolTable } from './models/symbolTable';
import { IExpr, IScript } from '../types';
import { AHKMethodSymbol, AHKObjectSymbol, HotkeySymbol, HotStringSymbol, LabelSymbol, VaribaleSymbol } from './models/symbol';
import { IScoop, VarKind } from './types';
import { TokenType } from '../tokenizor/tokenTypes';

type Diagnostics = Diagnostic[];
interface ProcessResult {
	table: SymbolTable;
	diagnostics: Diagnostics;
}

export class PreProcesser extends TreeVisitor<Diagnostics> {
	private table: SymbolTable;
	private stack: IScoop[];
	private currentScoop: IScoop;

	constructor(
		public readonly script: IScript,
		
	) {
		super();
		this.table = new SymbolTable('global', 1);
		this.stack = [this.table];
		this.currentScoop = this.stack[this.stack.length-1];
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
			diagnostics: errors
		};
	}

	public visitDeclVariable(decl: Decl.VarDecl): Diagnostics {
		const errors: Diagnostics = [];
		const [e, vs] = this.createVarSym(decl.assigns);
		errors.push(...e);
		if (decl.scope.type === TokenType.static) {
			if (!(this.currentScoop instanceof AHKObjectSymbol)) {
				errors.push(
					this.error(
						Range.create(decl.start, decl.end),
						'Static declaration can only be used in class'
					)
				);
			}
			// Define static property of class
			vs.forEach(v => this.currentScoop.define(v));
		}

		// global and local declaration is not allowed in class
		// report errors and return
		if (this.currentScoop instanceof AHKObjectSymbol) 
			return errors;

		// TODO: 变量在local和global上重复定义的问题
		// Define global and local variable
		if (decl.scope.type === TokenType.local) 
			vs.forEach(v => this.currentScoop.define(v));
		else {
			for (const sym of vs) {
				// global declaration in global
				if (this.currentScoop.name === 'global')
					this.table.define(sym);
				const globalSym = this.table.resolve(sym.name);
				// if variable exists in global
				// add it to local, make it visible in local
				if (globalSym)
					this.currentScoop.define(sym);
				// if not add to both
				else {
					this.currentScoop.define(sym);
					this.table.define(sym);
				}
			}
		}
		return errors;
	}

	public visitDeclFunction(decl: Decl.FuncDef): Diagnostics {
		const params = decl.params;
		const reqParams = this.paramAction(params.requiredParameters);
		const dfltParams = this.paramAction(params.optionalParameters);
		const sym = new AHKMethodSymbol(
			this.script.uri,
			decl.nameToken.content,
			copyRange(decl),
			reqParams,
			dfltParams,
			this.table,
			this.currentScoop instanceof AHKObjectSymbol ?
				this.currentScoop : undefined
		);
		// this.supperGlobal.define(sym);
		// this.supperGlobal.addScoop(sym);
		// this.table.define(sym);
		// this.table.addScoop(sym);
		this.currentScoop.define(sym);
		this.currentScoop.addScoop(sym);

		this.enterScoop(sym);
		const errors = decl.body.accept(this, []);
		this.leaveScoop();
		return errors;
	}

	private paramAction(params: Decl.Parameter[]): VaribaleSymbol[] {
		const syms: VaribaleSymbol[] = [];
		for(const param of params) {
			syms.push(new VaribaleSymbol(
				this.script.uri,
				param.identifier.content,
				copyRange(param),
				VarKind.parameter,
				undefined
			));
		}
		return syms;
	}

	public visitDeclClass(decl: Decl.ClassDef): Diagnostics {
		// TODO: parent scoop of class
		const parentScoop = undefined;
		const objTable = new AHKObjectSymbol(
			this.script.uri,
			decl.name.content,
			copyRange(decl),
			parentScoop,
			this.currentScoop
		);
		const errors: Diagnostics = [];
		
		this.currentScoop.define(objTable);
		this.enterScoop(objTable);
		errors.push(... decl.body.accept(this, []));
		this.leaveScoop();
		return errors;
	}

	public visitDeclHotkey(decl: Decl.Hotkey): Diagnostics {
		const name: string = decl.key2 ? 
			decl.key1.key.content + ' & ' + decl.key2.key.content :
			decl.key1.key.content;
		this.table.define(
			new HotkeySymbol(
				this.script.uri,
				name,
				copyRange(decl)
			)
		);
		return [];
	}

	public visitDeclHotString(decl: Decl.HotString): Diagnostics {
		this.table.define(
			new HotStringSymbol(
				this.script.uri,
				decl.str.content,
				copyRange(decl)
			)
		);
		return [];
	}

	public visitDeclLabel(decl: Decl.Label): Diagnostics {
		this.table.define(
			new LabelSymbol(
				this.script.uri,
				decl.name.content,
				copyRange(decl)
			)
		);
		return [];
	}

	public visitStmtInvalid(stmt: Stmt.Invalid): Diagnostics {
		return [];
	}

	public visitDrective(stmt: Stmt.Drective): Diagnostics {
		// Nothing to do in first scanning
		return [];
	}

	public visitBlock(stmt: Stmt.Block): Diagnostics {
		const errors: Diagnostics = [];
		for (const singleStmt of stmt.stmts) {
			const e = singleStmt.accept(this, []);
			errors.push(...e);
		}
		return errors;
	}

	public visitAssign(stmt: Stmt.AssignStmt): Diagnostics {
		const errors: Diagnostics = [];
		errors.push(...this.processAssignVar(stmt.left, stmt));
		errors.push(...this.processExpr(stmt.expr));
		for (const expr of stmt.trailerExpr) {
			errors.push(...this.processExpr(expr));
		}
		return errors;
	}

	public visitExpr(stmt: Stmt.ExprStmt): Diagnostics {
		return this.processExpr(stmt.suffix);
	}

	private processExpr(expr: IExpr): Diagnostics {
		const errors: Diagnostics = [];
		if (expr instanceof Expr.Factor) {
			if (!expr.trailer) {
				const atom = expr.suffixTerm.atom;
				if (atom instanceof SuffixTerm.Identifier && 
					expr.suffixTerm.trailers.length === 0) {
					// Only check varible defination in first scanning
					const idName = atom.token.content;
					if (!this.currentScoop.resolve(idName))
						errors.push(this.error(
							copyRange(atom),
							'Variable is used before defination'
						));
				}
			}
			// TODO: Call and backet identifer check
		}
		else if (expr instanceof Expr.Unary) {
			errors.push(...this.processExpr(expr.factor));
		}
		else if (expr instanceof Expr.Binary) {
			// if contains assign expression
			// check if create a new variable检查是否有新的变量赋值
			if (expr.operator.type === TokenType.aassign &&
				expr.left instanceof Expr.Factor) {
				errors.push(...this.processAssignVar(expr.left, expr));
			}
			else
				errors.push(...this.processExpr(expr.left));
			errors.push(...this.processExpr(expr.right));
		}
		else if (expr instanceof Expr.Ternary) {
			errors.push(...this.processExpr(expr.condition));
			errors.push(...this.processExpr(expr.trueExpr));
			errors.push(...this.processExpr(expr.falseExpr));
		}
		
		return errors;
	}

	private processAssignVar(left: Expr.Factor, fullRange: Range): Diagnostics {
		const id1 = left.suffixTerm.atom;
		const errors: Diagnostics = [];
		if (id1 instanceof SuffixTerm.Identifier) {
			// if only varible 标识符只有一个
			// 就是变量赋值定义这个变量
			if (left.trailer === undefined) {
				const idName = id1.token.content;
				if (!this.currentScoop.resolve(idName)) {
					const kind = this.currentScoop instanceof AHKObjectSymbol ?
								 VarKind.property : VarKind.variable;
					const sym = new VaribaleSymbol(
						this.script.uri,
						idName,
						copyRange(left),
						kind,
						undefined
					);
					this.currentScoop.define(sym);
				}
				return errors;
			}

			// check if assign to a property
			if (id1.token.content === 'this') {
				if (!(this.currentScoop instanceof AHKMethodSymbol &&
					  this.currentScoop.parentScoop instanceof AHKObjectSymbol)) {
					errors.push(Diagnostic.create(
						copyRange(left),
						'Assign a property out of class'
					));
					return errors;
				}
				const trailer = left.trailer;
				if (trailer.trailer === undefined) {
					const prop = trailer.suffixTerm.atom;
					if (prop instanceof SuffixTerm.Identifier) {
						if (!this.currentScoop.parentScoop.resolve(prop.token.content)) {
							const sym = new VaribaleSymbol(
								this.script.uri,
								prop.token.content,
								copyRange(fullRange),
								VarKind.property,
								undefined
							);
							this.currentScoop.parentScoop.define(sym);
						}
					}
					return errors;
				}
			}
		}
		errors.push(Diagnostic.create(
			copyRange(left),
			'Assign to unassignable object'
		))
		return errors;
	}

	public visitIf(stmt: Stmt.If): Diagnostics {
		const condExpr = stmt.condition;
		const errors: Diagnostics = [...this.processExpr(condExpr)];
		errors.push(...stmt.body.accept(this, []));
		if (stmt.elseStmt) {
			const elseStmt = stmt.elseStmt;
			errors.push(...elseStmt.accept(this, []));
		}
		return errors;
	}

	public visitElse(stmt: Stmt.Else): Diagnostics {
		const erorrs: Diagnostics = [];
		// TODO: else if
		erorrs.push(...stmt.body.accept(this, []));
		return erorrs;
	}

	public visitReturn(stmt: Stmt.Return): Diagnostics {
		// If any value returns process them
		if (stmt.value) {
			return this.processExpr(stmt.value)
		}
		return [];
	}

	public visitBreak(stmt: Stmt.Break): Diagnostics {
		// Nothing need to do with break in propcesss
		// Since label can be defined after break
		return [];
	}

	public visitContinue(stmt: Stmt.Continue): Diagnostics {
		// Nothing need to do with break in propcesss
		// Since label can be defined after break
		return [];
	}

	public visitSwitch(stmt: Stmt.SwitchStmt): Diagnostics {
		const errors: Diagnostics = [...this.processExpr(stmt.condition)];
		// process every case
		for (const caseStmt of stmt.cases) {
			errors.push(...caseStmt.accept(this, []));
		}

		return errors;
	}

	public visitCase(stmt: Stmt.CaseStmt): Diagnostics {
		const errors: Diagnostics = [];
		// if is case <experssion>, process every expressions
		if (stmt.CaseNode instanceof Stmt.CaseExpr) {
			for (const cond of stmt.CaseNode.conditions) {
				errors.push(...this.processExpr(cond));
			}
		}
		// process every single statement under this case
		for (const s of stmt.body) {
			errors.push(...s.accept(this, []));
		}

		return errors;
	}

	public visitLoop(stmt: Stmt.LoopStmt): Diagnostics {
		const errors: Diagnostics = [];
		// loop <expression> body
		if (stmt instanceof Stmt.Loop) {
			// if any expression
			if (stmt.condition)
				errors.push(...this.processExpr(stmt.condition));
			errors.push(...stmt.body.accept(this, []));
			return errors;
		}

		// loop body until <expression>
		errors.push(...stmt.body.accept(this, []));
		errors.push(...this.processExpr(stmt.condition));
		return errors;
	}

	public visitWhile(stmt: Stmt.WhileStmt): Diagnostics {
		const errors: Diagnostics = [...this.processExpr(stmt.condition)];
		errors.push(...stmt.body.accept(this, []));
		return errors;
	}

	public visitFor(stmt: Stmt.ForStmt): Diagnostics {
		// check if iter varible is defined, if not define them
		if (!this.currentScoop.resolve(stmt.iter1id.content)) {
			const sym = new VaribaleSymbol(
				this.script.uri,
				stmt.iter1id.content,
				copyRange(stmt.iter1id),
				VarKind.variable,
				undefined
			)
			this.currentScoop.define(sym);
		}
		if (stmt.iter2id && 
			!this.currentScoop.resolve(stmt.iter2id.content)) {
			const sym = new VaribaleSymbol(
				this.script.uri,
				stmt.iter2id.content,
				copyRange(stmt.iter2id),
				VarKind.variable,
				undefined
			)
			this.currentScoop.define(sym);
		}
		return stmt.body.accept(this, []);
	}

	public visitTry(stmt: Stmt.TryStmt): Diagnostics {
		const errors: Diagnostics = [];
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
		// check if output varible is defined, if not define it
		if (!this.currentScoop.resolve(stmt.errors.content)) {
			const sym = new VaribaleSymbol(
				this.script.uri,
				stmt.errors.content,
				copyRange(stmt.errors),
				VarKind.variable,
				undefined
			);
			this.currentScoop.define(sym);
		}
		return stmt.body.accept(this, []);
	}

	public visitFinally(stmt: Stmt.FinallyStmt): Diagnostics {
		return stmt.body.accept(this, []);
	}

	public visitThrow(stmt: Stmt.Throw): Diagnostics {
		return this.processExpr(stmt.expr);
	}

	private enterScoop(scoop: IScoop) {
		this.stack.push(scoop);
		this.currentScoop = scoop;
	}

	private leaveScoop() {
		this.stack.pop();
		this.currentScoop = this.stack[this.stack.length-1];
	}

	private createVarSym(assigns: Decl.OptionalAssginStmt[]): [Diagnostics, VaribaleSymbol[]] {
		const errors: Diagnostics = [];
		const varSym: VaribaleSymbol[] = [];
		for (const assign of assigns) {
			// if there are any assign in variable declaration, 如果scoop声明里有赋值
			if (assign.assign) {
				const kind = this.currentScoop instanceof AHKObjectSymbol ?
							 VarKind.property : VarKind.variable;
				const sym = new VaribaleSymbol(
					this.script.uri,
					assign.identifer.content,
					Range.create(assign.start, assign.end),
					kind,
					undefined
				);
				varSym.push(sym);
			}
		}
		return [errors, varSym];
	}

	private error(range: Range, message: string): Diagnostic {
		return Diagnostic.create(
			range,
			message
		);
	}
} 

function copyRange(r: Range) {
	return Range.create(r.start, r.end);
}