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

const enum SyntaxType {
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

interface ObjectInfo {
	name: string,
	extend?: string,
	staticMethod: MethodInfo[],
	method: MethodInfo[],
	property: string[]
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

const v2 = true;
const rootPath = resolvePath('../..', v2 ? 'ahkdoc/v2/docs' : 'ahkdoc/v1/docs');

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
	let g_directivesExpr = new Set(["ClipboardTimeout", "HotIfTimeout", "InputLevel", "MaxThreads",
		"MaxThreadsBuffer", "MaxThreadsPerHotkey", "SuspendExempt", "UseHook", "WinActivateForce"]);
	let g_directivesStr = new Set();
	let g_controlFlow = new Set(["Loop"])
	let g_reserved = new Set(["as", "contains", "false", "in", "IsSet", "super", "true", "unset"])
	let g_knownVars = new Set(["this", "ThisHotkey"])
	let g_knownFuncs = new Set()
	let g_knownClasses: Set<ObjectInfo|string> = new Set()
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


	const data_index = readFileSync(join(rootPath, 'static/source/data_index.js'), { encoding: 'utf-8' });
	const syntax_index = JSON.parse(
		data_index.slice(12, data_index.length - 1)
	) as DataType[];
	const methodinfos: MethodInfo[] = [];

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
				const detail = getFunctionDetail(item_path, item_name);
				if (detail) {
					const info = detail[0];
					if (info) {
						if (info instanceof Array) {
							if (typeof info[0] === 'object')
								methodinfos.push(...(info as MethodInfo[]));
							else
								// if type is string[]
								console.log(JSON.stringify(info));
						}
						else {
							methodinfos.push(info);
						}
					}
				}
				g_knownFuncs.add([
					item_name,
					detail
				]);
				continue;
			case SyntaxType.BuiltinClass:
				const objd = getObjectDetail(item_path, item_name)
				g_knownClasses.add(objd ? objd : item_name);
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

	const mi2str = (m: MethodInfo) => `${m.name}(${m.parameter?.map(p => {
		return `${p.isRef ? '&' : ''}${p.name}${p.isOptional ? ' := ' + (p.defaultVal ? p.defaultVal : 'UnSet') : ''}`
	}).join(',')}){}`;

	const fdef = openSync(join(__dirname, 'functions.d.ahk'), 'w');
	writeSync(fdef, methodinfos.map(i => mi2str(i)).join('\n'));
	const odef = openSync(join(__dirname, 'classes.d.ahk'), 'w');
	writeSync(odef, Array(...g_knownClasses).map(i => {
		if (typeof i === 'string')
			return `class ${i} {}`;
		let lines = [i.extend ? `class ${i.name} extends ${i.extend} {` : `class ${i.name} {`];
		for (const p of i.property) 
			lines.push(`    ${p} := Unset`);
		for (const sm of i.staticMethod) 
			lines.push(`    static ${mi2str(sm)}`);
		for (const m of i.method) 
			lines.push('    ' + mi2str(m));
		lines.push('}')
		return lines;
	}).flat().join('\n'));
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
		return info;
	}
	if (scanner.Peek(0) === '.') {
		const factor = parseFactor();
		info.name = factor[factor.length - 1];
		advance();
		info.parameter = parseParam();
		return info;
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
				if (param.type === TokenType.closeParen || isEnd(param))
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
				const info = new ParamInfo('...' + param.content);
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
				while (current.content === '.')
					advance();
			}
			else if (current.type === TokenType.aassign) {
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
		let info: MethodInfo = { full: f };
		info.return = advance().content;
		// :=
		advance();
		const factor = parseFactor();
		const name = factor[factor.length - 1];
		info.name = name;
		// should be '('
		advance();
		info.parameter = parseParam();
		return info;
	}

	function parseFactor(): string[] {
		const name: string[] = [];
		while (true) {
			if (!isValidIdentifier(current.type))
				throw new ParseError('id', current, f);;
			name.push(current.content);
			advance();
			if (current.type === TokenType.dot) {
				name.push(current.content);
				advance();
				continue;
			}
			break;
		}
		return name;
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
	constructor(expect: string, token: Token | TokenResult | undefined, full: string) {
		super(`Parse Error, Expect an ${expect}. \ngot: ${JSON.stringify(token)}\nfull: ${full}`);
	}
}

function getObjectDetail(path: string, objName: string): ObjectInfo | undefined {
	const libPath = path.split('#')[0];
	const html = readFileSync(join(rootPath, libPath), { encoding: 'utf-8' });
	const root = HTMLParser.parse(html, { fixNestedATags: true, parseNoneClosedTags: true });
	const body = root.querySelectorAll('body')[0];

	let StaticMethods: MethodInfo[] = [];
	let Methods: MethodInfo[] = [];
	let Properties: string[] = [];
	let extend: string | undefined = undefined;

	let tempArray: Array<string | MethodInfo> = StaticMethods;
	let status = '';

	for (const child of body.childNodes) {
		const element = child as HTMLParser.HTMLElement;
		if (element.id === 'StaticMethods') {
			tempArray = StaticMethods;
			status = 'StaticMethods'
		}
		if (element.id === 'Methods') {
			tempArray = Methods;
			status = 'Methods';
		}
		if (element.id === 'Properties') {
			tempArray = Properties;
			status = 'Properties';
		}
		if (element.localName === 'pre' && element.classNames === 'NoIndent') {
			const text = element.text;
			const parentInfo = /class\s+([\w\.]+)\s+extends\s+([\w\.]+)/.exec(text);
			if (parentInfo) {
				if (parentInfo[1] === objName)
					extend = parentInfo[2];
			}
		}
		if (element.classNames === 'methodShort') {
			// console.log(status);
			if (status === 'Properties') {
				tempArray.push(element.id);
				continue;
			}
			// Need not to do this, this is for the loop.
			if (element.id === '__Enum')
				continue;
			// this is also used in for loop
			if (element.id === 'OwnProps') {
				tempArray.push({
					name: 'OwnProps',
					parameter: []
				});
				continue;
			}
			const syntax = element.querySelector('.Syntax');
			if (!syntax) {
				console.log(`Can not get infomation of ${element.id}. Syntax node was not found.`);
				return undefined;
			}
			const optSafe = spanTagRender(syntax.text);
			const m = optSafe.replace(/<[\.\/\w\s"=#]+?>/g, '').trim();

			const mi = parseFunc(m);
			if (mi.name === objName) continue;
			tempArray.push(mi);
		}

	}
	if (StaticMethods.length === 0 &&
		Methods.length === 0 &&
		Properties.length === 0)
		console.log(`Can not get class infomation of ${objName}.`);

	return {
		name: objName,
		extend: extend,
		staticMethod: StaticMethods,
		method: Methods,
		property: Properties
	};
}

function getFunctionDetail(path: string, funcName: string) {
	if (funcName.endsWith('()'))
		funcName = funcName.slice(0, -2);
	const libPath = path.split('#')[0];
	const html = readFileSync(join(rootPath, libPath), { encoding: 'utf-8' });
	const root = HTMLParser.parse(html, { fixNestedATags: true, parseNoneClosedTags: true });
	// TODO: store parameter doc in params.
	const params = getParams(root);

	// If name of .htm is not the same of function name,
	// there are more than one function in one htm.
	// try find the element of function
	const syntax = libPath.includes(funcName) ?
		root.querySelector('.Syntax') :
		findFunctionInMulti(root, funcName);
	if (!syntax) {
		console.log(`Can not get function infomation of ${funcName}. Function name was not found in Syntax node.`);
		return undefined;
	}

	const optSafe = spanTagRender(syntax.text);
	const m = optSafe.replace(/<[\/\w\s"=#]+?>/g, '').trim();
	// Remove invaild token on .htm
	if (funcName === "FileSelect")
		return [parseFunc(m.replace('RootDir\\Filename', '"RootDir\\Filename"')), params];
	if (funcName === "StatusBarGetText" || funcName === "StatusBarWait")
		return [parseFunc(m.replace('Part#', '"Part#"')), params];
	if (funcName === 'Func' && !v2) 
		return undefined;
	if (funcName === 'Object' && !v2) 
		return undefined;
	

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
		return [infos, params];
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
