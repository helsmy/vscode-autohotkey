import { SymbolInformation, SymbolKind } from 'vscode-languageserver-types';
import { IScope, ISymbol } from '../types';
import {
	BuiltinTypeSymbol,
	AHKSymbol,
	VariableSymbol,
	AHKMethodSymbol,
	AHKObjectSymbol,
	HotkeySymbol,
	HotStringSymbol,
	LabelSymbol,
} from './symbol';
import { symbolInformations } from './symbolInformationProvider';

/**
 * Interface for workspace-wide symbol lookup
 */
export interface IWorkspaceSymbolProvider {
	findByName(name: string): Array<{uri: string, symbol: AHKSymbol}>;
}

type SymbolMap = Map<string, AHKSymbol>;

/**
 * Symbol Table for the entire AHK file
 * Used for global scope and super global scope
 */
export class SymbolTable implements IScope {
	private symbols: SymbolMap = new Map();
	private labelSymbols: SymbolMap = new Map();
	public readonly name: string;
	private readonly builtinScope: SymbolMap;
	public readonly enclosingScope: Maybe<SymbolTable>;
	public readonly dependcyScope: Set<IScope>;
	private includeTable: Map<string, SymbolTable>;
	public readonly scoopLevel: number;
	public readonly uri: string;

	/**
	 * Workspace-wide symbol provider for fallback resolution
	 */
	private workspaceSymbolProvider?: IWorkspaceSymbolProvider;

	constructor(uri: string, name: string, scoopLevel: number, builtinScope: SymbolMap, enclosingScoop?: Maybe<SymbolTable>) {
		this.uri = uri;
		this.name = name;
		this.scoopLevel = scoopLevel;
		this.enclosingScope = enclosingScoop;
		this.dependcyScope = new Set();
		this.includeTable = new Map();
		this.builtinScope = builtinScope;
		this.initTypeSystem();
	}

	private initTypeSystem() {
		this.define(new BuiltinTypeSymbol('number'));
		this.define(new BuiltinTypeSymbol('string'));
	}

	public define(sym: AHKSymbol) {
		if (!(sym instanceof LabelSymbol))
			this.symbols.set(sym.name.toLowerCase(), sym);
		else
			this.labelSymbols.set(sym.name.toLowerCase(), sym)
	}

	/**
	 * Set the workspace symbol provider for fallback resolution
	 * @param provider Workspace symbol provider
	 */
	public setWorkspaceSymbolProvider(provider: IWorkspaceSymbolProvider): void {
		this.workspaceSymbolProvider = provider;
	}

	public resolve(name: string): Maybe<AHKSymbol> {
		const searchName = name.toLowerCase();

		// 1. Check current file symbols
		let result = this.symbols.get(searchName);
		if (result) return result;

		// 2. Check parent scope
		result = this.enclosingScope?.resolve(searchName);
		if (result) return result;

		// 3. Check include symbol tables
		for (const [uri, table] of this.includeTable) {
			result = table.resolve(searchName);
			if (result) return result;
		}

		// 4. Check builtin symbols
		result = this.builtinScope.get(searchName);
		if (result) return result;

		// 5. Fallback to workspace-wide symbol index
		if (this.workspaceSymbolProvider) {
			const matches = this.workspaceSymbolProvider.findByName(searchName);
			if (matches.length > 0) {
				return matches[0].symbol;
			}
		}

		return undefined;
	}

	public addScope(scoop: IScope) {
		this.dependcyScope.add(scoop);
	}

	public addInclude(table: SymbolTable) {
		this.includeTable.set(table.uri, table);
	}

	public updateInclude(table: SymbolTable) {
		if (this.includeTable.has(table.uri))
			this.includeTable.set(table.uri, table);
	}

	public allSymbols(): ISymbol[] {
		const syms: ISymbol[] = [];
		for (const [name, sym] of this.symbols) 
			syms.push(sym);
		return syms;
	}
	
	/**
	 * return uri and symbol of included files
	 * @returns Map<Uri of file, Symbol list>
	 */
	public includeSymbols(): Map<string, ISymbol[]> {
		let result: Map<string, ISymbol[]> = new Map();
		for (const [uri, include] of this.includeTable) {
			result.set(include.uri, include.allSymbols())
		}
		return result;
	}

	public symbolInformations(): SymbolInformation[] {
		return symbolInformations(this.symbols, this.uri);
	}

	public toString(): string {
		let scope_header = '作用域符号表：';
		let  lines = ['\n', scope_header, '='.repeat(scope_header.length*2)];
		lines.push(`作用域名称: ${this.name}`);
		let symtab_header = '符号表中的内容：';
		lines.push(...['\n', symtab_header, '-'.repeat(scope_header.length*2)]);
		this.symbols.forEach((v, k) => lines.push(`${k}: ${v}`));
		return lines.join('\n');
	}
}
