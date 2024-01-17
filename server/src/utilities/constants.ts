import { CompletionItemKind, CompletionItem } from 'vscode-languageserver';
import { TokenType } from '../parser/newtry/tokenizor/tokenTypes';
import { Parameter } from "../parser/regParser/types";
import { 
    builtin_variable,
    builtin_function,
	builtin_command
} from "./builtins";
import { ServerConfiguration, docLangName } from '../services/config/serverConfiguration';

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
	}
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