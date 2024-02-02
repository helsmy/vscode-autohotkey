/**
 * Gulp file to genertate syntax related file from help documents for ahk
 */

import { openSync, readFileSync, writeSync } from 'fs';
import * as HTMLParser from 'node-html-parser';
import { join } from 'path';
import { Tokenizer } from "../server/src/parser/newtry/tokenizor/tokenizer";
import { TakeToken, TokenKind, TokenResult } from '../server/src/parser/newtry/tokenizor/types';
import { TokenType, isValidIdentifier } from '../server/src/parser/newtry/tokenizor/tokenTypes';
import { Token } from '../server/src/parser/newtry/tokenizor/types';

enum SyntaxType {
	Directive,
	BuiltinVar,
	BuiltinFunction,
	ControlFlow,
	Operator,
	Declaration,
	BuiltinClass,
	BuiltinMethod,
	Ahk2ExecCompiler = 99,
	Non,
	/**
	 * v2 take the command type as BuiltinClass
	 */
	Command = 6
};

type DataType = [string, string, number, string] | [string, string, number] | [string, string];

interface MethodInfo {
	name?: string,
	parameter?: ParamInfo[],
	return?: string,
	full?: string
}

class ParamInfo {
	public name: string;
	public isOptional: boolean = false;
	public defaultVal?: string;
	public isRef: boolean = false;
	public isExtend: boolean = false;
	constructor(name: string) {
		this.name = name;
	}
}

const rootPath = resolvePath('../..','ahkdoc/v2/docs');

function resolvePath(...path: string[]) {
	return join(__dirname, ...path);
}

function ControlFlowCasing(item: string) {
	if (item == 'Loop' || /^If.+/.test(item))
		return item
	else
		return item.toLowerCase()
}

function createApiList<T>(api: Set<T>): string {
	return JSON.stringify(Array.from(api), undefined, '  ');
}

export function syntaxGen() {
	let g_directivesExpr = new Set(["ClipboardTimeout","HotIfTimeout","InputLevel","MaxThreads",
	"MaxThreadsBuffer","MaxThreadsPerHotkey","SuspendExempt","UseHook","WinActivateForce"]);
	let g_directivesStr = new Set();
	let g_controlFlow = new Set(["Loop"])
	let g_reserved = new Set(["as", "contains", "false", "in", "IsSet", "super", "true", "unset"])
	let g_knownVars = new Set(["this", "ThisHotkey"])
	let g_knownFuncs = new Set()
	let g_knownClasses = new Set()
	let g_operator = new Set();

	let g_knownProps = new Set([
		//Meta-properties and other conventions
		"__Item", "__Class", "Ptr", "Size", "Handle", "Hwnd",

		//Any
		"base",

		//Func
		"Name", "IsBuiltIn", "IsVariadic", "MinParams", "MaxParams",

		//Class
		"Prototype",

		//Array
		"Length", "Capacity",

		//Map
		"Count", "Capacity", "CaseSense", "Default",

		//Error
		"Message", "What", "Extra", "File", "Line", "Stack",

		//File
		"Pos", "Length", "AtEOF", "Encoding",
	])

	let g_knownMethods = new Set([
		//Meta-methods and other conventions
		"__Init", "__New", "__Delete", "__Get", "__Set", "__Call", "__Enum", "Call",

		//Any
		"GetMethod", "HasBase", "HasMethod", "HasProp",

		//Object
		"Clone", "DefineProp", "DeleteProp", "GetOwnPropDesc", "HasOwnProp", "OwnProps",

		//Func
		"Bind", "IsByRef", "IsOptional",

		//Array
		"Clone", "Delete", "Has", "InsertAt", "Pop", "Push", "RemoveAt",

		//Map
		"Clear", "Clone", "Delete", "Get", "Has", "Set",

		//File
		"Read", "Write", "ReadLine", "WriteLine", "RawRead", "RawWrite", "Seek", "Close",

	])


	const data_index = readFileSync(join(rootPath, 'static/source/data_index.js'), {encoding: 'utf-8'});
	const syntax_index = JSON.parse(
		data_index.slice(12, data_index.length-1)
	) as DataType[];

	for (const item of syntax_index) {
		const item_name = item[0];
		const item_path = item[1];
		const item_type = item.length >= 3 ? item[2] : SyntaxType.Non;

		switch (item_type) {
			case SyntaxType.Directive:
				const dname = item_name.slice(1); // remove initial #
				if (item[3] == 'E')
					g_directivesExpr.add(dname);
				else
					g_directivesStr.add(dname);
				continue;
			case SyntaxType.BuiltinVar:   
				g_knownVars.add(item_name);
				continue;
			case SyntaxType.BuiltinFunction:   
				g_knownFuncs.add([
					item_name, 
					getFunctionDetail(item_path, item_name)
				]);
				continue;
			case SyntaxType.BuiltinClass:   
				g_knownClasses.add(item_name);
				continue;
			case SyntaxType.Operator:
				g_operator.add(item_name);
				continue;
			case SyntaxType.Declaration: 
				g_reserved.add(item_name);
				continue;
			case SyntaxType.ControlFlow:   
				g_controlFlow.add(ControlFlowCasing(item_name));
				continue;
		}
	}
	
	const f = openSync(join(__dirname, 'syntax.api'), 'w');
	const api = 
`g_controlFlow: 
${createApiList(g_controlFlow)}
g_directivesExpr:
${createApiList(g_directivesExpr)}
g_directivesStr:
${createApiList(g_directivesStr)}
g_reserved
${createApiList(g_reserved)}
g_knownVars
${createApiList(g_knownVars)}
g_knownFuncs
${createApiList(g_knownFuncs)}
g_knownClasses
${createApiList(g_knownClasses)}
g_operator
${createApiList(g_operator)}
`;
	writeSync(f, api);
}

function parseFunc(f: string): MethodInfo {
	const scanner = new Tokenizer(f, true);
	const tokenGen = scanner.GenToken();
	let current = init();
	let info: MethodInfo = {}
	info.full = f;
	
	scanner.isLiteralToken = false;
	if (scanner.Peek(0) === '(') {
		info.name = current.content;
		advance();
		advance();
		info.parameter = parseParam();
	}
	const p = scanner.Peek(1, true);
	if (p === ':') {
		return parseAssign();
	}

	// other command call like function
	info.name = current.content;
	advance();
	info.parameter = parseParam();


	return info;

	function init(): Token {
		let tokenResult = tokenGen.next().value;
		if (NotError(tokenResult)) {
			let current = tokenResult.result;
			if (!isValidIdentifier(current.type) && current.type !== TokenType.command) 
				throw new ParseError('id', current, f);
			return current;
		}
		throw new ParseError('id', tokenResult, f);
	}

	function parseParam(): ParamInfo[] {
		let parameters: ParamInfo[] = [];
		while (true) {
			const ref = current.type === TokenType.and ? advance() : undefined;
			const param = current;
			if (!isValidIdentifier(param.type) && param.type !== TokenType.string) {
				if (param.type === TokenType.openBracket) {
					parameters.push(...parseOptional());
					continue;
				}
				if (param.type ===TokenType.closeParen || isEnd(param))
					break;
				// ... on parameter
				let p = '';
				if (param.content !== '.')
					throw new ParseError('\'.\'', param, f);
				while (scanner.Peek(0) === '.') {
					p += '.';
					advance();
				}
			}
			advance();

			if (ref) {
				const info = new ParamInfo(param.content);
				info.isRef = true;
				parameters.push(info);
			}
			else if (current.type === TokenType.multi) {
				const info = new ParamInfo(param.content);
				info.isExtend = true;
				parameters.push(info);
				advance();
			}
			// if is `ComObjArray(VarType, Count1 [, Count2, ... Count8])`
			else if (current.type === TokenType.id) {
				const param = advance();
				const info = new ParamInfo('...'+param.content);
				parameters.push(info);
			}
			else if (current.type === TokenType.minus) {
				let content = param.content;
				while (true) {
					const minus = current;
					if (minus.type === TokenType.minus)
						content += '-';
					else
						break;
					advance();
					
					if (isValidIdentifier(current.type))
						content += current.content
					else
						break;
					advance();
				}
				parameters.push(new ParamInfo(content));
			}
			else if (current.content === '.') {
				const info = new ParamInfo(param.content);
				info.isExtend = true;
				parameters.push(info);
				while(current.content === '.')
					advance();
			}
			else if (current.type ===TokenType.aassign) {
				const assign = advance();
				const expr = advance();
				const info = new ParamInfo(param.content);
				info.isOptional = true;
				info.defaultVal = expr.content;
				parameters.push(info);
			}
			else
				parameters.push(new ParamInfo(param.content));

			const comma = current;
			if (!comma)
				throw new ParseError("',' or ')'", comma, f);
			if (comma.type === TokenType.comma) {
				advance();
				continue;
			}
			if (comma.type === TokenType.closeParen || 
				comma.type === TokenType.closeBracket ||
				isEnd(comma))
				break;
			if (current.type === TokenType.openBracket) {
				parameters.push(...parseOptional());
				continue;
			}

			throw new ParseError("',' or ')'", comma, f);
		}
		return parameters;
	}

	function parseOptional(): ParamInfo[] {
		const open = advance();
		// jump '[,'
		if (current.type === TokenType.comma)
			advance();
		const param = parseParam();
		const close = advance();

		if (close.type !== TokenType.closeBracket) {
			throw new ParseError("']'", close, f);
		}
		param.forEach(i => i.isOptional = true);

		return param;
	}

	function parseAssign(): MethodInfo {
		let info: MethodInfo = {full: f};
		info.return = advance().content;
		// :=
		advance();
		const name = advance();
		if (name?.type !== TokenType.id)
			throw new ParseError('id', name,f);
		info.name = name.content;
		// should be '('
		advance();
		info.parameter = parseParam();
		return info;
	}

	function advance() {
		const pre = current
		const token = tokenGen.next().value;
		if (NotError(token)) {
			current = token.result;
			return pre;
		}
		throw new ParseError('Token', token, f);
	}
	
	function NotError(token: TokenResult): token is TakeToken {
		switch (token.kind) {
			case TokenKind.Token:
				return true;
			default:
				return false;
		}
	}

	function isEnd(token: Token): boolean {
		return token.type === TokenType.EOF ||
				token.type === TokenType.EOL;
	}

	function isAlpha(s: string): boolean {
		return (s >= 'A' && s <= 'Z') || (s >= 'a' && s <= 'z') || s === '_';
	}
}

class ParseError extends Error {
	constructor(expect: string, token: Token | TokenResult| undefined, full: string) {
		super(`Parse Error, Expect an ${expect}. \ngot: ${JSON.stringify(token)}\nfull: ${full}`);
	}
}



function getFunctionDetail(path: string, funcName: string) {
	const libPath = path.split('#')[0];
	const html = readFileSync(join(rootPath, libPath), {encoding: 'utf-8'});
	const root = HTMLParser.parse(html);
	// TODO: store parameter doc in params.
	const params = getParams(root);
	
	// If name of .htm is not the same of function name,
	// there are more than one function in one htm.
	// try find the element of function
	const syntax = libPath.includes(funcName) ? 
					root.querySelector('.Syntax') :
					findFunctionInMulti(root, funcName);
	if (!syntax) {
		console.log(`Can not get infomation of ${funcName}. Function name was not found in Syntax node.`);
		return undefined;
	}

	const optSafe = spanTagRender(syntax.text);
	const m = optSafe.replace(/<[\/\w\s"=#]+?>/g, '').trim();
	// Remove invaild token on .htm
	if (funcName === "FileSelect")
		return [parseFunc(m.replace('RootDir\\Filename', '"RootDir\\Filename"')), params];
	if (funcName === "StatusBarGetText" || funcName === "StatusBarWait")
		return [parseFunc(m.replace('Part#', '"Part#"')), params];
	
	// Deal with overide
	if (m.includes('\n') &&
	// FIXME: Skip RegWrite. Because it has ', ,' which will cause an Error.
		funcName !== "RegWrite") {
		const infos: MethodInfo[] = [];
		for (const f of m.split('\n')) {
			// FIXME: Skip method call parse for now
			if (/\w\.\w/.test(f)) {
				continue;
			}
			const info = parseFunc(f.trim());
			if (info.name === funcName)
				infos.push(info);
		}
		return [...infos, params];
	}
	return [parseFunc(m), params];
}

function findFunctionInMulti(root: HTMLParser.HTMLElement, funcName: string) {
	const syntaxs = root.querySelectorAll('.Syntax');
		
	for (const s of syntaxs) {
		const text = s.text;
		const name = getFuncName(text);
		if (!name) continue;
		if (name === funcName)
			return s;
		
		// name !== funcName
		// if there are multi-function in one syntax tag
		if (!text.includes('\n')) continue;
		for (const f of text.split('\n')) {
			if (getFuncName(f) !== funcName) continue;
			s.set_content(f);
			return s; 
		}
	}
	return undefined;
}

function spanTagRender(t: string): string {
	// const m = funcName.exec(t);
	const optTag = optionalParamReg.exec(t);
	if (optTag === null) return t;
	const tag = optTag[0];
	const renderText = tag.replace('<span class="optional">', '[')
						.replace('</span>', ']');
	return t.replace(tag, renderText);
}

function getParams(root: HTMLParser.HTMLElement): string[] | undefined {
	const dlParams = root.getElementsByTagName('dl');
	let parameter: string[] = [];
	if (!dlParams) return undefined;
	for (const param of dlParams) {
		for (const child of param.childNodes) {
			const dt = child.nodeType == HTMLParser.NodeType.ELEMENT_NODE ? child as HTMLParser.HTMLElement : undefined; 
			if (!dt) 
				continue;
			// parameter name
			if (dt.localName === 'dt')
				parameter.push(child.text);
			// parameter doc
			// if (dt.localName == 'dd')
		}
	}
	return parameter;
}

function getFuncName(t: string): string | undefined {
	const name = funcNameReg.exec(t);
	if (name === null) return undefined;
	// name is the 3rd match group
	return name[2];
}

const funcNameReg = /<span class="func">(<i>)?([\w0-9:=\s]+?)(<\/i>)?<\/span>/;
const optionalParamReg = /<span class="optional">([\w0-9:=\s,\.]+?)<\/span>/;
