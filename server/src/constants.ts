import { CompletionItemKind, CompletionItem, Position, Range } from 'vscode-languageserver';
import { TokenType } from './parser/newtry/tokenizor/tokenTypes';
import { Parameter } from "./parser/regParser/types";
import { 
    builtin_variable,
    builtin_function,
	builtin_command
} from "./utilities/builtins";
import { ServerConfiguration, docLangName } from './services/config/serverConfiguration';
import { AHKBuiltinMethodSymbol, AHKMethodSymbol, AHKSymbol, BuiltinVaribelSymbol, ParameterSymbol } from './parser/newtry/analyzer/models/symbol';
import { VarKind } from './parser/newtry/analyzer/types';
import { AHKParser } from './parser/newtry/parser/parser';
import { IoService } from './services/ioService';
import { readFileSync } from 'fs';
import { join } from 'path';
import { URI } from 'vscode-uri';
import { FuncDef, SpreadParameter } from './parser/newtry/parser/models/declaration';

export const ServerName = 'ahk-simple-language-server';

export const defaultSettings = new ServerConfiguration(
	1000,
	docLangName.NO,
	false,
	{
		level: 'info'
	},
	{
		hasConfiguration : false, 
		hasWorkspaceFolder: false
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
	const fakeRange: Range = {
		start: Position.create(-1, -1),
		end:   Position.create(-1, -1)
	}
	
	let b: Map<string, AHKSymbol> = new Map()
	// add built-in function
	if (v2mode) {
		const furi = URI.file(join(__dirname, '..', '..', 'syntaxes', 'builtin', 'v2','functions.d.ahk'));
		// TODO: Hanlde file read failure
		let docText = '';
		try {
			docText = readFileSync(furi.fsPath, {encoding: 'utf-8'});
		}
		catch (err) {
			logger.error('Can not read builtin-function definition file. Builtin-function related features will not work.');
		}

		const p = new AHKParser(docText, furi.toString(), true)
		const ast = p.parse();
		const fuctions = ast.script.stmts.map(f => {
			const fdef = f as FuncDef
			return new AHKMethodSymbol(
				'__Builtin__',
				fdef.nameToken.content,
				fakeRange,
				fdef.params.requiredParameters.map(p =>
					new ParameterSymbol(
						furi.toString(),
						p.identifier.content,
						Range.create(p.start, p.end),
						VarKind.parameter,
						p.byref !== undefined,
						false
					)
				),
				fdef.params.optionalParameters.map(p =>
					new ParameterSymbol(
						furi.toString(),
						p.identifier.content,
						Range.create(p.start, p.end),
						VarKind.parameter,
						p.byref !== undefined,
						p instanceof SpreadParameter
					)
				)
			)
		});
		for (const m of fuctions) 
			b.set(m.name.toLowerCase(), m);
	}
	else {
		b = new Map(buildBuiltinFunctionNode().map(f => {
			const reqParam = f.params.filter(p => !(p.isOptional));
			const optParam = f.params.filter(p => !!(p.isOptional));
		
			return [f.name.toLowerCase(), 
				new AHKBuiltinMethodSymbol(
					f.name, 
					reqParam.map(p => new ParameterSymbol(
						'__Builtin__', p.name, fakeRange, VarKind.parameter, false, false
					)),
					optParam.map(p => new ParameterSymbol(
						'__Builtin__', p.name, fakeRange, VarKind.parameter, false, false
					)),
			)];
		}));
	}
	
	// add built-in variable
	const v = buildbuiltin_variable().map(
		(v): [string, AHKSymbol] => [
			v.label.toLowerCase(),
			new BuiltinVaribelSymbol(
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