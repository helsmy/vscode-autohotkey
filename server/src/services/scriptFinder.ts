import { Position, Range } from 'vscode-languageserver';
import * as Decl from '../parser/newtry/parser/models/declaration';
import { NodeBase } from '../parser/newtry/parser/models/nodeBase';
import { NodeConstructor } from '../parser/newtry/parser/models/parseError';
import * as Stmt from '../parser/newtry/parser/models/stmt';
import * as Expr from '../parser/newtry/parser/models/expr';
import { IStmt, IStmtVisitor, RangeSequence, SuffixTermTrailer, Token } from '../parser/newtry/types';
import { DelimitedList } from '../parser/newtry/parser/models/delimtiedList';
import { Call } from '../parser/newtry/parser/models/suffixterm';

export class ScriptASTFinder implements IStmtVisitor<(pos:Position, matchType: NodeConstructor[]) => Maybe<IFindResult>> {
    constructor() {}
    visitDeclVariable(decl: Decl.VarDecl, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(decl.assigns, parameters[0])) {
            const deepMatch = this.searchDelimitedList(decl.assigns, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
        return undefined;
    }
    visitDeclClass(decl: Decl.ClassDef, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(decl.body, parameters[0])) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
        return undefined;
    }
    visitDynamicProperty(decl: Decl.DynamicProperty, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (decl.param && inRange(decl.param, parameters[0])) {
            const deepMatch = decl.param.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (inRange(decl.body, parameters[0])) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
        return undefined;
    }
    visitDeclHotkey(decl: Decl.Hotkey, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
    }
    visitDeclHotString(decl: Decl.HotString, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
    }
    visitDeclFunction(decl: Decl.FuncDef, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(decl.params, parameters[0])) {
            const paramMatch = decl.params.accept(this, parameters) as Maybe<IFindResult>; 
            if (paramMatch) return paramMatch;
        }
        if (inRange(decl.body, parameters[0])) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
        return undefined;
    }
    visitDeclParameter(decl: Decl.Param, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(decl.ParamaterList, parameters[0])) {
            const deepMatch = this.searchDelimitedList(decl.ParamaterList, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
        return undefined;
    }
    visitDeclGetterSetter(decl: Decl.GetterSetter, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(decl.body, parameters[0])) {
            const deepMatch = decl.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
        return undefined;
    }
    visitDeclLabel(decl: Decl.Label, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(decl, parameters[1])) return createResult(decl);
    }
    visitStmtInvalid(stmt: Stmt.Invalid, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        return;
    }
    visitDrective(stmt: Stmt.Drective, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.args, parameters[0])) {
            const deepMatch = this.searchDelimitedList(stmt.args, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitBlock(stmt: Stmt.Block, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        // block 如果不在范围内的话会被block的内部的语句返回undefined
        // 这里不用判断在不在范围内
        const deepMatch = this.find(stmt.stmts, ...parameters); 
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitExpr(stmt: Stmt.ExprStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.expression, parameters[0])) {
            const exprMatch = this.searchExpression(stmt.expression, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (stmt.trailerExpr && inRange(stmt.trailerExpr.exprList, parameters[0])) {
            const exprMatch = this.searchDelimitedList(stmt.trailerExpr.exprList, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitCommandCall(stmt: Stmt.CommandCall, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.args, parameters[0])) {
            const deepMatch = this.searchDelimitedList(stmt.args, ...parameters); 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitAssign(stmt: Stmt.AssignStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.left, parameters[0])) {
            const leftMatch = this.searchExpression(stmt.left, ...parameters); 
            if (leftMatch) return leftMatch;
        }
        if (inRange(stmt.expr, parameters[0])) {
            const exprMatch = this.searchExpression(stmt.expr, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (stmt.trailerExpr && inRange(stmt.trailerExpr.exprList, parameters[0])) {
            const exprMatch = this.searchDelimitedList(stmt.trailerExpr.exprList, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitIf(stmt: Stmt.If, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.condition, parameters[0])) {
            const exprMatch = this.searchExpression(stmt.condition, ...parameters); 
            if (exprMatch) return exprMatch;
        }
        if (inRange(stmt.body, parameters[0])) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (stmt.elseStmt && inRange(stmt.elseStmt, parameters[0])) {
            const elseMatch = stmt.elseStmt.accept(this, parameters) as Maybe<IFindResult>;
            if (elseMatch) return elseMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitElse(stmt: Stmt.Else, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.body, parameters[0])) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitReturn(stmt: Stmt.Return, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        if (stmt.value && inRange(stmt.value, parameters[0])) {
            const match = this.searchExpression(stmt.value, ...parameters);
            return match ? match : undefined;
        };
    }
    visitBreak(stmt: Stmt.Break, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
    }
    visitContinue(stmt: Stmt.Continue, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
    }
    visitSwitch(stmt: Stmt.SwitchStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.condition, parameters[0])) {
            const exprMatch = this.searchExpression(stmt.condition, ...parameters);; 
            if (exprMatch) return exprMatch;
        }
        // 基于和block同样的理由不做inRange判断
        const deepMatch = this.find(stmt.cases, ...parameters);
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitCase(stmt: Stmt.CaseStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.CaseNode, parameters[0])) {
            if (stmt.CaseNode instanceof Stmt.CaseExpr) {
                const exprMatch = this.searchDelimitedList(stmt.CaseNode.conditions, ...parameters);; 
                if (exprMatch) return exprMatch;
            }
        }
        // 同block
        const deepMatch = this.find(stmt.body, ...parameters);
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitLoop(stmt: Stmt.LoopStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (stmt.condition && inRange(stmt.condition, parameters[0])) {
            if (stmt.condition instanceof Expr.Expr) {
                const exprMatch = this.searchExpression(stmt.condition, ...parameters);; 
                if (exprMatch) return exprMatch;
            }
            else {
                const exprMatch = this.searchDelimitedList(stmt.condition, ...parameters);; 
                if (exprMatch) return exprMatch;
            }
        }
        if (inRange(stmt.body, parameters[0])) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitWhile(stmt: Stmt.WhileStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.condition, parameters[0])) {
            const exprMatch = this.searchExpression(stmt.condition, ...parameters);; 
            if (exprMatch) return exprMatch;
        }
        if (inRange(stmt.body, parameters[0])) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitFor(stmt: Stmt.ForStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.iterable, parameters[0])) {
            const exprMatch = this.searchExpression(stmt.iterable, ...parameters);; 
            if (exprMatch) return exprMatch;
        }
        if (inRange(stmt.body, parameters[0])) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitTry(stmt: Stmt.TryStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.body, parameters[0])) {
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (stmt.catchStmt && inRange(stmt.catchStmt, parameters[0])) {
            const catchMatch = stmt.catchStmt.accept(this, parameters) as Maybe<IFindResult>;
            if (catchMatch) return catchMatch;
        }
        if (stmt.finallyStmt && inRange(stmt.finallyStmt, parameters[0])) {
            const finallyMatch = stmt.finallyStmt.accept(this, parameters) as Maybe<IFindResult>;
            if (finallyMatch) return finallyMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitCatch(stmt: Stmt.CatchStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.body, parameters[0])) {
            // const exprMatch = this.searchExpression(stmt.errors, ...parameters);
            const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
            if (deepMatch) return deepMatch;
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitFinally(stmt: Stmt.FinallyStmt, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (inRange(stmt.body, parameters[0])) {
            if (inRange(stmt.body, parameters[0])) {
                const deepMatch = stmt.body.accept(this, parameters) as Maybe<IFindResult>; 
                if (deepMatch) return deepMatch;
            }
        }
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        return undefined;
    }
    visitThrow(stmt: Stmt.Throw, parameters: [pos: Position, matchType: NodeConstructor[]]): Maybe<IFindResult> {
        if (matchNodeTypes(stmt, parameters[1])) return createResult(stmt);
        if (inRange(stmt.expr, parameters[0])) {
            const match = this.searchExpression(stmt.expr, ...parameters);
            return match ? match : undefined;
        }
    }
    
    private searchExpression(expr: Expr.Expr, pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult> {
        if (expr instanceof Expr.Factor) {
            if (expr.trailer && inRange(expr.trailer, pos)) {
                const match = binarySearchNode(expr.trailer.suffixTerm.getElements(), pos);
                if (match) {
                    return this.bracketsMatch(expr, match.brackets, pos, matchNodeType)
                }
                return matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
            }
            return this.bracketsMatch(expr, expr.suffixTerm.brackets, pos, matchNodeType);
        }
        else if (expr instanceof Expr.Unary) {
            let deepMatch: Maybe<IFindResult>;
            if (inRange(expr.factor, pos))
                deepMatch = this.searchExpression(expr.factor, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
        }
        else if (expr instanceof Expr.Binary) {
            let deepMatch: Maybe<IFindResult>;
            if (inRange(expr.left, pos))
                deepMatch = this.searchExpression(expr.left, pos, matchNodeType);
            if (inRange(expr.right, pos)) 
                deepMatch = this.searchExpression(expr.right, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
        }
        else if (expr instanceof Expr.Ternary) {
            let deepMatch: Maybe<IFindResult>;
            if (inRange(expr.condition, pos))
                deepMatch = this.searchExpression(expr.condition, pos, matchNodeType);
            if (inRange(expr.trueExpr, pos)) 
                deepMatch = this.searchExpression(expr.trueExpr, pos, matchNodeType);
            if (inRange(expr.falseExpr, pos)) 
                deepMatch = this.searchExpression(expr.falseExpr, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;
        }
        else if (expr instanceof Expr.ParenExpr) {
            const deepMatch = this.searchExpression(expr.expr, pos, matchNodeType);
            return deepMatch ? deepMatch : matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;        
        }
    }

    private bracketsMatch(expr: Expr.Factor, brackets: SuffixTermTrailer[], pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult> {
        const bracketMatch = binarySearchNode(brackets, pos);
        if (!bracketMatch) return matchNodeTypes(expr, matchNodeType) ? createResult(expr) : undefined;

        const nextSearch = bracketMatch instanceof Call ? bracketMatch.args : bracketMatch.indexs;
        const deepMatch = inRange(nextSearch, pos) ? 
                          this.searchDelimitedList(nextSearch, pos, matchNodeType) : 
                          undefined;
        if (deepMatch) return deepMatch;

        if (bracketMatch && matchNodeTypes(bracketMatch, matchNodeType)) {
            // Instead of return a node of `(args*)`,
            // return a call expression, so that we can know
            // what method or class exactly is called
            if (bracketMatch instanceof Call) 
                return createResult(bracketMatch, expr);
            return createResult(bracketMatch);
        }
    }

    private searchDelimitedList<T extends NodeBase|Token>(list: DelimitedList<T>, pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult> {
        const match = binarySearchNode(list.getElements(), pos);
        if (match === undefined || match instanceof Token) return undefined;
        // expressions must be unpacked manullay since they are not included in IStmtVisitor
        if (match instanceof Expr.Expr) return this.searchExpression(match, pos, matchNodeType);
        return matchNodeTypes(match, matchNodeType) ? createResult(match) : undefined;
    }

    find(ast: IStmt[], pos: Position, matchNodeType: NodeConstructor[]): Maybe<IFindResult> {
        const match = binarySearchNode(ast, pos);
        if (!match) return undefined;
        const deepMatch = match.accept(this, [pos, matchNodeType]) as Maybe<IFindResult>; 
        if (deepMatch) return deepMatch;
        if (matchNodeTypes(match, matchNodeType)) return createResult(match as unknown as NodeBase);
        return undefined;
    }
}

export interface IFindResult {
    nodeResult: NodeBase,
    outterFactor?: Expr.Factor
};

function createResult(node: NodeBase, outter?: Expr.Factor): IFindResult {
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

function inRange(r: Range, pos: Position): boolean {
    // start <= pos
    const isAfterStart = r.start.line < pos.line ? true : 
        r.start.line === pos.line ? 
            r.start.character <= pos.character ? true : 
        false : 
    false;
    // end >= pos
    const isBeforeEnd = r.end.line > pos.line ? true : 
        r.end.line === pos.line ? 
            r.end.character >= pos.character ? true : 
        false : 
    false;
    return isAfterStart && isBeforeEnd;
}

export function binarySearchNode<T extends Range>(nodes: T[], pos: Position): Maybe<T> {
    const index = binarySearchIndex(nodes, pos);
    if (index) return nodes[index];
    return undefined;
}

export function binarySearchIndex<T extends Range>(nodes: T[], pos: Position): Maybe<number> {
    let start = 0;
    let end = nodes.length - 1;
    while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const node = nodes[mid];
        // start <= pos
        const isAfterStart = node.start.line < pos.line ? true : 
                                node.start.line === pos.line ? 
                                    node.start.character <= pos.character ? true : 
                                false : 
                            false;
        // end >= pos
        const isBeforeEnd = node.end.line > pos.line ? true : 
                                node.end.line === pos.line ? 
                                    node.end.character >= pos.character ? true : 
                                false : 
                            false;
        if (isAfterStart && isBeforeEnd)
            return mid;
        else if (!isBeforeEnd)
            start = mid + 1;
        else
            end = mid - 1;
    }
    return undefined;
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