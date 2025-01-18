import { Position } from 'vscode-languageserver/node';
import { SymbolTable } from '../parser/newtry/analyzer/models/symbolTable';
import { IAST } from '../parser/newtry/types';
import { SuffixTerm } from '../parser/newtry/parser/models/suffixterm';

export interface DocumentSyntaxInfo {
    AST: IAST;
    table: SymbolTable;
    callInfomation: ICallInfomation[];
}

export interface IASTProvider {
	getDocInfo(uri: string): Maybe<DocumentSyntaxInfo>
}

export interface ICallInfomation {
    callee: string[],
    parameterPosition: Maybe<Position>[],
    position: Position,
    isCommand: boolean
}