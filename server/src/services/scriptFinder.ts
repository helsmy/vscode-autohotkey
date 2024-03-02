import { Position, Range } from 'vscode-languageserver';
import * as Decl from '../parser/newtry/parser/models/declaration';
import { NodeBase } from '../parser/newtry/parser/models/nodeBase';
import { NodeConstructor } from '../parser/newtry/parser/models/parseError';
import * as Stmt from '../parser/newtry/parser/models/stmt';
import * as Expr from '../parser/newtry/parser/models/expr';
import { IStmt, IStmtVisitor, RangeSequence, SuffixTermTrailer } from '../parser/newtry/types';
import { DelimitedList } from '../parser/newtry/parser/models/delimtiedList';
import * as SuffixTerm from '../parser/newtry/parser/models/suffixterm';
import { binarySearchRange, posInRange } from '../utilities/positionUtils';
import { TokenType } from '../parser/newtry/tokenizor/tokenTypes';
import { Token } from '../parser/newtry/tokenizor/types';

export class ScriptASTFinder implements IStmtVisitor<(pos:Position, matchType: NodeConstructor[]) => Maybe<IFindResult<NodeBase>>> {
    constructor() {}
    visitDeclVariable(decl: Decl.VarDecl, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(decl.assigns, pos)) {
            const deepMatch = this.searchDelimitedList(decl.assigns, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
        return undefined;
    }
    visitDeclClass(decl: Decl.ClassDef, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(decl.body, pos)) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) {
                const isNeedOutter = deepMatch.nodeResult instanceof Decl.FuncDef ||
                                     deepMatch.nodeResult instanceof Decl.ClassDef
                if (isNeedOutter) {
                    (deepMatch as IFindResult<Decl.ClassDef | Decl.FuncDef>).outterFactor = createResult(decl)
                }
                return deepMatch;
            }
        }
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
        return undefined;
    }
    visitDynamicProperty(decl: Decl.DynamicProperty, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (decl.param && posInRange(decl.param, pos)) {
            const deepMatch = decl.param.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (posInRange(decl.body, pos)) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
        return undefined;
    }
    visitDeclHotkey(decl: Decl.Hotkey, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
    }
    visitDeclHotString(decl: Decl.HotString, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
    }
    visitDeclFunction(decl: Decl.FuncDef, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(decl.params, pos)) {
            const paramMatch = decl.params.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (paramMatch) {
                (<IFindResult<Decl.Parameter>>paramMatch).outterFactor = createResult(decl);
                return paramMatch;
            }
        }
        if (posInRange(decl.body, pos)) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
        return undefined;
    }
    visitDeclParameter(decl: Decl.Param, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(decl.ParamaterList, pos)) {
            const deepMatch = this.searchDelimitedList(decl.ParamaterList, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
        return undefined;
    }
    visitDeclGetterSetter(decl: Decl.GetterSetter, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(decl.body, pos)) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
        return undefined;
    }
    visitDeclLabel(decl: Decl.Label, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(decl, matchType)) return createResult(decl);
    }
    visitStmtInvalid(stmt: Stmt.Invalid, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        return;
    }
    visitDrective(stmt: Stmt.Drective, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.args, pos)) {
            const deepMatch = this.searchDelimitedList(stmt.args, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitBlock(stmt: Stmt.Block, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        // block 如果不在范围内的话会被block的内部的语句返回undefined
        // 这里不用判断在不在范围内
        const deepMatch = this.find(stmt.stmts, ...parameters); 
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitExpr(stmt: Stmt.ExprStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.expression, pos)) {
            const exprMatch = this.searchExpression(stmt.expression, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (stmt.trailerExpr && posInRange(stmt.trailerExpr.exprList, pos)) {
            const exprMatch = this.searchDelimitedList(stmt.trailerExpr.exprList, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitCommandCall(stmt: Stmt.CommandCall, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.args, pos)) {
            const deepMatch = this.searchDelimitedList(stmt.args, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitAssign(stmt: Stmt.AssignStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.left, pos)) {
            const leftMatch = this.searchExpression(stmt.left, ...parameters); 
            if (leftMatch) return leftMatch;
        }
        if (posInRange(stmt.expr, pos)) {
            const exprMatch = this.searchExpression(stmt.expr, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (stmt.trailerExpr && posInRange(stmt.trailerExpr.exprList, pos)) {
            const exprMatch = this.searchDelimitedList(stmt.trailerExpr.exprList, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitIf(stmt: Stmt.If, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.condition, pos)) {
            const exprMatch = this.searchExpression(stmt.condition, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (posInRange(stmt.body, pos)) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (stmt.elseStmt && posInRange(stmt.elseStmt, pos)) {
            const elseMatch = stmt.elseStmt.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ;
            if (elseMatch) return elseMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitElse(stmt: Stmt.Else, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.body, pos)) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitReturn(stmt: Stmt.Return, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        if (stmt.value && posInRange(stmt.value, pos)) {
            const match = this.searchExpression(stmt.value, ...parameters);
            return match ? match : undefined;
        };
    }
    visitBreak(stmt: Stmt.Break, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
    }
    visitContinue(stmt: Stmt.Continue, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
    }
    visitSwitch(stmt: Stmt.SwitchStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.condition, pos)) {
            const exprMatch = this.searchExpression(stmt.condition, ...parameters);; 
            if (exprMatch) return exprMatch;
        }
        // 基于和block同样的理由不做inRange判断
        const deepMatch = this.find(stmt.cases, ...parameters);
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitCase(stmt: Stmt.CaseStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.CaseNode, pos)) {
            if (stmt.CaseNode instanceof Stmt.CaseExpr) {
                const exprMatch = this.searchDelimitedList(stmt.CaseNode.conditions, ...parameters);; 
                if (exprMatch) return exprMatch;
            }
        }
        // 同block
        const deepMatch = this.find(stmt.body, ...parameters);
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitLoop(stmt: Stmt.LoopStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (stmt.condition && posInRange(stmt.condition, pos)) {
            if (stmt.condition instanceof Expr.Expr) {
                const exprMatch = this.searchExpression(stmt.condition, ...parameters);; 
                if (exprMatch) return exprMatch;
            }
            else {
                const exprMatch = this.searchDelimitedList(stmt.condition, ...parameters);; 
                if (exprMatch) return exprMatch;
            }
        }
        if (posInRange(stmt.body, pos)) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitWhile(stmt: Stmt.WhileStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.condition, pos)) {
            const exprMatch = this.searchExpression(stmt.condition, ...parameters);; 
            if (exprMatch) return exprMatch;
        }
        if (posInRange(stmt.body, pos)) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitFor(stmt: Stmt.ForStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.iter1id, pos) && matchNodeTypes(stmt.iter1id, matchType)) {
            return createResult(stmt.iter1id);
        }
        if (stmt.iter2id && posInRange(stmt.iter2id, pos) && matchNodeTypes(stmt.iter2id, matchType)) {
            return createResult(stmt.iter2id);
        }
        if (posInRange(stmt.iterable, pos)) {
            const exprMatch = this.searchExpression(stmt.iterable, ...parameters);; 
            if (exprMatch) return exprMatch;
        }
        if (posInRange(stmt.body, pos)) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitTry(stmt: Stmt.TryStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.body, pos)) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (stmt.catchStmt && posInRange(stmt.catchStmt, pos)) {
            const catchMatch = stmt.catchStmt.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ;
            if (catchMatch) return catchMatch;
        }
        if (stmt.finallyStmt && posInRange(stmt.finallyStmt, pos)) {
            const finallyMatch = stmt.finallyStmt.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ;
            if (finallyMatch) return finallyMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitCatch(stmt: Stmt.CatchStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.body, pos)) {
            // const exprMatch = this.searchExpression(stmt.errors, ...parameters);
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitFinally(stmt: Stmt.FinallyStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (posInRange(stmt.body, pos)) {
            if (posInRange(stmt.body, pos)) {
                const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult<NodeBase>> ; 
                if (deepMatch) return deepMatch;
            }
        }
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        return undefined;
    }
    visitThrow(stmt: Stmt.Throw, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult<NodeBase>> {
        const [pos, matchType] = parameters;
        if (matchNodeTypes(stmt, matchType)) return createResult(stmt);
        if (posInRange(stmt.expr, pos)) {
            const match = this.searchExpression(stmt.expr, ...parameters);
            return match ? match : undefined;
        }
    }
    
    private searchExpression(expr: Expr.Expr, pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult<NodeBase>> {
        if (expr instanceof Expr.Factor) {
            return this.searchSuffixTerm(expr, expr.suffixTerm, pos, matchNodeType);
        }
        else if (expr instanceof Expr.Unary) {
            let deepMatch: Maybe<IFindResult<NodeBase>>;
            if (posInRange(expr.factor, pos))
                deepMatch = this.searchExpression(expr.factor, pos, matchNodeType);
            if (deepMatch) {
                // 如果是 new 表达式，那么返回整个 new 表达式，以便之后分析时能知道是new class()的形式
                if (expr.operator.type === TokenType.new &&
                    // deepMatch.nodeResult should not be in the sub-expression of expr 
                    deepMatch.nodeResult === expr.factor) 
                    return createResult(expr);
                return deepMatch;
            }
            return matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
        }
        else if (expr instanceof Expr.Binary) {
            let deepMatch: Maybe<IFindResult<NodeBase>>;
            if (posInRange(expr.left, pos))
                deepMatch = this.searchExpression(expr.left, pos, matchNodeType);
            if (posInRange(expr.right, pos)) 
                deepMatch = this.searchExpression(expr.right, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
        }
        else if (expr instanceof Expr.Ternary) {
            let deepMatch: Maybe<IFindResult<NodeBase>>;
            if (posInRange(expr.condition, pos))
                deepMatch = this.searchExpression(expr.condition, pos, matchNodeType);
            if (posInRange(expr.trueExpr, pos)) 
                deepMatch = this.searchExpression(expr.trueExpr, pos, matchNodeType);
            if (posInRange(expr.falseExpr, pos)) 
                deepMatch = this.searchExpression(expr.falseExpr, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
        }
        else if (expr instanceof Expr.ParenExpr) {
            const deepMatch = this.searchExpression(expr.expr, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;        
        }
    }

    private searchSuffixTerm(factor: Expr.Factor, term: SuffixTerm.SuffixTerm, pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult<NodeBase>> {
        if (posInRange(term, pos)) {
            const atom = term.atom;
            if (posInRange(atom, pos)) {
                if (atom instanceof SuffixTerm.Invalid) return undefined;
                if (atom instanceof SuffixTerm.ArrayTerm) 
                    return this.searchDelimitedList(atom.items, pos, matchNodeType);
                if (atom instanceof SuffixTerm.AssociativeArray)
                    return this.searchDelimitedList(atom.pairs, pos, matchNodeType);
                // others (Literal, PercentDereference, Identifier) do not need deep search
                return matchNodeTypes(factor, matchNodeType) ? createResult(factor) : undefined;
            }
            return this.bracketsMatch(factor, term.brackets, pos, matchNodeType);
        }

        if (factor.trailer && posInRange(factor.trailer, pos)) {
            const match = binarySearchRange(factor.trailer.suffixTerm.getElements(), pos);
            if (match) {
                return this.searchSuffixTerm(factor, match, pos, matchNodeType);
            } 
            // Temporary fixes on DelimitedList parsering
            // 因为解析的时候会停止在 suffix 不能被继续解析的 delimiter 前
            // check if `pos` is in the range of last delimiter
            const termsList = factor.trailer.suffixTerm.childern;
            // 如果 termList 的最后一项是 undefined 那么说明 termList 是个空列表
            // 此时 最后一个 delimiter 是第一个 dot
            const lastDelimiter = termsList[termsList.length - 1] ?? factor.trailer.dot;
            if (lastDelimiter instanceof Token && posInRange(lastDelimiter, pos)) 
                return matchNodeTypes(factor, matchNodeType) ? createResult(factor) : undefined;
        }
        return undefined;

    }  

    private bracketsMatch(expr: Expr.Factor, brackets: SuffixTermTrailer[], pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult<NodeBase>> {
        const bracketMatch = binarySearchRange(brackets, pos);
        if (!bracketMatch) return matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;

        const nextSearch = bracketMatch instanceof SuffixTerm.Call ? bracketMatch.args : bracketMatch.items;
        const deepMatch = posInRange(nextSearch, pos) ? 
                          this.searchDelimitedList(nextSearch, pos, matchNodeType) : 
                          undefined;
        if (deepMatch) return deepMatch;

        if (bracketMatch && matchNodeTypes(bracketMatch, matchNodeType)) {
            // Instead of return a node of `(args*)`,
            // return a call expression, so that we can know
            // what method or class exactly is called
            if (bracketMatch instanceof SuffixTerm.Call) 
                return createResult(bracketMatch, createResult(expr));
            return createResult(bracketMatch);
        }
    }

    private searchDelimitedList<T extends NodeBase|Token>(list: DelimitedList<T>, pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult<NodeBase>> {
        const match = binarySearchRange(list.getElements(), pos);
        if (match === undefined || match instanceof Token) return undefined;
        // expressions must be unpacked manullay since they are not included in IStmtVisitor
        if (match instanceof Expr.Expr) return this.searchExpression(match, pos, matchNodeType);
        // if item is key-value pair
        if (match instanceof SuffixTerm.Pair) {
            if (posInRange(match.key, pos))
                return this.searchExpression(match.key, pos, matchNodeType);
            if (posInRange(match.value, pos))
                return this.searchExpression(match.value, pos, matchNodeType);
        }
        return matchNodeTypes(match, matchNodeType) ? createResult(match) : undefined;
    }

    public find(ast: IStmt[], pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult<NodeBase>> {
        const match = binarySearchRange(ast, pos);
        if (!match) return undefined;
        const deepMatch = match.accept(this, [pos, matchNodeType]) as Maybe<IFindResult<NodeBase>> ; 
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(match, matchNodeType)) return createResult(match as unknown as NodeBase);
        return undefined;
    }
}

export interface IFindResult<NR extends NodeBase> {
    nodeResult: NR,
    outterFactor?: IFindResult<OutterResult<NR>>
};

type OutterResult<T extends NodeBase> = 
    T extends SuffixTerm.Call ? Expr.Factor :
    T extends Decl.Parameter ? Decl.FuncDef :
    T extends Decl.FuncDef ? Decl.ClassDef :
    T extends Decl.ClassDef ? Decl.ClassDef :
    T extends Expr.Factor ? Expr.Unary :
    never;

type ArrayItem<T extends any[]> = T extends (infer U)[] ? U : never;

function createResult<NR extends NodeBase>(node: NR, outter?: IFindResult<OutterResult<NR>>): IFindResult<NR> {
    return {
        nodeResult: node,
        outterFactor: outter
    };
}

/**
 * If node is instance of one of node types,
 * `[]` type list means for any type
 * @param node AST node
 * @param types node class list
 */
function matchNodeTypes(node: RangeSequence, types: NodeConstructor[]): boolean {
    if (types.length === 0) return true;
    for (const t of types) {
        if (node instanceof t) return true;
    }
    return false;
}

// let start = 0;
// let end = nodes.length - 1;
// while (start <= end) {
//     const mid = Math.floor((start + end) / 2);
//     const node = nodes[mid];
//     // start <= pos
//     const isAfterStart = node.start.line < range.start.line ? true : 
//                             node.start.line === range.start.line ? 
//                                 node.start.character <= range.start.character ? true : 
//                             false : 
//                         false;
//     // end >= pos
//     const isBeforeEnd = node.end.line > range.end.line ? true : 
//                             node.end.line === range.end.line ? 
//                                 node.end.character >= range.end.character ? true : 
//                             false : 
//                         false;
//     if (isAfterStart && isBeforeEnd)
//         return nodes[mid];
//     else if (!isBeforeEnd)
//         start = mid + 1;
//     else
//         end = mid - 1;
// }
// return undefined;