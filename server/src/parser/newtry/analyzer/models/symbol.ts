import { IScope, ISymbol, ISymType, VarKind } from '../types';
import { Range, SymbolInformation, SymbolKind } from 'vscode-languageserver';

type AHKClassSymbol = AHKObjectSymbol | AHKBuiltinObjectSymbol;

export abstract class AHKSymbol implements ISymbol {
	public readonly name: string;
	public readonly type: Maybe<ISymType>;
	constructor(name: string, type?: ISymType) {
		this.name = name;
		this.type = type;
	}
}

export class BuiltinVaribelSymbol extends AHKSymbol {
	constructor(
		public readonly name: string,
		public readonly tag: VarKind,
		type: Maybe<ISymType>
	) {
		super(name, type);
	}

	toString(): string {
		return this.type !== undefined ?
			`<${this.name}: ${this.type.name}>` :
			`<Variable ${this.name}>`;
	}
}

export class VaribaleSymbol extends AHKSymbol {

	/**
	 * Temporary type marking for current usage
	 * (one scan semantic parser)
	 */
	private tempType: string[] = [];

	/**
	 * @param name Name of a variable
	 * @param range Range of its defined area
	 * @param tag Kind of this variable
	 * @param type Type of this variable
	 */
	constructor(
		public readonly uri: string,
		public readonly name: string,
		public readonly range: Range,
		public readonly tag: VarKind,
		type: Maybe<ISymType>
	) {
		super(name, type);
	}

	public setType(t: string[]) {
		this.tempType = t;
	}

	public getType(): string[] {
		return this.tempType;
	}
 
	toString(): string {
		return this.type !== undefined ?
			`<${this.name}: ${this.type.name}>` :
			`<Variable ${this.name}>`;
	}
}

export class ParameterSymbol extends VaribaleSymbol {
	constructor(
		uri: string, name: string, range: Range, tag: VarKind,
		public readonly isByref: boolean,
		public readonly isSpread: boolean, 
		type?: ISymType
	) {
		super(uri, name, range, tag, type)
	}
}

export class HotkeySymbol extends AHKSymbol {
	constructor(
		public readonly uri: string,
		name: string,
		public readonly range: Range
	) {
		super(name);
	}

	toString(): string {
		return `<Hotkey ${this.name}>`
	}
}

export class HotStringSymbol extends AHKSymbol {
	constructor(
		public readonly uri: string,
		name: string,
		public readonly range: Range
	) {
		super(name);
	}

	toString(): string {
		return `<HotString ${this.name}>`
	}
}

export class LabelSymbol extends AHKSymbol {
	constructor(
		public readonly uri: string,
		name: string,
		public readonly range: Range
	) {
		super(name);
	}

	toString(): string {
		return `<Label ${this.name}>`
	}
}

export class BuiltinTypeSymbol extends AHKSymbol implements ISymType {
	constructor(name: string) {
		super(name)
	}

	toString(): string {
		return `<BuiltinType ${this.name}>`
	}
}

export abstract class ScopedSymbol extends AHKSymbol implements IScope {
	protected symbols: Map<string, AHKSymbol> = new Map();
	public readonly enclosingScope: Maybe<IScope>;
	public readonly dependcyScope: Set<IScope>;

	constructor(name: string, enclosingScoop?: IScope) {
		super(name);
		this.enclosingScope = enclosingScoop;
		this.dependcyScope = new Set();
	}

	public define(sym: ISymbol): void {
		this.symbols.set(sym.name.toLowerCase(), sym);
	}

	public resolve(name: string): Maybe<ISymbol> {
		const searchName = name.toLocaleLowerCase();
		if (this.symbols.has(searchName))
			return this.symbols.get(searchName);
		return this.enclosingScope?.resolve(searchName);
	}

	public addScope(scoop: IScope) {
		this.dependcyScope.add(scoop);
	}

	public allSymbols(): ISymbol[] {
		const syms: ISymbol[] = [];
		for (const [, sym] of this.symbols) 
			syms.push(sym);
		return syms
	}

	public symbolInformations(): SymbolInformation[] {
		const info: SymbolInformation[] = [];
		for (const [name, sym] of this.symbols) {
			if (sym instanceof VaribaleSymbol && sym.tag !== VarKind.parameter) {
				const kind = sym.tag === VarKind.variable ? SymbolKind.Variable : SymbolKind.Property 
				info.push(SymbolInformation.create(
					sym.name,
					kind,
					sym.range
				));
			}
			else if (sym instanceof AHKMethodSymbol) {
				info.push(SymbolInformation.create(
					sym.name,
					SymbolKind.Method,
					sym.range
				));
				info.push(...sym.symbolInformations());
			}
			else if (sym instanceof AHKObjectSymbol) {
				info.push(SymbolInformation.create(
					sym.name,
					SymbolKind.Class,
					sym.range
				));
				info.push(...sym.symbolInformations());
			}
			else if (sym instanceof HotkeySymbol || sym instanceof HotStringSymbol) {
				info.push(SymbolInformation.create(
					sym.name,
					SymbolKind.Event,
					sym.range
				));
			}
			else
				continue;
		}

		return info;
	}
}

export class AHKBuiltinMethodSymbol extends ScopedSymbol {
	constructor(
		name: string,
		public readonly requiredParameters: VaribaleSymbol[],
		public readonly optionalParameters: VaribaleSymbol[],
		enclosingScoop?: IScope
	) {
		super(name, enclosingScoop);
		this.initParameters();
	}

	private initParameters() {
		this.requiredParameters.forEach(v => this.define(v));
		this.optionalParameters.forEach(v => this.define(v));
	}
}

export class AHKBuiltinObjectSymbol extends ScopedSymbol implements ISymType {
	/**
	 * @param name Name of class symbol
	 * @param parentScoop parent class
	 * @param enclosingScoop parent scoop
	 */
	constructor(
		name: string,
		public readonly parentScoop: Maybe<AHKObjectSymbol>,
		enclosingScoop?: IScope
	) {
		super(name, enclosingScoop);
	}

	/**
	 * Lookup property symbol of a class
	 * @param name Property symbol name
	 */
	resolveProp(name: string): Maybe<ISymbol> {
		const searchName = name.toLocaleLowerCase();
		if (this.symbols.has(searchName))
			return this.symbols.get(searchName);
		return this.parentScoop?.resolve(searchName);
	}
}

export class AHKMethodSymbol extends ScopedSymbol {
	constructor(
		public readonly uri: string,
		name: string,
		public readonly range: Range,
		public readonly requiredParameters: ParameterSymbol[],
		public readonly optionalParameters: ParameterSymbol[],
		enclosingScoop?: IScope,
		public readonly parentScoop?: AHKObjectSymbol
	) {
		super(name, enclosingScoop);
		this.initParameters();
	}

	private initParameters() {
		this.requiredParameters.forEach(v => this.define(v));
		this.optionalParameters.forEach(v => this.define(v));
	}

	public resolve(name: string): Maybe<ISymbol> {
		// find implicit this
		if (name.toLowerCase() === 'this' && !this.symbols.has('this')) {
			return this.parentScoop;
		}
		return super.resolve(name);
	}

	public toString(): string {
		const reqParaStr = this.requiredParameters.map(param => `${param.isByref ? 'byref ' : ''}${param.name}`);
		const optParaStr = this.optionalParameters.map(param => `${param.isByref ? 'byref ' : ''}${param.name}${param.isSpread? '*': '?'}`);
		return `${this.name}(${reqParaStr.concat(optParaStr).join(', ')})`
	}
}


export class AHKObjectSymbol extends ScopedSymbol implements ISymType {

	public readonly parentScoop: AHKClassSymbol;
	/**
	 * @param name Name of class symbol
	 * @param range range of symbol
	 * @param parentScoop parent class
	 * @param enclosingScoop parent scoop
	 */
	constructor(
		public readonly uri: string,
		name: string,
		public readonly range: Range,
		parentScoop?: AHKObjectSymbol,
		enclosingScoop?: IScope
	) {
		super(name, enclosingScoop);
		// All object is extended from Base object
		this.parentScoop = parentScoop ?? new AHKBaseObject(); 
	}

	/**
	 * Lookup property symbol of a class
	 * @param name Property symbol name
	 */
	public resolveProp(name: string): Maybe<ISymbol> {
		const searchName = name.toLocaleLowerCase();
		if (this.symbols.has(searchName))
			return this.symbols.get(searchName);
		return this.parentScoop.resolveProp(searchName);
	}

	public allSymbols(): ISymbol[] {
		let sym = new Set(super.allSymbols());
		for (const s of this.parentScoop.allSymbols()) 
			sym.add(s);
		return [...sym];

	}
}

export class AHKBaseObject extends AHKBuiltinObjectSymbol {
	constructor() {
		super('base', undefined);
		this.define(new BuiltinVaribelSymbol('__Class', VarKind.property, undefined));
		for (const name of ['__New', '__Delete', '__Init'])
			this.define(new AHKBuiltinMethodSymbol(name, [], []));
	}
}