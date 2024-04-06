import { Position } from 'vscode-languageserver';
import { Factor } from '../../parser/newtry/parser/models/expr';
import { Identifier } from '../../parser/newtry/parser/models/suffixterm';
import {AHKObjectSymbol, AHKSymbol, VariableSymbol } from '../../parser/newtry/analyzer/models/symbol';
import { posInRange } from '../../utilities/positionUtils';
import { IScope, ISymbol, VarKind } from '../../parser/newtry/analyzer/types';
import { builtin_command } from '../../utilities/builtins';
import { CommandCall } from '../../parser/newtry/parser/models/stmt';

export function resolveFactor(factor: Factor, postion: Position, table: IScope): Maybe<AHKSymbol[]> {
    const first = factor.suffixTerm;
    // TODO: Support fake base. eg "String".Method()
    if (!(first.atom instanceof Identifier))
        return undefined;

    // If we are at the position of request position,
    if (posInRange(first.atom, postion)) {
        const symbol = table.resolve(first.atom.token.content);
        if (symbol === undefined) return undefined;
        // If symbol is property decleration in class body
        // 如果是class内直接声明的属性，则将属性的所属class补充完整
        if (symbol instanceof VariableSymbol && symbol.tag === VarKind.property) {
            // Should not happen
            if (!(table instanceof AHKObjectSymbol)) return undefined;
    
            const parents = resolveSubclass(table);
            return parents.concat(symbol);
        }

        return [symbol];
    }
        
    // this is our first candidate for resolve rest symbol
    const scope = resolveRelative(first.atom.token.content, table);
    if (scope === undefined) return undefined;

    let symbols: AHKSymbol[] = [scope];
    if (factor.trailer === undefined) return symbols;
    if (!(scope instanceof AHKObjectSymbol)) return undefined;

    const elements = factor.trailer.suffixTerm.getElements();
    let currentScope = scope;
    for (let i = 0; i < elements.length; i += 1) {
        const suffix = elements[i];
        const isInRange = posInRange(suffix, postion);
        // TODO: 复杂的索引查找，估计不会搞这个，
        // 动态语言的类型推断不会，必不可能搞
        // 条件：任何的一种括号，并且这个括号不是最后一个，以防是在请求括号前的所有标识符
        if (suffix.brackets.length !== 0 && i < elements.length - 1 && !isInRange) return undefined;
        if (!(suffix.atom instanceof Identifier)) return undefined;
        const name = suffix.atom.token.content;
        const symbol = suffix.brackets.length === 0 ?
                       currentScope.resolveProp(name) :
                       currentScope.resolve(name);
        if (symbol === undefined) return undefined;

        // If we are at the position of request position,
        // rest name is needless.
        if (isInRange) {
            symbols.push(symbol);
            return symbols;
        }

        const scope = resolveRelative(suffix.atom.token.content, currentScope);
        if (!(scope instanceof AHKObjectSymbol)) return undefined;
        currentScope = scope;
        // 如果当前的符号是另一个class的实例，那么之前的class信息就没用了
        // 符号之后的属性等只和另一个class有关
        if (scope.name.toLowerCase() !== symbol.name.toLowerCase())
            symbols = [];
        symbols.push(scope);
    }
    return undefined;
}

export function resolveSubclass(object: AHKObjectSymbol) {
    let symbols: AHKSymbol[] = [object];
    let parent: Maybe<IScope> = object.enclosingScope;
    // Find if class is subclass
    while (true) {
        if (parent === undefined || !(parent instanceof AHKObjectSymbol))
            break;
        symbols.unshift(parent);
        parent = parent.enclosingScope;
    }
    return symbols;
}

export function resolveCommandCall(cmd: CommandCall): Maybe<string> {
    const name = cmd.command.content;
    // TODO: match the overload of command
    const find = builtin_command.find(c => c.name.toLowerCase() === name.toLowerCase());

    if (!find) return undefined;

    return `(command) ${find.name}, ${find.params.map(p => p.isOptional ? `${p.name}?` : p.name).join(', ')}`
    
}

function resolveRelative(name: string, scope: IScope): Maybe<AHKSymbol> {
    const sym = scope.resolve(name);
    if (sym instanceof VariableSymbol) {
        const varType = sym.getType();
        // not a instance of class
        if (varType.length === 0) return sym;
        return searchPerfixSymbol(varType, scope);
    }
    return sym;
}

/**
 * Get resolve symbol of a list of prefix(name strings)
 * 寻找prefix数组中的名字字符所指的符号
 * @param prefixs perfix list for search(top scope at first)
 */
export function searchPerfixSymbol(prefixs: string[], scope: IScope): Maybe<AHKObjectSymbol> {
    let nextScope = scope.resolve(prefixs[0]);
    if (!(nextScope && nextScope instanceof AHKObjectSymbol)) return undefined;
    for (const lexem of prefixs.slice(1)) {
        const currentScope: Maybe<ISymbol> = (<AHKObjectSymbol>nextScope).resolveProp(lexem);
        // if (currentScope === undefined) return undefined;
        if (currentScope && currentScope instanceof AHKObjectSymbol) {
            nextScope = currentScope
        }
        else if (currentScope instanceof VariableSymbol) {
            const varType = currentScope.getType();
            // not a instance of class
            if (varType.length === 0) return undefined;
            const referenceScope = searchPerfixSymbol(varType, nextScope as AHKObjectSymbol);
            if (referenceScope === undefined) return undefined;
            nextScope = referenceScope
        }
        else 
            return undefined;
    }
    return nextScope as AHKObjectSymbol;
}

const tridot = '```'