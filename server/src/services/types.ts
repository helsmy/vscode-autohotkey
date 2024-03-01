import { SymbolTable } from '../parser/newtry/analyzer/models/symbolTable';
import { IAST } from '../parser/newtry/types';

export interface DocumentSyntaxInfo {
    AST: IAST;
    table: SymbolTable;
}

export interface IASTProvider {
	getDocInfo(uri: string): Maybe<DocumentSyntaxInfo>
}