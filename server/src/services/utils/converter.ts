import { CompletionItem, CompletionItemKind, Hover, MarkupContent, MarkupKind, ParameterInformation, Position, Range, SignatureInformation } from 'vscode-languageserver';
import { AHKBuiltinMethodSymbol, AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, BuiltinVariableSymbol, HotStringSymbol, HotkeySymbol, VariableSymbol, isClassObject, isMethodObject } from '../../parser/newtry/analyzer/models/symbol';
import { IScope, ISymbol, VarKind } from '../../parser/newtry/analyzer/types';
import { BuiltinFuncNode } from '../../constants';
import { Parameter } from '../../parser/newtry/parser/models/declaration';
import { Factor } from '../../parser/newtry/parser/models/expr';
import { resolveFactor } from './symbolResolver';
import { Call } from '../../parser/newtry/parser/models/suffixterm';

type MarkdownHover = Omit<Hover, 'contents'> & {
    contents: MarkupContent
}

/**
* Returns a string in the form of the function node's definition
* @param symbol Function node to be converted
* @param cmdFormat If ture, return in format of command
*/
export function getFuncPrototype(symbol: BuiltinFuncNode, cmdFormat: boolean = false): string {
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

export function convertBuiltin2Signature(symbols: BuiltinFuncNode[], iscmd: boolean = false): Maybe<SignatureInformation[]> {
    if (symbols.length === 0)
        return undefined;
    const info: SignatureInformation[] = [];
    for (const sym of symbols) {
        const paraminfo: ParameterInformation[] = sym.params.map(param => ({
            label: `${param.name}${param.isOptional ? '?' : ''}${param.defaultVal ? ' = '+param.defaultVal: ''}`
        }))
        info.push(SignatureInformation.create(
            getFuncPrototype(sym, iscmd),
            undefined,
            ...paraminfo
        ))
    }
    return info;
}

/**
 * Convert a symbol to comletion item
 * @param sym symbol to be converted
 */
export function convertSymbolCompletion(sym: ISymbol): CompletionItem {
    let ci = CompletionItem.create(sym.name);
    if (sym instanceof AHKMethodSymbol) {
        ci['kind'] = CompletionItemKind.Method;
        sym.requiredParameters
        ci.data = sym.toString();
    } else if (sym instanceof VariableSymbol || sym instanceof BuiltinVariableSymbol) {
        ci.kind = sym.tag === VarKind.property ? 
                  CompletionItemKind.Property :
                  CompletionItemKind.Variable;
        if (sym.tag === VarKind.parameter)
            ci.detail = '(parameter)';
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

/**
 * Convert AHK Symbol information to Hover
 * @param symbols AHK Symbols information
 * @param range range of current hovered tokenS
 */
export function convertSymbolsHover(symbols: ISymbol[], range: Range): MarkdownHover {
    const last = symbols[symbols.length - 1];
    const prefix = hoverPrefixType(last);
    const docComment = getDocComment(last);

    const hover = symbols.map(s => {
        if (s instanceof AHKMethodSymbol || s instanceof AHKBuiltinMethodSymbol)
            return s.toString();
        return s.name;
    }).join('.');
    const value = `${AHKMDStart}${prefix}${hover}${AHKMDEnd}${docComment ? '\n\n-----\n'+docComment: ''}`;
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: value
        },
        range: range
    };
}

const VarKind2String = ['variable', 'parameter', 'property'];
function hoverPrefixType(symbol: AHKSymbol): string {
    if (symbol instanceof VariableSymbol) 
        return`(${VarKind2String[symbol.tag]}) `;

    if (symbol instanceof Parameter)
        return '(parameter) '

    if (symbol instanceof AHKMethodSymbol)
        return `(${symbol.parentScope === undefined ? 'function' : 'method'}) `;

    if (symbol instanceof AHKObjectSymbol) 
        return '(class) ';

    if (symbol instanceof BuiltinVariableSymbol) 
        return '(variable) ';

    if (symbol instanceof AHKBuiltinMethodSymbol)
        return '(function) ';

    return '';
}
/**
 * Get document comment of a symbol in markdown format.
 */
function getDocComment(symbol: AHKSymbol): Maybe<string> {
    if (!(symbol instanceof AHKMethodSymbol)) return undefined;
    if (!symbol.document) return undefined;

    const docComment: string[] = [];
    // Remove leading and ending character in block comment
    for (const line of symbol.document.split('\n')) {
        const trimedLine = line.trim();
        if (trimedLine.startsWith('/**')) {
            docComment.push(trimedLine.slice(3));
            continue;
        }
        if (trimedLine.endsWith('*/')) {
            docComment.push(trimedLine.slice(0, -2));
            continue;
        }
        if (trimedLine.startsWith('*')) {
            docComment.push(trimedLine.slice(1));
            continue;
        }
        docComment.push(trimedLine);
    }
    // 加一个markdown的换行
    return docComment.join('  \n');
}

export function convertFactorHover(node: Factor, position: Position, scope: IScope, range: Range, v2CompatibleMode: boolean): Maybe<MarkdownHover> {
    const symbols = resolveFactor(node, position, scope);
    if (!symbols) return undefined;

    if (!v2CompatibleMode)
        return convertSymbolsHover(symbols, range);
    const lastSymbol = symbols[symbols.length-1]
    
    if (!isClassObject(lastSymbol))
        return convertSymbolsHover(symbols, range);
    // if is v2 python like class new
    // case: some_instance_prop := class1().prop1
    const firstTerm = node.suffixTerm.getElements()[0];
    if (firstTerm.brackets.length && firstTerm.brackets[0] instanceof Call) {
        const constructor = lastSymbol.resolveProp('__new');
        if (constructor && isMethodObject(constructor)) 
            return convertSymbolsHover(
                symbols.concat(constructor), range
            );
    }

    // if not as normal
    return convertSymbolsHover(symbols, range)
}

export function convertNewClassHover(node: Factor, position: Position, table: IScope, range: Range): Maybe<MarkdownHover> {
    const symbol = resolveFactor(node, position, table);
    if (!symbol) return undefined;
    // 当hover的位置不在最后一个term时，
    // 就是在请求类构造器前面的upper class
    // 应该直接返回查找到的symbol
    if (symbol.length < node.termCount)
        return convertSymbolsHover(symbol, range);

    const last = lastItem(symbol);
    // 查找类构造器
    if (isClassObject(last)) {
        const constructor = last.resolveProp('__new');
        if (constructor instanceof AHKMethodSymbol) 
            return convertSymbolsHover(
                symbol.concat(constructor), range
            );
    }
}

function lastItem<T>(a: T[]): T {
    return a[a.length-1]
}

const AHKMDStart = '```autohotkey\n';
const AHKMDEnd   = '\n```';