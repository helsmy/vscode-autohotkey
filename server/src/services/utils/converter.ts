import { CompletionItem, CompletionItemKind, Hover, MarkupContent, MarkupKind, ParameterInformation, Range, SignatureInformation } from 'vscode-languageserver';
import { AHKBuiltinMethodSymbol, AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, BuiltinVaribelSymbol, HotStringSymbol, HotkeySymbol, VaribaleSymbol } from '../../parser/newtry/analyzer/models/symbol';
import { ISymbol, VarKind } from '../../parser/newtry/analyzer/types';
import { BuiltinFuncNode } from '../../utilities/constants';
import { Parameter } from '../../parser/newtry/parser/models/declaration';

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
    } else if (sym instanceof VaribaleSymbol || sym instanceof BuiltinVaribelSymbol) {
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

    const hover = symbols.map(s => {
        if (s instanceof AHKMethodSymbol || s instanceof AHKBuiltinMethodSymbol)
            return s.toString();
        return s.name;
    }).join('.');
    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: `${AHKMDStart}${prefix}${hover}${AHKMDEnd}`
        },
        range: range
    };
}

function hoverPrefixType(symbol: AHKSymbol): string {
    if (symbol instanceof VaribaleSymbol) 
        return`(${VarKind[symbol.tag]}) `;

    if (symbol instanceof Parameter)
        return '(parameter) '

    if (symbol instanceof AHKMethodSymbol)
        return `(${symbol.parentScoop === undefined ? 'function' : 'method'}) `;

    if (symbol instanceof AHKObjectSymbol) 
        return '(class) ';

    if (symbol instanceof BuiltinVaribelSymbol) 
        return '(variable) ';

    if (symbol instanceof AHKBuiltinMethodSymbol)
        return '(function) ';

    return '';
}

const AHKMDStart = '```autohotkey\n';
const AHKMDEnd   = '\n```';