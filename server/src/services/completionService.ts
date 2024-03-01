import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { 
    AHKMethodSymbol, 
    AHKObjectSymbol, 
    BuiltinVaribelSymbol, 
    HotkeySymbol, 
    HotStringSymbol, 
    VaribaleSymbol
 } from '../parser/newtry/analyzer/models/symbol';
import { IScope, ISymbol, VarKind } from '../parser/newtry/analyzer/types';
import { IFuncNode } from '../parser/regParser/types';
import { 
    buildBuiltinCommandNode, 
    buildBuiltinFunctionNode, 
    buildbuiltin_variable, 
    buildKeyWordCompletions, 
    BuiltinFuncNode
 } from '../constants';
import { DocumentSyntaxInfo, IASTProvider } from './types';



export class CompletionService {
    /** Keyword Completions */
    private keywords: CompletionItem[];
    /** Built-in varibles Completions */
    private builtinVaribles: CompletionItem[];
    /** Built-in function Completions */
    private builtinFunction: CompletionItem[];
    /** Built-in command Completions */
    private builtinCommand: CompletionItem[];

    constructor(
        private ASTProvider: IASTProvider
    ) { 
        this.keywords = buildKeyWordCompletions();
        this.builtinVaribles = buildbuiltin_variable();
        this.builtinFunction = this.buildinFunc2Completion(buildBuiltinFunctionNode());
        this.builtinCommand = this.buildinFunc2Completion(buildBuiltinCommandNode());
    }

    private getGlobalCompletion(docinfo: DocumentSyntaxInfo): CompletionItem[] {
        const symbols = docinfo.table.allSymbols();
        let incCompletion: CompletionItem[] = [];
        const incSymbolInfo = docinfo.table.includeSymbols();
        for (const [uri, symbols] of incSymbolInfo) {
            const incPath = URI.file(uri).fsPath;
            incCompletion.push(...symbols.map(node => {
                let c = this.convertSymCompletion(node);
                c.data += '  \nInclude ' + incPath;
                return c;
            }));
        }
        
        return symbols.map(sym => this.convertSymCompletion(sym))
                .concat(this.builtinFunction)
                .concat(this.builtinCommand)
                .concat(incCompletion);
    }

    public getScopedCompletion(uri:string, pos: Position): CompletionItem[] {
        let docinfo = this.ASTProvider.getDocInfo(uri);
        if (!docinfo) return [];
        const scoop = this.getCurrentScoop(pos, docinfo.table);
        const lexems = this.getLexemsAtPosition(pos);
        if (lexems && lexems.length > 1) {
            const perfixs = lexems.reverse();
            const symbol = this.searchPerfixSymbol(perfixs.slice(0, -1), scoop);
            if (!symbol) return [];
            return symbol.allSymbols().map(sym => this.convertSymCompletion(sym));
        }
        if (scoop.name === 'global') return this.getGlobalCompletion(docinfo)
                                    .concat(this.keywords)
                                    .concat(this.builtinVaribles);
        // Now scoop is a method.
        const symbols = scoop.allSymbols();
        return symbols.map(sym => this.convertSymCompletion(sym))
                .concat(this.getGlobalCompletion(docinfo))
                .concat(this.keywords)
                .concat(this.builtinVaribles);
    }
    searchPerfixSymbol(arg0: any, scoop: IScope): Maybe<AHKObjectSymbol> {
        throw new Error('Method not implemented.');
    }
    getLexemsAtPosition(pos: Position): Maybe<string[]> {
        throw new Error('Method not implemented.');
    }
    
    /**
     * Find current position is belonged to which scoop
     * @param pos position of current request
     * @param table symbol table of current document
     * @returns Scoop of current position
     */
    private getCurrentScoop(pos: Position, table: IScope): IScope {
        const symbols = table.allSymbols();
        for (const sym of symbols) {
            if (sym instanceof AHKMethodSymbol || sym instanceof AHKObjectSymbol) {
                if (this.isLessEqPosition(sym.range.start, pos)
                    && this.isLessEqPosition(pos, sym.range.end) ) {
                    return this.getCurrentScoop(pos, sym);
                }
            }
        }
        // no matched scoop return position is belongs to its parent scoop
        return table;
    }

    /**
     * Return if pos1 is before pos2
     * @param pos1 position 1
     * @param pos2 position 2
     */
    private isLessEqPosition(pos1: Position, pos2: Position): boolean {
        if (pos1.line < pos2.line) return true;
        if (pos1.line === pos2.line && pos1.character <= pos2.character) 
            return true;
        return false;
    }

    /**
     * Return if pos1 is after pos2
     * @param pos1 position 1
     * @param pos2 position 2
     */
    private isGreatEqPosition(pos1: Position, pos2: Position): boolean {
        if (pos1.line > pos2.line) return true;
        if (pos1.line === pos2.line && pos1.character >= pos1.character) 
            return true;
        return false;
    }
    
    /**
     * Convert a symbol to comletion item
     * @param sym symbol to be converted
     */
    public convertSymCompletion(sym: ISymbol): CompletionItem {
        let ci = CompletionItem.create(sym.name);
        if (sym instanceof AHKMethodSymbol) {
            ci['kind'] = CompletionItemKind.Method;
            sym.requiredParameters
            ci.data = sym.toString();
        } else if (sym instanceof VaribaleSymbol || sym instanceof BuiltinVaribelSymbol) {
            ci.kind = sym.tag === VarKind.property ? 
                        CompletionItemKind.Property :
                        CompletionItemKind.Variable;
        } else if (sym instanceof AHKObjectSymbol) {
            ci['kind'] = CompletionItemKind.Class;
            ci.data = ''
        } else if (sym instanceof HotkeySymbol || sym instanceof HotStringSymbol) {
            ci['kind'] = CompletionItemKind.Event;
        } else {
            ci['kind'] = CompletionItemKind.Text;
        } 
        return ci;
    }

    private buildinFunc2Completion(nodes: BuiltinFuncNode[]): CompletionItem[] {
        return nodes.map(node => {
            let ci = CompletionItem.create(node.name);
            ci.data = this.getFuncPrototype(node);
            ci.kind = CompletionItemKind.Function;
            return ci;
        });
    }

    /**
     * Returns a string in the form of the function node's definition
     * @param symbol Function node to be converted
     * @param cmdFormat If ture, return in format of command
     */
    private getFuncPrototype(symbol: IFuncNode|BuiltinFuncNode, cmdFormat: boolean = false): string {
        const paramStartSym = cmdFormat ? ', ' : '(';
        const paramEndSym = cmdFormat ? '' : ')'
        let result = symbol.name + paramStartSym;
        symbol.params.map((param, index, array) => {
            result += param.name;
            if (param.isOptional) result += '?';
            if (param.defaultVal) result += ' := ' + param.defaultVal;
            if (array.length-1 !== index) result += ', ';
        })
        return result+paramEndSym;
    }
}
