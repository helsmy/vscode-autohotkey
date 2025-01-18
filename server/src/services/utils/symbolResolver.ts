import { Position } from 'vscode-languageserver';
import { Factor } from '../../parser/newtry/parser/models/expr';
import { ArrayTerm, Call, Identifier, Literal, PercentDereference, SuffixTerm } from '../../parser/newtry/parser/models/suffixterm';
import {AHKObjectSymbol, AHKSymbol, VariableSymbol } from '../../parser/newtry/analyzer/models/symbol';
import { posInRange } from '../../utilities/positionUtils';
import { IScope, ISymbol, VarKind } from '../../parser/newtry/analyzer/types';
import { builtin_command } from '../../utilities/builtins';
import { CommandCall } from '../../parser/newtry/parser/models/stmt';

export function resolveFactor(factor: Factor, postion: Position, table: IScope): Maybe<AHKSymbol[]> {
    const first = factor.suffixTerm.getElements()[0];
    // TODO: Support fake base. eg "String".Method()
    if (!(first.atom instanceof Identifier))
        return undefined;

    const elements = factor.suffixTerm.getElements();
    let currentScope = table;
    let symbols: AHKSymbol[] = [];
    for (let i = 0; i < elements.length; i += 1) {
        const suffix = elements[i];
        const isInRange = posInRange(suffix, postion);
        // TODO: 复杂的索引查找，估计不会搞这个，
        // 动态语言的类型推断不会，必不可能搞
        // 条件：任何的一种括号，并且这个括号不是最后一个，以防是在请求括号前的所有标识符
        if (suffix.brackets.length !== 0 && i < elements.length - 1 && !isInRange) return undefined;
        if (!(suffix.atom instanceof Identifier)) return undefined;
        const name = suffix.atom.token.content;
        const symbol = (suffix.brackets.length === 0 && currentScope instanceof AHKObjectSymbol) ?
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

/**
 * Find type class symbol of target suffix
 * @param suffix target suffix
 * @param scope current type symbol
 * @param alwaysResolveProp does always take scope as class 
 */
export function resolveSuffixTermSymbol(suffix: SuffixTerm, scope: IScope): Maybe<ISymbol> {
    const { atom, brackets } = suffix;

    // TODO: no type casting on function call for now
    for (const bracket of brackets) {
        if (bracket instanceof Call) return undefined;
    }

    if (atom instanceof Identifier) {
        // factor的第一个符号的类型需要从当前作用域找到
        // 之后的符号的都是类的属性需要用resolveProp
        const sym = scope instanceof AHKObjectSymbol ? 
                    // 懒得写根据参数的类型了就类型断言解决了
                    scope.resolveProp(atom.token.content):
                    scope.resolve(atom.token.content);
        // no more index need to be resolve here
        if (brackets.length === 0) return sym;
        if (!(sym instanceof AHKObjectSymbol)) return undefined
        // resolve rest index
        const bracket = brackets[0];
        // no type casting on complex indexing
        // string index property type finding
        // case: object["property"]
        const { items } = (<ArrayTerm>bracket);
        const firstIndex = items.getElements()[0]
        if (!(firstIndex instanceof Factor)) return undefined;
        if (firstIndex.termCount !== 1) return undefined;
        const firstFactor = firstIndex.suffixTerm.getElements()[0]
        // Only try first string of number
        if (!(firstFactor instanceof Literal)) return undefined;
        return sym.resolveProp(firstFactor.token.content)
    }
    // 不管动态特性
    if (atom instanceof PercentDereference) return undefined;
    // TODO: 字符串和数字的fakebase特性
    // TODO: 数组和关联数组的自带方法
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

export function resolveRelative(name: string, scope: IScope): Maybe<AHKSymbol> {
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
export function searchPerfixSymbol(prefixs: string[], scope: IScope): Maybe<AHKSymbol> {
    // retreive search class symbol
    let nextScope = scope.resolve(prefixs[0]);
    if (!nextScope) return undefined;
    // if only one symbol, this is the final result
    if (prefixs.length === 1) return nextScope;
    if (!(nextScope instanceof AHKObjectSymbol)) return undefined;

    prefixs = prefixs.slice(1);
    for (let i = 0; i < prefixs.length; i++) {
        const lexem = prefixs[i];
        const currentScope: Maybe<ISymbol> = (<AHKObjectSymbol>nextScope).resolveProp(lexem);
        // if (currentScope === undefined) return undefined;
        if (currentScope && currentScope instanceof AHKObjectSymbol) {
            nextScope = currentScope;
            continue;
        }
        if (i >= prefixs.length - 1)
            return currentScope;
        if (currentScope instanceof VariableSymbol) {
            const varType = currentScope.getType();
            // not a instance of class
            if (varType.length === 0) return undefined;
            const referenceScope = searchPerfixSymbol(varType, nextScope as AHKObjectSymbol);
            if (referenceScope === undefined) return undefined;
            nextScope = referenceScope;
            continue;
        }
         
        return undefined;
    }
    // return nextScope as AHKObjectSymbol;
}
