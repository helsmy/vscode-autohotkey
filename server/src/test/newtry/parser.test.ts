import * as assert from 'assert';
import { AHKParser } from "../../parser/newtry/parser/parser";
// import { Tokenizer } from "../../parser/newtry/tokenizer";
import { Atom, IExpr, IScript, SuffixTermTrailer } from "../../parser/newtry/types";
import { TokenType } from "../../parser/newtry/tokenizor/tokenTypes";
import * as Expr from '../../parser/newtry/parser/models/expr';
import * as SuffixTerm from '../../parser/newtry/parser/models/suffixterm';
import * as Decl from '../../parser/newtry/parser/models/declaration';
import * as Stmt from '../../parser/newtry/parser/models/stmt';
import { PreProcesser } from '../../parser/newtry/analyzer/semantic';

function getExpr(s: string, v2mode = false) {
    const p = new AHKParser(s, '', v2mode);
    return p.testExpr();
}

interface IAtomTestItem {
    source: string;
    type: TokenType;
    literal: any;
}

function AtomTestItem(source: string, type: TokenType, literal: any): IAtomTestItem {
    return {
        source: source,
        type: type,
        literal: literal
    };
}

function atomUnpackTest(value: IExpr, testFunc: (atom: Atom) => void) {
    assert.strictEqual(value instanceof Expr.Factor, true);
    if (value instanceof Expr.Factor) {
        for (const term of value.suffixTerm.getElements()) {
            assert.strictEqual(term.brackets.length, 0);
            testFunc(term.atom);
        }
    }
};

function arrayUnpackTest(value: IExpr, testFunc: (atom: Atom, index: number) => void) {
    atomUnpackTest(value, arrayTerm => {
        assert.strictEqual(arrayTerm instanceof SuffixTerm.ArrayTerm, true);
        if (arrayTerm instanceof SuffixTerm.ArrayTerm) {
            let i = 0;
            for (const item of arrayTerm.items.getElements()) {
                atomUnpackTest(item, atom => {
                    testFunc(atom, i);
                });
                i++;
            }
        }
    });
}

function aarrayUnpackTest(value: IExpr,
    testKeyFunc: (atom: Atom, index: number) => void,
    testValueFunc: (atom: Atom, index: number) => void) {
    atomUnpackTest(value, aarray => {
        assert.strictEqual(aarray instanceof SuffixTerm.AssociativeArray, true);
        if (aarray instanceof SuffixTerm.AssociativeArray) {
            let i = 0;
            for (const pair of aarray.pairs.getElements()) {
                atomUnpackTest(pair.key, atom => {
                    testKeyFunc(atom, i);
                });
                atomUnpackTest(pair.value, atom => {
                    testValueFunc(atom, i);
                });
                i++;
            }
        }
    });
}

function factorUpackTest(
    value: IExpr,
    atomTest: (atom: Atom) => void,
    ...trailerTests: ((trailer: SuffixTermTrailer) => void)[]
) {
    assert.strictEqual(value instanceof Expr.Factor, true);
    if (value instanceof Expr.Factor) {
        const first = value.suffixTerm.getElements()[0];
        assert.strictEqual(trailerTests.length, first.brackets.length);
        atomTest(first.atom);

        for (let i = 1; i < first.brackets.length; i += 1) {
            trailerTests[i](first.brackets[i]);
        }

    }
};

interface ICallTest {
    source: string;
    callee: string;
    args: Function[];
  }

function callTest(
    source: string,
    callee: string,
    args: Constructor<SuffixTerm.SuffixTermBase>[],
): ICallTest {
    return { source, callee, args };
}  

suite('Syntax Parser Expresion Test', () => {
    test('basic valid literal', () => {
        const expects = [
            AtomTestItem('15', TokenType.number, '15'),
            AtomTestItem('1.234', TokenType.number, '1.234'),
            AtomTestItem('"Test string"', TokenType.string, '"Test string"'),
            AtomTestItem('"true if until"', TokenType.string, '"true if until"')
        ];
        for (const expect of expects) {
            const actuals = getExpr(expect.source);

            atomUnpackTest(actuals, atom => {
                assert.strictEqual(atom instanceof SuffixTerm.Literal, true);
                if (atom instanceof SuffixTerm.Literal) {
                    assert.strictEqual(atom.token.type, expect.type);
                    assert.strictEqual(atom.token.content, expect.literal);
                }
            });
        }
    });

    // test('basic invalid literal', () => {

    // });

    test('basic valid expression', () => {
        const actual = getExpr('a:=1+3*2-12/3');
        assert.strictEqual(actual instanceof Expr.Binary, true);
        assert.strictEqual(actual.toString(), 'a := 1 + 3 * 2 - 12 / 3');
    });

    test('basic valid `=` assign', () => {
        const file = `w:=Format("{:d}",w), CutUp:=CutDown:=0
        re1=(^0{%w%}|^1{%w%})
        re2=(0{%w%}$|1{%w%}$)`
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.sytanxErrors.length, 0, 'Enconter Parser error');
    })

    test('operator eol', () => {
        const actuals = getExpr(`123
        
        + 99`);
        assert.strictEqual(actuals instanceof Expr.Binary, true);
        if (actuals instanceof Expr.Binary) {
            atomUnpackTest(actuals.left, atom => {
                assert.strictEqual(atom instanceof SuffixTerm.Literal, true);
                if (atom instanceof SuffixTerm.Literal) {
                    assert.strictEqual(atom.token.content, '123');
                }
            });
            assert.strictEqual(actuals.operator.type, TokenType.plus);
            atomUnpackTest(actuals.right, atom => {
                assert.strictEqual(atom instanceof SuffixTerm.Literal, true);
                if (atom instanceof SuffixTerm.Literal) {
                    assert.strictEqual(atom.token.content, '99');
                }
            });
        }
    });

    test('postfix operator', () => {
        const actuals = getExpr('a+++10');
        assert.strictEqual(actuals instanceof Expr.Binary, true);
        if (actuals instanceof Expr.Binary) {
            assert.strictEqual(actuals.left instanceof Expr.Unary, true);
            if (actuals.left instanceof Expr.Unary) {
                factorUpackTest(actuals.left.factor, atom => {
                    assert.strictEqual(atom instanceof SuffixTerm.Identifier, true);
                    if (atom instanceof SuffixTerm.Identifier) {
                        assert.strictEqual(atom.token.content, 'a');
                    }
                });
                assert.strictEqual(actuals.left.operator.type, TokenType.pplus);
            }
            assert.strictEqual(actuals.operator.type, TokenType.plus);
            atomUnpackTest(actuals.right, atom => {
                assert.strictEqual(atom instanceof SuffixTerm.Literal, true);
                if (atom instanceof SuffixTerm.Literal) {
                    assert.strictEqual(atom.token.content, '10');
                }
            });
        }
    });

    test('basic array', () => {
        const expects = [
            AtomTestItem('1', TokenType.number, '1'),
            AtomTestItem('1.234', TokenType.number, '1.234'),
            AtomTestItem('"AHKL"', TokenType.string, '"AHKL"')
        ];
        const actuals = getExpr('[1, 1.234, "AHKL"]');
        arrayUnpackTest(actuals, (item, index) => {
            assert.strictEqual(item instanceof SuffixTerm.Literal, true);
            if (item instanceof SuffixTerm.Literal) {
                assert.strictEqual(expects[index].type, item.token.type);
                assert.strictEqual(expects[index].literal, item.token.content);
            }
        })
    });

    test('basic associative array', () => {
        const expects = [
            [
                AtomTestItem('"key"', TokenType.string, '"key"'),
                AtomTestItem('"value"', TokenType.string, '"value"')
            ],
            [
                AtomTestItem('123', TokenType.number, '123'),
                AtomTestItem('12.12', TokenType.number, '12.12')
            ],
            [
                AtomTestItem('abc', TokenType.id, 'abc'),
                AtomTestItem('def', TokenType.id, 'def')
            ]
        ];
        const actuals = getExpr('{"key": "value", 123: 12.12, abc: def}');
        aarrayUnpackTest(
            actuals,
            (key, index) => {
                if (index === 2) 
                    assert.strictEqual(key instanceof SuffixTerm.Identifier, true);
                else
                    assert.strictEqual(key instanceof SuffixTerm.Literal, true);
                if (key instanceof SuffixTerm.Literal) {
                    assert.strictEqual(expects[index][0].type, key.token.type);
                    assert.strictEqual(expects[index][0].literal, key.token.content);
                }
            },
            (value, index) => {
                if (index === 2) 
                    assert.strictEqual(value instanceof SuffixTerm.Identifier, true);
                else
                    assert.strictEqual(value instanceof SuffixTerm.Literal, true);
                if (value instanceof SuffixTerm.Literal) {
                    assert.strictEqual(expects[index][1].type, value.token.type);
                    assert.strictEqual(expects[index][1].literal, value.token.content);
                }
            }
        );
    });

    test('basic valid call test', () => {
        const expects = [
            callTest('test(100, "water")', 'test', [
                SuffixTerm.Literal,
                SuffixTerm.Literal
            ]),
            callTest('自动热键调用(AHK, "最好的热键语言")', '自动热键调用', [
                SuffixTerm.Identifier,
                SuffixTerm.Literal
            ]),
            callTest('__EmptyCall()', '__EmptyCall', [])
        ];

        for (const expect of expects) {
            const actual = getExpr(expect.source);

            factorUpackTest(
                actual,
                atom => {
                    assert.strictEqual(atom instanceof SuffixTerm.Identifier, true);
                    if (atom instanceof SuffixTerm.Identifier) {
                        assert.strictEqual(atom.token.content, expect.callee);
                    }
                },
                trailer => {
                    assert.strictEqual(trailer instanceof SuffixTerm.Call, true);
                    if (trailer instanceof SuffixTerm.Call) {
                        const args = trailer.args.getElements();
                        for (let i = 0; i < args.length; i++)
                        atomUnpackTest(args[i], atom => {
                            assert.strictEqual(atom instanceof expect.args[i], true);
                        })
                    }
                }
            )
        }
    });
    test('Command Call', () => {
        const expects = [
            callTest('envdiv, 1', 'envdiv', [SuffixTerm.Literal]),
            callTest('envget, %abc%', 'envget', [SuffixTerm.PercentDereference]),
            callTest('\envmult, 1', 'envmult', [SuffixTerm.Literal]),
            callTest('\envset, 1, abc', 'envset', [SuffixTerm.Literal, SuffixTerm.Literal]),
        ];
        for (const expect of expects) {
            const actual = getStmt(expect.source);
            assert.strictEqual(actual instanceof Stmt.CommandCall, true, 'Wrong parse class of Command Call')
            if (actual instanceof Stmt.CommandCall) {
                assert.strictEqual(actual.command.content, expect.callee);
                const args = actual.args.getElements();
                for (let i = 0; i < args.length; i++)
                    atomUnpackTest(args[i], atom => {
                        assert.strictEqual(atom instanceof expect.args[i], true, `${expect.callee} Wrong paramter ${i}`);
                    })
            }
        } 
    })

    test('Basic valid label test', () => {
        const p = new AHKParser('Abdc:\nccd:\ndefault:', '');
        const expect = ['Abdc', 'ccd', 'default'];
		const actuals = p.parse();
        assert.strictEqual(actuals.script.stmts.length, 3, 'Label number');
        actuals.script.stmts.forEach((stmt, i) => {
            assert.strictEqual(stmt instanceof Decl.Label, true, 'Wrong class');
            if (stmt instanceof Decl.Label)
                assert.strictEqual(stmt.name.content, expect[i], 'Wrong content');
        })

	})

    test('Basic valid anonymous function test', () => {
        const expr = getExpr('(b, c, d) => b+c+d', true);
        const expect_param = ['b', 'c', 'd'];
        assert.strictEqual(expr instanceof Expr.AnonymousFunctionCreation, true, 'Wrong class');
        if (!(expr instanceof Expr.AnonymousFunctionCreation)) return;
        expr.params.ParamaterList.getElements().forEach((p, i) => {
            assert.strictEqual(p.identifier.content, expect_param[i], 'Wrong parameter');
        });
        
        assert.strictEqual(expr.body.toString(), 'b + c + d', 'Wrong body');
    })
});

function getStmt(s: string) {
    const p = new AHKParser(s, '');
    return p.testDeclaration();
}

interface IKeyTest {
    name: string,
    modifiers: string[]
}

function keyTest(name: string, modifiers:string[]): IKeyTest {
    return {
        name: name,
        modifiers: modifiers
    };
}

suite('Syntax Parser Statment Test', () => {
    test('valid hotkey', () => {
        const actual = getStmt('^!#F12 & 1::');
        const expects = [
            keyTest(
                'F12',
                ['^', '!', '#']
            ),
            keyTest(
                '1',
                []
            )
        ];
        const aHotkey = actual;
        assert.strictEqual(aHotkey instanceof Decl.Hotkey, true, 'wrong instance');
        if (aHotkey instanceof Decl.Hotkey) {
            // assert.strictEqual(aHotkey.key1.modifiers !== undefined, true, 'key1 modifiers wrong');
            assert.strictEqual(aHotkey.key1.key.content, expects[0].name);
            if (aHotkey.key1.modifiers) {
                const m = aHotkey.key1.modifiers;
                assert.strictEqual(m.content, '^!#', 'Wrong Modifier');
            }
            assert.strictEqual(aHotkey.key2 !== undefined,true, 'Key2 exists');
            if (aHotkey.key2) {
                assert.strictEqual(aHotkey.key2.key.content, expects[1].name);
                assert.strictEqual(aHotkey.key2.modifiers, undefined);
            }
        }
    })
});

function assertNoSyntaxError(ast: IScript) {
    const processer = new PreProcesser(ast, new Map());
    const res = processer.process();
    const errors = res.diagnostics.filter(e => (e.severity ?? 1) < 2);
    assert.strictEqual(errors.length, 0, 'Enconter syntrax error:\n' + JSON.stringify(errors));
}

suite('Full file test', () => {
    test('class file', () => {
        const file = `class IncludeType
        {
            static Path := "Path"
            static Lib := "Lib"
            static Auto := "Auto"
            static Directory := "Directory"
            static Error := "Error"
        }
        
        
        a := "abcdefbcd"
        
        b := 10 + Ord "b"        
        `;
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.sytanxErrors.length, 0, 'Enconter Parser error');
        assertNoSyntaxError(fileAST.script);
    });
    test('Function define file', () => {
        const file = `a(a, b, c:=100, d*)
        {
            static Path := "Path"
            Lib := "Lib"
            Auto := "Auto"
            Directory := "Directory"
            Error := "Error"
        }

        FindText(args*)
        {
        global FindText
        return FindText.FindText(args*)
        }
        
        
        a := "abcdefbcd"
        
        b := 10 + Ord "b"        
        `;
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.sytanxErrors.length, 0, 'Enconter Parser error');
        assert.strictEqual(fileAST.script.stmts.length, 4, 'Error statements number');
        assert.strictEqual(fileAST.script.stmts[0] instanceof Decl.FuncDef, true);
        assert.strictEqual(fileAST.script.stmts[1] instanceof Decl.FuncDef, true);
        assertNoSyntaxError(fileAST.script);
    });

    test('Function define file 2', () => {
        const file = `
FindText(x1:=0, y1:=0, x2:=0, y2:=0, err1:=0, err0:=0
    , text:="", ScreenShot:=1, FindAll:=1
    , JoinText:=0, offsetX:=20, offsetY:=10, dir:=1)
  {
    local
    ; SetBatchLines, % (bch:=A_BatchLines)?"-1":"-1"
    centerX:=Round(x1+x2)//2, centerY:=Round(y1+y2)//2
    if (x1*x1+y1*y1+x2*x2+y2*y2<=0)
      n:=150000, x:=y:=-n, w:=h:=2*n
    else
      x:=Min(x1,x2), y:=Min(y1,y2), w:=Abs(x2-x1)+1, h:=Abs(y2-y1)+1
    bits:=this.GetBitsFromScreen(x,y,w,h,ScreenShot,zx,zy,zw,zh)
    , info:=[]
    Loop, Parse, text, |
      if IsObject(j:=this.PicInfo(A_LoopField))
        info.Push(j)
    if (w<1 or h<1 or !(num:=info.MaxIndex()) or !bits.Scan0)
    {
      SetBatchLines, %bch%
      return 0
    }
    arr:=[], in:={zx:zx, zy:zy, zw:zw, zh:zh
      , sx:x-zx, sy:y-zy, sw:w, sh:h}, k:=0
    For i,j in info
      k:=Max(k, j.2*j.3), in.comment .= j.11
    VarSetCapacity(s1, k*4), VarSetCapacity(s0, k*4)
    , VarSetCapacity(ss, 2*(w+2)*(h+2))
    , FindAll:=(dir=9 ? 1 : FindAll)
    , JoinText:=(num=1 ? 0 : JoinText)
    , allpos_max:=(FindAll or JoinText ? 10240 : 1)
    , VarSetCapacity(allpos, allpos_max*8)
    Loop, 2
    {
      if (err1=0 and err0=0) and (num>1 or A_Index>1)
        err1:=0.05, err0:=0.05
      Loop, % JoinText ? 1 : num
      {
        this.PicFind(arr, in, info, A_Index, err1, err0
          , FindAll, JoinText, offsetX, offsetY, dir
          , bits, ss, s1, s0, allpos, allpos_max)
        if (!FindAll and arr.MaxIndex())
          Break
      }
      if (err1!=0 or err0!=0 or arr.MaxIndex() or info.1.12)
        Break
    }
    if (dir=9)
      arr:=this.Sort2(arr, centerX, centerY)
    SetBatchLines, %bch%
    return arr.MaxIndex() ? arr:0
  }`;
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.script.stmts.length, 1, 'Enconter Parser error');
        assertNoSyntaxError(fileAST.script);
    });

    test('Method define file', () => {
        const file = `class IncludeType
        {
            static Path := "Path"
            static Lib := "Lib"
            static Auto := "Auto"
            static Directory := "Directory"
            static Error := "Error"

            __New(a, b, c:=100, d*) {
                this.a := 12
            }

            answer(a, b) {
                this.error := a+b
                return 42
            }
        }
        
        
        a := "abcdefbcd"
        
        b := 10 + Ord "b"        
        `;
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.script.stmts.length, 3, 'Enconter Parser error');
        assert.strictEqual(fileAST.script.stmts[0] instanceof Decl.ClassDef, true);
        assert.strictEqual(fileAST.script.stmts[1] instanceof Stmt.ExprStmt, true);
        assert.strictEqual(fileAST.script.stmts[2] instanceof Stmt.ExprStmt, true);
        assertNoSyntaxError(fileAST.script);
    });

    test('Full document 1', () => {
        const file = `#SingleInstance Force
        #NoEnv  ; Recommended for performance and compatibility with future AutoHotkey releases.
        ; #Warn  ; Enable warnings to assist with detecting common errors.
        SendMode Input  ; Recommended for new scripts due to its superior speed and reliability.
        SetWorkingDir %A_ScriptDir%  ; Ensures a consistent starting directory.
        
        #If WinActive("ahk_exe Authotkey.exe")
        ::aa::Al2Al2
        ::aar::Al2Al2RT
        #If        
        `;
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.script.stmts.length, 8, 'Enconter Parser error');
        assertNoSyntaxError(fileAST.script);
    });
    test('Full document 2', () => {
        const file = `Abs(Number){}
ACos(Number){}
Asc(String){}
ASin(Number){}
ATan(Number){}
Ceil(Number){}
Chr(Number){}
ComObjActive(CLSID){}
ComObjArray(VarType,Count1,CountN*){}
ComObjConnect(ComObject,PrefixOrSink := UnSet){}
ComObjCreate(CLSID,IID := UnSet){}
ComObject(VarType,Value,Flags := UnSet){}
ComObjEnwrap(DispPtr){}
ComObjError(Enable := UnSet){}
ComObjFlags(ComObject,NewFlags := UnSet,Mask := UnSet){}
ComObjGet(Name){}
ComObjMissing(){}
ComObjParameter(VarType,Value,Flags := UnSet){}
ComObjQuery(ComObject,SID,IID){}
ComObjQuery(ComObject,IID){}
ComObjType(ComObject,InfoType := UnSet){}
ComObjUnwrap(ComObject){}
ComObjValue(ComObject){}
Cos(Number){}
DllCall(DllFile_Function,Type1,Arg1,Type2,Arg2,Cdecl_ReturnType){}
Exception(Message,What := UnSet,Extra := UnSet){}
Exp(N){}
FileExist(FilePattern){}
FileOpen(Filename,Flags,Encoding := UnSet){}
Floor(Number){}
Format(FormatStr,Values := UnSet){}
GetKeyName(Key){}
GetKeySC(Key){}
GetKeyState(KeyName,Mode := UnSet){}
GetKeyVK(Key){}
Hotstring(String,Replacement := UnSet,OnOffToggle := UnSet){}
Hotstring(NewOptions){}
Hotstring(SubFunction,Value1){}
IL_Add(ImageListID,IconFileName,IconNumber := UnSet){}
IL_Add(ImageListID,PicFileName,MaskColor,Resize){}
IL_Create(InitialCount := UnSet,GrowCount := UnSet,LargeIcons := UnSet){}
IL_Destroy(ImageListID){}
InputHook(Options := UnSet,EndKeys := UnSet,MatchList := UnSet){}
InStr(Haystack,Needle,CaseSensitive := UnSet,StartingPos := UnSet,Occurrence := UnSet){}
IsByRef(ParameterVar){}
IsFunc(FunctionName){}
IsLabel(LabelName){}
IsObject(Value){}
IsSet(Var){}
Ln(Number){}
LoadPicture(Filename,Options := UnSet,OutImageType := UnSet){}
Log(Number){}
LTrim(String,OmitChars){}
LV_Add(Options := UnSet,Col*){}
LV_Delete(RowNumber := UnSet){}
LV_DeleteCol(ColumnNumber){}
LV_GetCount(Mode := UnSet){}
LV_GetNext(StartingRowNumber := UnSet,RowType := UnSet){}
LV_GetText(OutputVar,RowNumber,ColumnNumber := UnSet){}
LV_Insert(RowNumber,Options := UnSet,Col*){}
LV_InsertCol(ColumnNumber,Options := UnSet,ColumnTitle := UnSet){}
LV_Modify(RowNumber,Options := UnSet,NewCol*){}
LV_ModifyCol(ColumnNumber := UnSet,Options := UnSet,ColumnTitle := UnSet){}
LV_SetImageList(ImageListID,IconType := UnSet){}
Max(Number1,NumberN*){}
MenuGetHandle(MenuName){}
MenuGetName(Handle){}
Min(Number1,NumberN*){}
Mod(Dividend,Divisor){}
NumGet(VarOrAddress,Offset := UnSet,Type := UnSet){}
NumGet(VarOrAddress,Type){}
NumPut(Number,VarOrAddress,Offset := UnSet,Type := UnSet){}
NumPut(Number,VarOrAddress,Type){}
ObjAddRef(Ptr){}
ObjBindMethod(Obj,Method,Params){}
ObjGetBase(Object){}
ObjRawGet(Object,Key){}
ObjRawSet(Object,Key,Value){}
ObjRelease(Ptr){}
ObjSetBase(Object,BaseObject){}
OnClipboardChange(Callback,AddRemove := UnSet){}
OnError(Callback,AddRemove := UnSet){}
OnExit(Callback,AddRemove := UnSet){}
OnMessage(MsgNumber,Callback := UnSet,MaxThreads := UnSet){}
Ord(String){}
RegExMatch(Haystack,NeedleRegEx,OutputVar := UnSet,StartingPos := UnSet){}
RegExReplace(Haystack,NeedleRegEx,Replacement := UnSet,byref OutputVarCount := UnSet,Limit := UnSet,StartingPos := UnSet){}
RegisterCallback(Function,Options := UnSet,ParamCount := UnSet,EventInfo := UnSet){}
Round(Number,N := UnSet){}
RTrim(String,OmitChars){}
SB_SetIcon(Filename,IconNumber := UnSet,PartNumber := UnSet){}
SB_SetParts(WidthMaxTo255*){}
SB_SetText(NewText,PartNumber := UnSet,Style := UnSet){}
Sin(Number){}
Sqrt(Number){}
StrGet(Source,Length := UnSet,Encoding := UnSet){}
StrGet(Source,Encoding){}
StrLen(String){}
StrPut(String,Target,Length := UnSet,Encoding := UnSet){}
StrPut(String,Target,Encoding){}
StrPut(String,Encoding){}
StrReplace(Haystack,Needle,ReplaceText := UnSet,OutputVarCount := UnSet,Limit := UnSet){}
StrSplit(String,Delimiters := UnSet,OmitChars := UnSet,MaxParts := UnSet){}
SubStr(String,StartingPos,Length := UnSet){}
Tan(Number){}
Trim(String,OmitChars := UnSet){}
TV_Add(Name,ParentItemID := UnSet,Options := UnSet){}
TV_Delete(ItemID := UnSet){}
TV_Get(ItemID,Attribute){}
TV_GetChild(ItemID){}
TV_GetCount(){}
TV_GetNext(ItemID := UnSet,ItemType := UnSet){}
TV_GetParent(ItemID){}
TV_GetPrev(ItemID){}
TV_GetSelection(){}
TV_GetText(OutputVar,ItemID){}
TV_Modify(ItemID,Options := UnSet,NewName := UnSet){}
TV_SetImageList(ImageListID,IconType := UnSet){}
VarSetCapacity(TargetVar,RequestedCapacity := UnSet,FillByte := UnSet){}
VerCompare(VersionA,VersionB){}
WinActive(WinTitle := UnSet,WinText := UnSet,ExcludeTitle := UnSet,ExcludeText := UnSet){}
WinExist(WinTitle := UnSet,WinText := UnSet,ExcludeTitle := UnSet,ExcludeText := UnSet){}
Array(Value*){}
Func(FunctionName){}  
        `;
        const parser = new AHKParser(file, '');
        const fileAST = parser.parse();
        assert.strictEqual(fileAST.tokenErrors.length, 0, 'Enconter Token error');
        assert.strictEqual(fileAST.script.stmts.length, 124, 'Enconter Parser error');
        for (const stmt of fileAST.script.stmts) {
            assert.strictEqual(stmt instanceof Decl.FuncDef, true);
        }
        assertNoSyntaxError(fileAST.script);
    });
});