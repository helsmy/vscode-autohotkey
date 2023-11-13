import * as assert from 'assert';
import { Position, SymbolKind } from 'vscode-languageserver-types';
import { IFindResult, ScriptASTFinder } from '../services/scriptFinder';
import { AHKParser } from '../parser/newtry/parser/parser';
import { FuncDef } from '../parser/newtry/parser/models/declaration';
import { Call, Identifier } from '../parser/newtry/parser/models/suffixterm';
import { Factor } from '../parser/newtry/parser/models/expr';

suite('Script Finder Test', () => {
    const ahkFile = `Supper(self, params*)
    {
        upper := new self.base.base(params*)
        for k, v in upper
            if !IsObject(v) 
                self[k] := upper[k]
    }
    
    class A 
    {
        __New(a, b)
        {
            this.a := a
            this.b := b
            return this
        }
    
        mdzz()
        {
            return "mdzz"
        }
    
        x[]
        {
            get {
                return "abc"
            }
        }
    }
    
    class B extends A
    {
        __New(a, b, c)
        {
            Supper(this, a, b) 
            this.c := c
        }

        ans()
        {
            return 42
        }
    } 
    bb := new B(1,2,3)
    bb.ans(abc, 12)
    func1(12, func2("123", "wer"))
    MsgBox, % bb.a
    `;
    let parser = new AHKParser(ahkFile, '');
    const docinfo = parser.parse();
    const finder = new ScriptASTFinder()

    test('find function', () => {
        // let finder = new ScriptFinder([new NodeMatcher('Supper', SymbolKind.Function)], 
        //                             docinfo.tree, 
        //                             'A://virtual.ahk', []);
        let res = finder.find(docinfo.script.stmts, Position.create(6, 5), [FuncDef]);
        assert.ok(res, 'Find Fail');
        assert.strictEqual(res.nodeResult instanceof FuncDef, true, 'Not A function');
        if (res instanceof FuncDef)
            assert.strictEqual(res.nameToken.content, 'Supper', 'Name find fail');;
    });

    test('find Call', () => {
        let res = finder.find(docinfo.script.stmts, Position.create(43, 20), [Call]);
        assert.ok(res, 'Find Fail');
        assert.strictEqual(res.nodeResult instanceof Call, true, 'Not A Call');
        if (res instanceof Factor) {
            assert.strictEqual(res.suffixTerm.atom instanceof Identifier, true, 'Not A Id');
            if (res.suffixTerm.atom instanceof Identifier)
                assert.strictEqual(res.suffixTerm.atom.token.content, 'B');
            assert.strictEqual(res.suffixTerm.brackets[0] instanceof Call, true, 'Not A Call');
        }
        // assert.strictEqual(res.node.name, 'mdzz', 'Name find fail');
        // assert.strictEqual(res.node.kind, SymbolKind.Function, 'Kind find fail');
    });

    test('find Call in Call', () => {
        let res = finder.find(docinfo.script.stmts, Position.create(45, 30), [Call]);
        assert.ok(res, 'Find Fail');
        assert.strictEqual(res.nodeResult instanceof Call, true, 'Not A Call');
        if (res.outterFactor && res.nodeResult instanceof Call) {
            const outter = (<IFindResult<Call>>res).outterFactor;
            assert.strictEqual(outter instanceof Factor, true, 'Not A Factor');
            if (res instanceof Factor && outter !== undefined) {
                assert.strictEqual(outter.nodeResult.suffixTerm.atom instanceof Identifier, true, 'Not A Id');
                if (outter.nodeResult.suffixTerm.atom instanceof Identifier)
                    assert.strictEqual(outter.nodeResult.suffixTerm.atom.token.content, 'func2');
                assert.strictEqual(res.suffixTerm.brackets[0] instanceof Call, true, 'Not A Call');
            }
        }
        // assert.strictEqual(res.node.name, 'mdzz', 'Name find fail');
        // assert.strictEqual(res.node.kind, SymbolKind.Function, 'Kind find fail');
    });

    test('find Method Call', () => {
        let res = finder.find(docinfo.script.stmts, Position.create(44, 18), [Call]);
        // let outter_res = finder.find(docinfo.script.stmts, Position.create(44, 18), [Factor])
        assert.ok(res, 'Find Fail');
        assert.strictEqual(res.nodeResult instanceof Call, true, 'Not A Call');
        if (res.outterFactor) {
            const outter = (<IFindResult<Call>>res).outterFactor;
            if (res instanceof Factor && outter !== undefined) {
                assert.strictEqual(outter.nodeResult.suffixTerm.atom instanceof Identifier, true, 'Not A Id');
                if (outter.nodeResult.suffixTerm.atom instanceof Identifier)
                    assert.strictEqual(outter.nodeResult.suffixTerm.atom.token.content, 'bb');
                assert.strictEqual(outter.nodeResult.suffixTerm.brackets[0] instanceof Call, true, 'Not A Call');
            }
        }
    })

    // test('find var reference', () => {
    //     let finder = new ScriptFinder([
    //         new NodeMatcher('bb'),
    //         new NodeMatcher('ans')
    //     ], docinfo.tree, 
    //     'A://virtual.ahk', []);
    //     let res = finder.find();
    //     assert.ok(res, 'Find Fail');
    //     assert.strictEqual(res.node instanceof FuncNode, true, 'Type fail');
    //     assert.strictEqual(res.node.name, 'ans', 'Name find fail');
    //     assert.strictEqual(res.node.kind, SymbolKind.Function, 'Kind find fail');
    // });
});