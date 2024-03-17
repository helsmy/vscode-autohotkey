import { IScope, ISymbol, ISymType, ModifierKind, VarKind } from '../types';
import { Range, SymbolInformation, SymbolKind } from 'vscode-languageserver/node';

export type AHKClassSymbol = AHKObjectSymbol | AHKBuiltinObjectSymbol;
export type AHKFunctionSymbol = AHKMethodSymbol | AHKBuiltinMethodSymbol;
export type AHKBUiltinSymbol = AHKBuiltinObjectSymbol | AHKBuiltinMethodSymbol | BuiltinVaribelSymbol;

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
		public readonly modifier: ModifierKind = ModifierKind.None,
		type?: Maybe<ISymType>
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
		super(uri, name, range, tag, ModifierKind.None, type)
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
	public readonly uri: string;

	constructor(uri:string, name: string, enclosingScoop?: IScope) {
		super(name);
		this.uri = uri;
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
					sym.range,
					this.uri
				));
			}
			else if (sym instanceof AHKMethodSymbol) {
				info.push(SymbolInformation.create(
					sym.name,
					SymbolKind.Method,
					sym.range,
					this.uri
				));
				info.push(...sym.symbolInformations());
			}
			else if (sym instanceof AHKObjectSymbol) {
				info.push(SymbolInformation.create(
					sym.name,
					SymbolKind.Class,
					sym.range,
					this.uri
				));
				info.push(...sym.symbolInformations());
			}
			else if (sym instanceof HotkeySymbol || sym instanceof HotStringSymbol) {
				info.push(SymbolInformation.create(
					sym.name,
					SymbolKind.Event,
					sym.range,
					this.uri
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
		public readonly requiredParameters: ParameterSymbol[],
		public readonly optionalParameters: ParameterSymbol[],
		enclosingScoop?: IScope
	) {
		super('__Builtin__', name, enclosingScoop);
		this.requiredParameters.forEach(v => this.define(v));
		this.optionalParameters.forEach(v => this.define(v));
	}

	public toString(): string {
		const reqParaStr = this.requiredParameters.map(param => `${param.isByref ? 'byref ' : ''}${param.name}`);
		const optParaStr = this.optionalParameters.map(param => `${param.isByref ? 'byref ' : ''}${param.name}${param.isSpread? '*': '?'}`);
		return `${this.name}(${reqParaStr.concat(optParaStr).join(', ')})`
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
		super('__Builtin__', name, enclosingScoop);
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
		uri: string,
		name: string,
		public readonly range: Range,
		public readonly requiredParameters: ParameterSymbol[],
		public readonly optionalParameters: ParameterSymbol[],
		enclosingScoop?: IScope,
		public readonly parentScoop?: AHKObjectSymbol
	) {
		super(uri, name, enclosingScoop);
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
		uri: string,
		name: string,
		public readonly range: Range,
		parentScoop?: AHKObjectSymbol,
		enclosingScoop?: IScope
	) {
		super(uri, name, enclosingScoop);
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
		for (const s of this.parentScoop.allSymbols()) {
			// Child class' property overwrite parent class'
			if (this.symbols.has(s.name.toLowerCase()))
				continue
			sym.add(s);
		}
		return [...sym];

	}

	public symbolInformations(): SymbolInformation[] {
		let info = super.symbolInformations();
		for (const [name, sym] of this.symbols) {
			if (sym instanceof AHKDynamicPropertySymbol) 
				info.push(...sym.symbolInformations());
		}
		return info;
	}
}

export class AHKDynamicPropertySymbol extends VaribaleSymbol implements IScope {
	public readonly dependcyScope: Set<IScope> = new Set();
	private symbols: Map<string, AHKGetterSetterSymbol> = new Map();
	
	constructor(
		uri: string,
		name: string,
		range: Range,
		public readonly enclosingScope: Maybe<IScope>,

	) {
		super(uri, name, range, VarKind.property, undefined);
	}

	define(sym: AHKGetterSetterSymbol): void {
		this.symbols.set(
			sym.name,
			sym
		);
	}

	resolve(name: string): Maybe<ISymbol> {
		return undefined;
	}
	
	addScope(scope: IScope): void {
		this.dependcyScope.add(scope);
	}
	
	symbolInformations(): SymbolInformation[] {
		const info: SymbolInformation[] = [];
		for (const [name, sym] of this.symbols) {
			info.push(SymbolInformation.create(
				sym.name,
				SymbolKind.Method,
				sym.range,
				sym.uri
			));
			info.push(...sym.symbolInformations());
		}
		return info;
	}
	
	allSymbols(): ISymbol[] {
		return [];
	}
	
	// 返回所有的符号不管是不是getter和setter
	// 用来查找所属的scope
	allSymbolsFull(): ISymbol[] {
		const syms: ISymbol[] = [];
		for (const [, sym] of this.symbols) 
			syms.push(sym);
		return syms
	}
}

export class AHKGetterSetterSymbol extends AHKMethodSymbol {
	constructor(
		uri: string,
		funcType: 'set' | 'get',
		property: string,
		range: Range,
		parentScoop: AHKObjectSymbol,
		enclosingScoop?: IScope
	) {
		const name = `(${funcType}) ${property}`
		super(uri, name, range, [], [], enclosingScoop, parentScoop);
		if (funcType === 'set')
			this.define(
				new BuiltinVaribelSymbol(
					'value',
					VarKind.parameter,
					undefined
				)
			);
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

export function isMethodObject(obj: ISymbol): obj is AHKFunctionSymbol {
	return obj instanceof AHKMethodSymbol || obj instanceof AHKBuiltinMethodSymbol
}

export function isClassObject(obj: ISymbol): obj is AHKClassSymbol {
	return obj instanceof AHKObjectSymbol || obj instanceof AHKBuiltinObjectSymbol
}

export function isBuiltinSymbol(obj: ISymbol): obj is AHKBUiltinSymbol {
	return obj instanceof AHKBuiltinMethodSymbol 
		|| obj instanceof AHKBuiltinObjectSymbol
		|| obj instanceof BuiltinVaribelSymbol
}