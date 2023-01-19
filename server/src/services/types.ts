import { SymbolTable } from '../parser/newtry/analyzer/models/symbolTable';
import { IAST } from '../parser/newtry/types';

export interface DocInfo {
    AST: IAST;
    table: SymbolTable;
}

export interface IASTProvider {
	getDocInfo(uri: string): Maybe<DocInfo>
}