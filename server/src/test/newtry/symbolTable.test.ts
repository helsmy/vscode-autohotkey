import * as assert from 'assert';
import { Range } from 'vscode-languageserver-types';
import { VariableSymbol } from '../../parser/newtry/analyzer/models/symbol';
import { SymbolTable } from '../../parser/newtry/analyzer/models/symbolTable';
import { ISymType, VarKind } from '../../parser/newtry/analyzer/types';
import { Label } from '../../parser/newtry/parser/models/declaration';
import { Binary, Expr, Factor } from '../../parser/newtry/parser/models/expr';
import * as Stmt from '../../parser/newtry/parser/models/stmt';
import { Identifier, Literal } from '../../parser/newtry/parser/models/suffixterm';
import { AHKParser } from "../../parser/newtry/parser/parser";
import { TokenType } from '../../parser/newtry/tokenizor/tokenTypes';
import { IExpr, IStmt } from '../../parser/newtry/types';
import { Token } from '../../parser/newtry/tokenizor/types';

function getAST(s: string) {
    let parser = new AHKParser(s, 'testFile');
    const AST = parser.parse();
    return AST;
}

function builtTable(AST: IStmt[]): SymbolTable {
    let table = new SymbolTable('', 'global', 1, new Map());
    for (const stmt of AST) {
        if (!(stmt instanceof Stmt.ExprStmt))
            continue;
        const atom = unpackExpr(stmt.expression);
        if (atom === undefined) continue;
        let symType: Maybe<ISymType> = undefined;
        if (atom.type === TokenType.string) {
            symType = table.resolve('string');
        }
        else if (atom.type === TokenType.number) {
            symType = table.resolve('number');
        }
        if (symType === undefined) continue;
        if (!(stmt.expression instanceof Binary))
            continue;
        const lFactor = stmt.expression.left;
        if (!(lFactor instanceof Factor))
            continue
        const latom = lFactor.suffixTerm.getElements()[0];
        if (latom.atom instanceof Identifier) {
            const sym = new VariableSymbol(
                '',
                latom.atom.token.content,
                Range.create(stmt.start, stmt.end),
                VarKind.variable
            );
            table.define(sym);
        }
    }
    return table;
}

function unpackExpr(expr: IExpr): Maybe<Token> {
    if (expr instanceof Factor) {
        const atom = expr.suffixTerm
        if (atom instanceof Literal) {
            return atom.token;
        }
    }
}

suite('Symbol Table Test', () => {
    test('one scoop table', () => {
        const file = `
        a := 1234
        b := "AHK"
        `;
        const AST = getAST(file);
        assert.strictEqual(AST.sytanxErrors.length, 0, 'Syntax error');
        assert.strictEqual(AST.tokenErrors.length, 0, 'token error');
        const stmts = AST.script.stmts;
        const table = builtTable(stmts);
        const stringTable = ["", "",
        "作用域符号表：",
        "==============",
        "作用域名称: global",
        "",
        "",
        "符号表中的内容：",
        "--------------",
        "number: <BuiltinType number>",
        "string: <BuiltinType string>",
        "a: <a: number>",
        "b: <b: string>"].join('\n');
        assert.strictEqual(table.toString(), stringTable);
        
    })
})