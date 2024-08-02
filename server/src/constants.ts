import { CompletionItemKind, CompletionItem, Position, Range } from 'vscode-languageserver';
import { TokenType } from './parser/newtry/tokenizor/tokenTypes';
import { Parameter } from "./parser/regParser/types";
import { 
    builtin_variable,
    builtin_function,
	builtin_command
} from "./utilities/builtins";
import { ServerConfiguration, docLangName } from './services/config/serverConfiguration';
import { AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, BuiltinVariableSymbol, ParameterSymbol, VariableSymbol } from './parser/newtry/analyzer/models/symbol';
import { VarKind } from './parser/newtry/analyzer/types';
import { AHKParser } from './parser/newtry/parser/parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { URI } from 'vscode-uri';
import { ClassDef, FuncDef, SpreadParameter } from './parser/newtry/parser/models/declaration';
import { Factor } from './parser/newtry/parser/models/expr';
import { Identifier } from './parser/newtry/parser/models/suffixterm';
import { AssignStmt } from './parser/newtry/parser/models/stmt';

export const ServerName = 'ahk-simple-language-server';

export const defaultSettings = new ServerConfiguration(
	1000,
	docLangName.NO,
	false,
	{
		level: 'info'
	},
	false
)

export const keywords = (() => {
	let keyword: string[] = [];
	for (let k = TokenType.if; k <= TokenType.byref; k++)
		keyword.push(TokenType[k]);
	return keyword;
})();

export interface BuiltinFuncNode {
    name: string
    params: Parameter[]
}


export function buildKeyWordCompletions(): CompletionItem[] {
	return keywords.map(keyword => ({
		kind: CompletionItemKind.Keyword,
		label: keyword,
		data: 0,
	}));
}

export function buildbuiltin_variable(): CompletionItem[] {
	return builtin_variable.map((bti_var_info, index) => {
		return {
            kind: CompletionItemKind.Variable,
            detail: 'Built-in Variable',
            label: bti_var_info[0],
            data: index
		}
	});
}

export function buildBuiltinFunctionNode(): BuiltinFuncNode[] {
    return builtin_function
}

export function buildBuiltinCommandNode(): BuiltinFuncNode[] {
	return builtin_command;
}

export function getBuiltinScope(v2mode = false, logger: ILoggerBase): Map<string, AHKSymbol> {
	let b: Map<string, AHKSymbol> = new Map()
	// add built-in function
	const version = v2mode ? 'v2' : 'v1'
	const furi = URI.file(join(__dirname, '..', '..', 'syntaxes', 'builtin', version,'functions.d.ahk'));
	// TODO: Hanlde file read failure
	let docText = '';
	try {
		docText = readFileSync(furi.fsPath, {encoding: 'utf-8'});
	}
	catch (err) {
		logger.error('Can not read builtin-function definition file. Builtin-function related features will not work.');
	}

	const p = new AHKParser(docText, furi.toString(), true);
	const ast = p.parse();
	const fuctions = ast.script.stmts.map(f => {
		const fdef = f as FuncDef
		return convertStmt2MethodSymbol(fdef);
	});
	for (const m of fuctions) 
		b.set(m.name.toLowerCase(), m);

	// TODO: 下面是Built in Class的实验性代码，
	// 配合对于内置函数 FileOpen 的类型的特例类型推断
	// case: 
	//      `a_file := FileOpen("file_name")`
	//   ->  只对FileOpen函数进行函数的类型推断
	//       a_file的类型推断为File类
	// 目前 `classes.d.ahk` 只含有File类
	// syntaxes/builtin/v1/classes.d.ahk
	const fclassUri = URI.file(join(__dirname, '..', '..', 'syntaxes', 'builtin', 'v1' ,'classes.d.ahk'));
	try {
		docText = readFileSync(fclassUri.fsPath, {encoding: 'utf-8'});
	}
	catch (err) {
		logger.error('Can not read builtin-class definition file. Builtin-class related features will not work.');
	}
	const p2 = new AHKParser(docText, fclassUri.toString(), true);
	// logger.info(docText);
	const ast2 = p2.parse();
	const objects = ast2.script.stmts.filter(s => s instanceof ClassDef).map(o => {
		const odef = new AHKObjectSymbol(fclassUri.toString(), o.name.content, fakeRange);
		for (const stmt of o.body.stmts) {
			if (stmt instanceof AssignStmt) {
				const prop = stmt.left;
				if (!(prop instanceof Factor && prop.suffixTerm.atom instanceof Identifier))
					continue;
				odef.define(new VariableSymbol(
					fclassUri.toString(),
					prop.suffixTerm.atom.token.content,
					fakeRange,
					VarKind.property
				))
			}
			if (stmt instanceof FuncDef) 
				odef.define(convertStmt2MethodSymbol(stmt));
		}
		return odef;
	});

	for(const o of objects) 
		b.set(o.name.toLowerCase(), o);

	// add built-in variable
	const v = buildbuiltin_variable().map(
		(v): [string, AHKSymbol] => [
			v.label.toLowerCase(),
			new BuiltinVariableSymbol(
				v.label,
				VarKind.variable,
				undefined
			)
		]
	);
	for (const [name, sym] of v)
		b.set(name, sym);
	
	return b;
}

function convertStmt2MethodSymbol(fdef: FuncDef): AHKMethodSymbol {
	// Is it better that builtin symbols just record `d.ahk` file Location?
	// 或许直接记录`.d.ahk`文件的Location就好？
	return new AHKMethodSymbol(
		'__Builtin__',
		fdef.nameToken.content,
		fakeRange,
		fdef.params.requiredParameters.map(p =>
			new ParameterSymbol(
				'__Builtin__',
				p.identifier.content,
				Range.create(p.start, p.end),
				VarKind.parameter,
				p.byref !== undefined,
				false
			)
		),
		fdef.params.optionalParameters.map(p =>
			new ParameterSymbol(
				'__Builtin__',
				p.identifier.content,
				Range.create(p.start, p.end),
				VarKind.parameter,
				p.byref !== undefined,
				p instanceof SpreadParameter
			)
		)
	)
}

const fakeRange: Range = {
	start: Position.create(-1, -1),
	end:   Position.create(-1, -1)
}