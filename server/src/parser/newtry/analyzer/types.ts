import { SymbolInformation } from 'vscode-languageserver-types';

export interface IScope {
	readonly name: string;
	/**
	 * Find its parent scope
	 */
	readonly enclosingScope: Maybe<IScope>;

	/**
	 * Scopes belongs to this scope
	 */
	readonly dependcyScope: Set<IScope>;

	/**
	 * File URI that this scope is belonged to
	 */
	readonly uri: string
	/**
	 * Define a symbol
	 */
	define(sym: ISymbol): void;
	/**
	 * Find a symbol
	 */
	resolve(name: string): Maybe<ISymbol>;
	/**
	 * Add a scope belongs to this scope
	 * @param scope Scoop tabel to be added
	 */
	addScope(scope: IScope): void;
	/**
	 * convert symbol to lsp SymbolInfomation
	 */
	symbolInformations(): SymbolInformation[];
	/**
	 * get all symbols of this scoop
	 */
	allSymbols(): ISymbol[]
}

export interface ISymbol {
	readonly name: string;
	readonly type: Maybe<ISymType>;
}

// Just marking object is a type
export interface ISymType {
	readonly name: string;
}

export enum VarKind {
	variable,
	parameter,
	property
}

export enum ScoopKind {
	SupperGlobal,
	Global,
	Local
}

export enum ModifierKind {
	None,
	Global,
	Local,
	Static
}