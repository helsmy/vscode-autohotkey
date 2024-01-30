import {
	CompletionItem,
	CompletionItemKind,
    Definition,
    Diagnostic,
    Connection,
    Location,
	ParameterInformation,
	Position,
	Range,
	SignatureHelp,
	SignatureInformation,
	SymbolInformation,
	SymbolKind,
    Hover,
    MarkupKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { 
    IFuncNode,
	ISymbolNode, 
	Word
} from '../parser/regParser/types';
import {
	INodeResult, 
	IFunctionCall, 
	IMethodCall, 
	IPropertCall, 
	IAssign, 
	IASTNode, 
	FunctionCall,
	MethodCall,
    ICommandCall,
    CommandCall
} from '../parser/regParser/asttypes';
import { SemanticStack, isExpr } from '../parser/regParser/semantic_stack';
import { 
    BuiltinFuncNode,
    buildBuiltinFunctionNode,
    buildBuiltinCommandNode,
    buildKeyWordCompletions,
    buildbuiltin_variable
} from '../utilities/constants';
import {
    dirname,
    extname,
    normalize,
    isAbsolute,
    join
} from 'path';
import { homedir } from "os";
import { IoEntity, IoKind, IoService } from './ioService';
import { SymbolTable } from '../parser/newtry/analyzer/models/symbolTable';
import { AHKParser } from '../parser/newtry/parser/parser';
import { PreProcesser } from '../parser/newtry/analyzer/semantic';
import { IParseError, Token } from '../parser/newtry/types';
import { IScope, ISymbol, VarKind } from '../parser/newtry/analyzer/types';
import { AHKBuiltinMethodSymbol, AHKDynamicPropertySymbol, AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, ScopedSymbol, VaribaleSymbol, isBuiltinSymbol, isClassObject, isMethodObject } from '../parser/newtry/analyzer/models/symbol';
import { DocInfo, IASTProvider } from './types';
import { IFindResult, ScriptASTFinder, binarySearchIndex } from './scriptFinder';
import { BracketIndex, Call, Identifier, Literal, PercentDereference, SuffixTerm } from '../parser/newtry/parser/models/suffixterm';
import * as Stmt from "../parser/newtry/parser/models/stmt";
import * as Expr from "../parser/newtry/parser/models/expr";
import { posInRange, rangeBefore } from '../utilities/positionUtils';
import { NodeConstructor } from '../parser/newtry/parser/models/parseError';
import { ClassDef, FuncDef, Parameter } from '../parser/newtry/parser/models/declaration';
import { NodeBase } from '../parser/newtry/parser/models/nodeBase';
import { convertSymbolsHover, convertSymbolCompletion, getFuncPrototype, convertBuiltin2Signature, convertFactorHover, convertNewClassHover } from './utils/converter';
import { resolveCommandCall, resolveFactor, resolveSubclass, searchPerfixSymbol } from './utils/symbolResolver';

function setDiffSet<T>(set1: Set<T>, set2: Set<T>) {
    let d12: Array<T> = [], d21: Array<T> = [];
    for(let item of set1) {
        if (!set2.has(item)) {
            d12.push(item);
        }
    }
    for(let item of set2) {
        if (!set1.has(item)) {
            d21.push(item);
        }
    }
    return [d12, d21];
}

export class TreeManager implements IASTProvider
{
    private conn: Connection;
	/**
	 * server cached documnets
	 */
	private serverDocs: Map<string, TextDocument>;
	/**
	 * server cached ahk config
	 * TODO: need finish
	 */
	private serverConfigDoc?: TextDocument;
	/**
	 * server cached AST for documents, respectively 
     * Map<uri, IDocmentInfomation>
	 */
    private docsAST: Map<string, DocInfo>;
    /**
     * local storaged AST of ahk documents, cached included documents
     */
    private localAST: Map<string, DocInfo>;

    /**
     * Server cached include informations for each documents
     * Map<DocmemtsUri, Map<IncludeAbsolutePath, RawIncludePath>>
     */
    private incInfos: Map<string, Map<string, string>>;

    private logger: ILoggerBase;

    private ioService: IoService;

    private finder: ScriptASTFinder;
    
    /**
     * built-in standard function AST
     */
	private readonly builtinFunction = buildBuiltinFunctionNode();
    
    /**
     * builtin standard command AST
     */
    private readonly builtinCommand = buildBuiltinCommandNode();

    private readonly keywordCompletions = buildKeyWordCompletions();

    private readonly builtinVarCompletions = buildbuiltin_variable();

    private currentDocUri: string;
    
    /**
     * Standard Library directory
     */
    private readonly SLibDir: string;
    
    /**
     * User library directory
     */
    private readonly ULibDir: string;

    public sendError: boolean = false;

    public v2CompatibleMode: boolean = false;

	constructor(conn: Connection, logger: ILoggerBase) {
        this.conn = conn;
		this.serverDocs = new Map();
        this.docsAST = new Map();
        this.localAST = new Map();
        this.incInfos = new Map();
        this.ioService = new IoService();
        this.finder = new ScriptASTFinder();
		this.serverConfigDoc = undefined;
        this.currentDocUri = '';
        // TODO: non hardcoded Standard Library
        this.SLibDir = 'C:\\Program Files\\AutoHotkey\\Lib'
        this.ULibDir = homedir() + '\\Documents\\AutoHotkey\\Lib'
        this.logger = logger;
    }

    public getDocInfo(uri: string): Maybe<DocInfo> {
        return this.docsAST.get(uri);
    }
    
    /**
     * Initialize information of a just open document
     * @param uri Uri of initialized document
     * @param doc TextDocument of initialized documnet
     */
    public initDocument(uri: string, doc: TextDocument) {
        this.currentDocUri = uri;
        // this.updateDocumentAST(uri, doc);
    }

    /**
     * Select a document for next steps. For provide node infomation of client requests
     * @param uri Uri of document to be selected
     */
	public selectDocument(uri: string) {
		this.currentDocUri = this.serverDocs.has(uri) ? uri : '';
		return this;
    }
    
    /**
     * Update infomation of a given document, will automatic load its includes
     * @param uri Uri of updated document
     * @param docinfo AST of updated document
     * @param doc TextDocument of update documnet
     */
	public async updateDocumentAST(uri: string, doc: TextDocument) {
        // update documnet
        this.serverDocs.set(uri, doc);
        const parser = new AHKParser(doc.getText(), doc.uri, this.logger);
        const ast = parser.parse();
        const preprocesser = new PreProcesser(ast.script);
        const processResult = preprocesser.process();
        const docTable = processResult.table;

        // updata AST first, then its includes
        const oldInclude = this.docsAST.get(uri)?.AST.script.include;
        // this.conn.sendDiagnostics({
        //     uri: uri,
        //     diagnostics: mainTable.diagnostics
        // });
        if (this.sendError) {
            this.sendErrors(ast.sytanxErrors, uri);
            this.conn.sendDiagnostics({
                uri: uri,
                diagnostics: processResult.diagnostics
            });
        }

        // Store AST first, before await document load
        // In case of other async function run ahead
        this.docsAST.set(uri, {
            AST: ast,
            table: docTable
        });
        
        let [useless, useneed] = this.compareInclude(oldInclude, ast.script.include)
        this.deleteUnusedInclude(doc.uri, useless);


        if (useneed.length === 0) {
            // just link its include and go.
            this.linkInclude(docTable, uri);
            return
        }
        // EnumIncludes
        await this.EnumIncludes(useneed, uri);
        // 一顿操作数组和解析器了之后，
        // 这个table和docinfo里的table之间的引用怎么没了得
        // 神秘
        this.linkInclude(docTable, uri);
        this.docsAST.set(uri, {
            AST: ast,
            table: docTable
        });
    }

    /**
     * Update cached include file AST when this file is saved
     * @param uri update file uri
     */
    public updateLocalAST(uri: string) {
        const ast = this.docsAST.get(uri);
        if (!ast) return;
        if (this.localAST.has(uri)) {
            this.localAST.set(uri, ast);
            for (const [docUri, doc] of this.docsAST)
                doc.table.updateInclude(ast.table)
        }
    }

    private compareInclude(oldInc: Maybe<Set<string>>, newInc: Maybe<Set<string>>): [string[], string[]] {
        if (oldInc && newInc) {
            // useless need delete, useneed need to add
            // FIXME: delete useless include
            const [useless, useneed] = setDiffSet(oldInc, newInc);
            this.logger.info(`Got ${newInc.size} include file. ${useneed.length} file to load.` )
            return [useless, useneed]
        }
        else {
            const useneed = newInc ? [... newInc] : [];
            this.logger.info(`Got ${useneed.length} include file to load.` )
            return [[], useneed]
        }
    }

    private deleteUnusedInclude(uri: string, useless: string[]) {
        // delete unused incinfo
        let incInfo = this.incInfos.get(uri);
        if (incInfo) {
            let tempInfo: string[] = [];
            // acquire absulte uri to detele 
            for (const uri of useless) {
                for (const [abs, raw] of incInfo) {
                    if (raw === uri)
                        tempInfo.push(abs);
                }
            }
            for (const abs of tempInfo)
                incInfo.delete(abs);
        } 
    }

    private async EnumIncludes(inc2update: string[], uri: string) {
        let incQueue: string[] = [...inc2update];
        // this code works why?
        // no return async always fails?
        let path = incQueue.shift();
        while (path) {
            const docDir = dirname(URI.parse(this.currentDocUri).fsPath);
            const p = this.include2Path(path, docDir);
            if (!p) {
                this.logger.info(`${path} is an invalid file name.`);
                path = incQueue.shift();
                continue;
            }
            else if (this.localAST.has(URI.file(p).toString())) {
                this.logger.info(`${path} is already loaded.`);
                if (this.incInfos.has(uri))
                    this.incInfos.get(uri)?.set(p, path);
                else
                    this.incInfos.set(uri, new Map([[p, path]]));
                path = incQueue.shift();
                continue;
            }

            const doc = await this.loadDocumnet(p);
            if (doc) {
                const parser = new AHKParser(doc.getText(), doc.uri, this.logger);
                const ast = parser.parse();
                const preprocesser = new PreProcesser(ast.script);
                const table = preprocesser.process();
                // cache to local storage file AST
                this.localAST.set(doc.uri, {
                    AST: ast,
                    table: table.table
                });
                // TODO: Correct document include tree
                if (this.incInfos.has(uri))
                    this.incInfos.get(uri)?.set(p, path);
                else
                    this.incInfos.set(uri, new Map([[p, path]]));
                incQueue.push(...Array.from(ast.script.include || []));
            }
            path = incQueue.shift();
        }
    }
    
    /**
     * Load and parse a set of documents. Used for process ahk includes
     * @param documnets A set of documents' uri to be loaded and parsed
     */
    private async loadDocumnet(path: string): Promise<Maybe<TextDocument>>  {
        const uri = URI.file(path);
        try {
            const c = await this.retrieveResource(uri);
            let document = TextDocument.create(uri.toString(), 'ahk', 0, c);
            return document;
        }
        catch (err) {
            this.logger.error(`Can not load file from ${path}`);
            return undefined;
        }
    }

    private linkInclude(table: SymbolTable, uri: string) {
        const includes = this.incInfos.get(uri);
        if (!includes) return; 
        for (const [path, raw] of includes) {
            const incUri = URI.file(path).toString();
            const incTable = this.localAST.get(incUri);
            if (!incTable) continue;
            table.addInclude(incTable.table);
        }
    }

    private sendErrors(errors: IParseError[], uri: string) {
        const diagnostics: Diagnostic[] = [];
        for (const e of errors) {
            diagnostics.push(
                Diagnostic.create(
                    Range.create(e.start, e.end),
                    e.message
                )
            );
        }
        this.conn.sendDiagnostics({
            uri: uri,
            diagnostics: diagnostics
        });
    }

    public updateErrors() {
        const uri = this.currentDocUri;
        if (this.sendError) {
            const ast = this.docsAST.get(uri);
            if (ast) {
                this.sendErrors(ast.AST.sytanxErrors, uri);
            }
        }
        else {
            this.sendErrors([], uri);
        }
    }

	public deleteUnusedDocument(uri: string) {
        let incinfo = this.incInfos.get(uri);
        this.docsAST.delete(uri);
        this.incInfos.delete(uri);
        if (incinfo) {
            for (const [path, raw] of incinfo) {
                let isUseless: boolean = true;
                for (const [docuri, docinc] of this.incInfos) {
                    if (docinc.has(path)) {
                        isUseless = false;
                        break;
                    }
                }
                if (isUseless) this.localAST.delete(URI.file(path).toString());
            }
        }
	}

    /**
   * Retrieve a resource from the provided uri
   * @param uri uri to load resources from
   */
    private retrieveResource(uri: URI): Promise<string> {
        const path = uri.fsPath;
        return this.ioService.load(path);
    }

    /**
     * Return a line of text up to the given position
     * @param position position of end mark
     */
	private LineTextToPosition(position: Position): Maybe<string> {
		if (this.currentDocUri) {
			return this.serverDocs
				.get(this.currentDocUri)
				?.getText(Range.create(
					Position.create(position.line, 0),
					position
				)).trimRight();
		}
    }
    
    /**
     * Return the text of a given line
     * @param line line number
     */
    private getLine(line: number): Maybe<string> {
        if (this.currentDocUri) {
			return this.serverDocs
				.get(this.currentDocUri)
				?.getText(Range.create(
					Position.create(line, 0),
					Position.create(line+1, 0)
				)).trimRight();
		}
    }

    private include2Path(rawPath: string, scriptPath: string): Maybe<string> {
        const scriptDir = scriptPath;
        const normalized = normalize(rawPath);
        switch (extname(normalized)) {
            case '.ahk':
                if (!isAbsolute(normalized)) // if dir start as ../ or .
                    return join(scriptDir, normalized);
                else    // absolute path
                    return normalized;
            // lib include <lib name>
            case '':
                if (rawPath[0] === '<' && rawPath[rawPath.length-1] === '>') {
                    let searchDir: string[] = []
                    const np = normalize(rawPath.slice(1, rawPath.length-1)+'.ahk');
                    const dir = normalize(scriptDir + '\\Lib\\' + np);
                    const ULibDir = normalize(this.ULibDir + '\\' + np);
                    const SLibDir = normalize(this.SLibDir + '\\' + np);
                    searchDir.push(dir, ULibDir, SLibDir);
                    for(const d of searchDir) {
                        if (this.ioService.fileExistsSync(d))
                            return d;
                    }
                }
                // TODO: handle include path change
                return undefined;
            default:
                return undefined;
        }
    }

    public docSymbolInfo(): SymbolInformation[] {
        const info = this.docsAST.get(this.currentDocUri);
        if (!info) return [];
        return info.table.symbolInformations();
    }

    public getGlobalCompletion(): CompletionItem[] {
        let incCompletion: CompletionItem[] = [];
        let docinfo: DocInfo|undefined;
        if (this.currentDocUri)
            docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return [];
        const symbols = docinfo.table.allSymbols();
        // TODO: 应该统一只用this.allIncludeTreeinfomation
        const incInfo = this.incInfos.get(this.currentDocUri) || []
        // 为方便的各种重复存储，还要各种加上累赘代码，真是有点沙雕
        for (let [path, raw] of incInfo) {
            const incUri = URI.file(path).toString();
            // read include file tree from disk file tree caches
            const table = this.localAST.get(incUri)?.table;
            if (table) {
                incCompletion.push(...table.allSymbols().map(node => {
                    let c = convertSymbolCompletion(node);
                    c.data += '  \nInclude from ' + raw;
                    return c;
                }))
            }
        }
        
        return symbols.map(sym => convertSymbolCompletion(sym))
        .concat(this.builtinFunction.map(node => {
            let ci = CompletionItem.create(node.name);
            ci.data = getFuncPrototype(node);
            ci.kind = CompletionItemKind.Function;
            return ci;
        }))
        .concat(this.builtinCommand.map(node => {
            let ci = CompletionItem.create(node.name);
            ci.data = getFuncPrototype(node, true);
            ci.kind = CompletionItemKind.Function;
            return ci;
        }))
        .concat(incCompletion);
    }

    public getSymbolCompletion(scope: IScope): Maybe<CompletionItem[]> {
        if (scope.name === 'global') return this.getGlobalCompletion()
                                    .concat(this.keywordCompletions)
                                    .concat(this.builtinVarCompletions);
            // Now scoop is a method.
            const symbols = scope.allSymbols();
            return symbols.map(sym => convertSymbolCompletion(sym))
                    .concat(this.getGlobalCompletion())
                    .concat(this.keywordCompletions)
                    .concat(this.builtinVarCompletions);
    }

    public getScopedCompletion(pos: Position): Maybe<CompletionItem[]> {
        let docinfo: DocInfo|undefined;
        docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return undefined;
        
        const scope = this.getCurrentScope(pos, docinfo.table);
        const found = this.finder.find(docinfo.AST.script.stmts, pos, [Expr.Factor]);
        
        // if nothing found, just do scoped symbol completion
        if (found === undefined || found.nodeResult === undefined)
            return this.getSymbolCompletion(scope);

        // Should not happen
        // FIXME: raise Exception here, to log the wrong function trace
        if (!(found.nodeResult instanceof Expr.Factor)) return undefined;

        const node = found.nodeResult
        // if we are in atom do scoped symbol completion
        if (posInRange(node.suffixTerm.atom, pos)) {
            return this.getSymbolCompletion(scope);
        }

        // now we need completions about suffix
        return this.getSuffixCompletion(node, scope, pos);

        // TODO: failback to old way
        // const lexems = this.getLexemsAtPosition(pos);
        // if (lexems && lexems.length > 1) {
        //     const perfixs = lexems.reverse();
        //     const symbol = this.searchPerfixSymbol(perfixs.slice(0, -1), scope);
        //     if (!symbol) return undefined;
        //     return symbol.allSymbols().map(sym => this.convertSymCompletion(sym));
        // }
    }

    /**
     * Get all completions related to the suffix 
     * @param node factor contains the suffix terms
     * @param scope current scope of the suffix
     * @param pos postion of the request
     */
    private getSuffixCompletion(node: Expr.Factor, scope: IScope, pos: Position): Maybe<CompletionItem[]> {
        const suffix = node.trailer;
        if (suffix === undefined) 
            return undefined;

        let allTerms = [];
        for (const item of suffix.suffixTerm.getElements()) {
            if (posInRange(item, pos) || rangeBefore(item, pos)) 
                allTerms.push(item);
        }

        let nextScope = this.resolveSuffixTermSymbol(node.suffixTerm, scope);
        if (nextScope instanceof VaribaleSymbol) {
            const varType = nextScope.getType();
            // not a instance of class
            if (varType.length === 0) return undefined;
            nextScope = searchPerfixSymbol(varType, scope);
        }
        if (!(nextScope && nextScope instanceof AHKObjectSymbol)) return undefined;
        for (const lexem of allTerms) {
            const currentScope = this.resolveSuffixTermSymbol(lexem, nextScope as AHKObjectSymbol, true);
            // if (currentScope === undefined) return undefined;
            if (currentScope && currentScope instanceof AHKObjectSymbol) {
                nextScope = currentScope
            }
            else if (currentScope instanceof VaribaleSymbol) {
                const varType = currentScope.getType();
                // not a instance of class
                if (varType.length === 0) return undefined;
                const referenceScope = searchPerfixSymbol(varType, nextScope as AHKObjectSymbol);
                if (referenceScope === undefined) return undefined;
                nextScope = referenceScope
            }
            else 
                return undefined;
        }
        if (nextScope instanceof AHKObjectSymbol)
            return nextScope.allSymbols().map(sym => convertSymbolCompletion(sym));
        return undefined;
    }

    /**
     * Find type class symbol of target suffix
     * @param suffix target suffix
     * @param scope current type symbol
     * @param alwaysResolveProp does always take scope as class 
     */
    private resolveSuffixTermSymbol(suffix: SuffixTerm, scope: IScope, alwaysResolveProp?: boolean): Maybe<ISymbol> {
        const { atom, brackets } = suffix;

        // TODO: no type casting on function call for now
        for (const bracket of brackets) {
            if (bracket instanceof Call) return undefined;
        }

        if (atom instanceof Identifier) {
            // factor的第一个符号的类型需要从当前作用域找到
            // 之后的符号的都是类的属性需要用resolveProp
            const sym = alwaysResolveProp ? 
                        // 懒得写根据参数的类型了就类型断言解决了
                        (<AHKObjectSymbol>scope).resolveProp(atom.token.content):
                        scope.resolve(atom.token.content);
            // no more index need to be resolve here
            if (brackets.length === 0) return sym;
            if (!(sym instanceof AHKObjectSymbol)) return undefined
            // resolve rest index
            let nextScope = sym;
            for (const bracket of brackets) {
                // FIXME: indexs may be empty string
                const { indexs } = (<BracketIndex>bracket);
                // no type casting on complex indexing
                if (indexs.length !== 1) return undefined;
                const first = indexs.childern[0]
                if (first instanceof Expr.Factor && first.suffixTerm.atom instanceof Literal) {
                    const current = nextScope.resolveProp(first.suffixTerm.atom.token.content);
                    if (!(current instanceof AHKObjectSymbol)) return undefined;
                    nextScope = current;
                    continue;
                }
                
            }
        }
        // 不管动态特性
        if (atom instanceof PercentDereference) return undefined;
        // TODO: 字符串和数字的fakebase特性
        // TODO: 数组和关联数组的自带方法
    }

    public getTokenAtPos(pos: Position): Maybe<Token> {
        const docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return undefined;
        const tokens = docinfo.AST.script.tokens;
        const i = this.getTokenIndexAtPos(pos, tokens);
        if (i === undefined) return undefined;
        return tokens[i];
    }

    private getTokenIndexAtPos(pos: Position, tokens: Token[]): Maybe<number> {
        let start = 0;
        let end = tokens.length - 1;
        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            const token = tokens[mid];
            // start <= pos
            const isAfterStart = token.start.line < pos.line ? true : 
                                    token.start.line === pos.line ? 
                                        token.start.character <= pos.character ? true : 
                                    false : 
                                false;
            // end >= pos
            const isBeforeEnd = token.end.line > pos.line ? true : 
                                    token.end.line === pos.line ? 
                                        token.end.character >= pos.character ? true : 
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

    /**
     * Find current position is belonged to which scoop
     * @param pos position of current request
     * @param table symbol table of current document
     * @returns Scoop of current position
     */
    private getCurrentScope(pos: Position, table: IScope): IScope {
        const symbols = table instanceof AHKDynamicPropertySymbol? table.allSymbolsFull() : table.allSymbols();
        for (const sym of symbols) {
            typeof sym
            if (sym instanceof AHKMethodSymbol || 
                sym instanceof AHKObjectSymbol ||
                sym instanceof AHKDynamicPropertySymbol) {
                if (this.isLessEqPosition(sym.range.start, pos)
                    && this.isLessEqPosition(pos, sym.range.end) ) {
                    return this.getCurrentScope(pos, sym);
                }
            }
        }
        // no matched scoop return position is belongs to its parent scoop
        return table;
    }

    /**
     * Return if pos1 is before pos2
     * @param pos1 position 1
     * @param pos2 position 2
     */
    private isLessEqPosition(pos1: Position, pos2: Position): boolean {
        if (pos1.line < pos2.line) return true;
        if (pos1.line === pos2.line && pos1.character <= pos2.character) 
            return true;
        return false;
    }

    /**
     * Return if pos1 is after pos2
     * @param pos1 position 1
     * @param pos2 position 2
     */
    private isGreatEqPosition(pos1: Position, pos2: Position): boolean {
        if (pos1.line > pos2.line) return true;
        if (pos1.line === pos2.line && pos1.character >= pos1.character) 
            return true;
        return false;
    }


    public includeDirCompletion(position: Position): Maybe<CompletionItem[]> {
        const context = this.LineTextToPosition(position);
        const reg = /^\s*#include/i;
        if (!context) return undefined;
        let match = context.match(reg);
        if (!match) return undefined;
        // get dir text
        const p = context.slice(match[0].length).trim();
        const docDir = dirname(URI.parse(this.currentDocUri).fsPath);
        let searchDir: string[] = []
        // if is lib include, use lib dir
        if (p[0] === '<') {
            const np = normalize(p.slice(1));
            const dir = normalize(docDir + '\\Lib\\' + np);
            const ULibDir = normalize(this.ULibDir + '\\' + np);
            const SLibDir = normalize(this.SLibDir + '\\' + np);
            searchDir.push(dir, ULibDir, SLibDir);
        } 
        // absolute dirctory
        if (isAbsolute(p)) {
            searchDir.push(p);
        }
        // relative dirctory
        else {
            const dir = normalize(docDir + '\\' + normalize(p));
            searchDir.push(dir);
        }
        let completions: IoEntity[] = []
        for (const dir of searchDir) {
            completions.push(...this.ioService.statDirectory(dir));
            // If is not '#include <', because of library search order 
            // we must not search all directory. Once we found an exist directory, 
            // we return it
            if (completions.length > 0 && p !== '<') break;
        }
        return completions.map((completion):CompletionItem => {
            let c = CompletionItem.create(completion.path);
            c.kind = completion.kind === IoKind.folder ? 
                     CompletionItemKind.Folder :
                     CompletionItemKind.File;
            return c;
        }
        );
    }

    /**
     * All words at a given position(top scope at last)
     * @param position 
     */
    private getLexemsAtPosition(position: Position): Maybe<string[]> {
        const context = this.getLine(position.line);
        if (!context) return undefined;
        let suffix = this.getWordAtPosition(position);
        let perfixs: string[] = [];
        let temppos = (suffix.name === '') ? 
                    position.character-1 : // we need pre-character of empty suffix
                    suffix.range.start.character-1;

        // Push perfixs into perfixs stack
        while (this.getChar(context, temppos) === '.') {
            // FIXME: correct get word here 
            let word = this.getWordAtPosition(Position.create(position.line, temppos-1));
            perfixs.push(word.name);
            temppos = word.range.start.character-1;
        }
        return [suffix.name].concat(perfixs);
    }

    /**
     * Get node of position and lexems
     * @param lexems all words strings(这次call，全部的分割词)
     * @param position position of qurey word(这个call的位置)
     */
    private searchNode(lexems: string[], position: Position): Maybe<ISymbol> {
        const docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return undefined;
        const scope = this.getCurrentScope(position, docinfo.table);
        if (lexems.length > 1) {
            // check if it is a property access
            // FIXME: 把这个遗留的反转的分词顺序解决一下
            const perfixs = lexems.reverse().slice(0, -1);
            const symbol = searchPerfixSymbol(perfixs, scope);
            return symbol ? symbol.resolveProp(lexems[lexems.length-1]) : undefined;
        }
        
        return lexems[0] !== undefined ? scope.resolve(lexems[0]) : undefined;
    }


    /**
     * search at given tree to 
     * find the deepest node that
     * covers the given condition
     *  
     * @param pos position to search
     * @param tree AST tree for search
     * @param kind symbol kind of search item
     */
    public searchNodeAtPosition(pos: Position, tree: Array<ISymbolNode|IFuncNode>, kind?:SymbolKind): Maybe<ISymbolNode|IFuncNode> {
        for (const node of tree) {
            if (pos.line > node.range.start.line && pos.line < node.range.end.line) {
                if (node.subnode) {
                    if (kind && !(node.kind === kind)) {
                       continue;
                    }
                    let subScopedNode = this.searchNodeAtPosition(pos, node.subnode, kind);
                    if (subScopedNode) {
                        return subScopedNode;
                    } 
                    else {
                        return node;
                    }
                }
            }
        }
        return undefined;
    }

    public getSignatureHelp(position: Position): Maybe<SignatureHelp> {
        const docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return undefined;
        const token = this.getTokenAtPos(position);
        if (!token) return undefined;
        const found = this.finder.find(docinfo.AST.script.stmts, position, [Call, Stmt.CommandCall])

        // If finder did not find anything, failback to old way.
        if (found === undefined) {
            this.logger.log('SignatureHelp: Fail back to old way.');
            return this.getSignatureHelpOld(position);
        }

        if (found.nodeResult instanceof Stmt.CommandCall) {
            return this.findCommandSignature(
                found.nodeResult.command.content, 
                this.findActiveParam(found.nodeResult, position)
            );
        }

        // Stop at `)`
        if (position.line >= found.nodeResult.end.line &&
            position.character >= found.nodeResult.end.character) return undefined;
        // Wrong result, should not happen
        // 这个outterFactor就一个用处，找Call的时候带上从属的Factor
        // 毕竟Call里面就只有调用的参数
        if (found.outterFactor === undefined || !(found.nodeResult instanceof Call)) return undefined;
        const scope = this.getCurrentScope(position, docinfo.table);

        const relativeSymbol = resolveFactor(found.outterFactor.nodeResult, position, scope);
        if (!relativeSymbol) return undefined;
        
        let func = relativeSymbol[relativeSymbol.length - 1];
        // Wrong result, should not happen
        if (!(func instanceof ScopedSymbol)) 
            return undefined;
        if (!isMethodObject(func)) {
            // found里不包含factor外面是不是new表达式
            // 懒了，不想给new表达式专门判断是不是
            // 如果是Class symbol一律按照是new表达式处理
            // 就当是永远兼容v2了
            if (!isClassObject(func)) return undefined;
            const constructor = func.resolveProp('__new');
            if (!constructor || !isMethodObject(constructor)) return undefined;
            func = constructor;
        }
        // Make TS Happy OTZ
        if (!isMethodObject(func)) return undefined;
        
        let index = this.findActiveParam(found.nodeResult, position);
        const reqParam: ParameterInformation[] = func.requiredParameters.map(param => ({
            label: `${param.isByref ? 'byref ' : ''}${param.name}`
        }));
        const optParam: ParameterInformation[] = func.optionalParameters.map((param, i) => {
            // fix active parameter on spread parameter
            index = param.isSpread ? reqParam.length+i : index;
            return {label: `${param.isByref ? 'byref ' : ''}${param.name}${param.isSpread? '*': '?'}`};
        });
        return {
            signatures: [SignatureInformation.create(
                func.toString(),
                undefined,
                ...reqParam,
                ...optParam
            )],
            activeSignature: 0,
            activeParameter: index
        };
    }

    private getSignatureHelpOld(position: Position): Maybe<SignatureHelp> {
        const node: Maybe<INodeResult<IASTNode>> = this.findFuncAtPosOld(position);
        if (node === undefined) return undefined;
        const stmt = node as INodeResult<IFunctionCall | IMethodCall | IPropertCall | IAssign | ICommandCall>;
        let perfixs: string[] = [];
        if (stmt.value instanceof FunctionCall ) {
            // CommandCall always no errors
            if (!stmt.errors && !(stmt.value instanceof CommandCall)) {
                return undefined;
            }
            let lastnode = this.getUnfinishedFunc(stmt.value);
            if (!lastnode) {
                lastnode = stmt.value;
            } 
            if (lastnode instanceof MethodCall) {
                perfixs = lastnode.ref.map(r => {
                    return r.content;
                });
            }

            const funcName = lastnode.name;
            let index = lastnode.actualParams.length===0 ?
                        undefined: lastnode.actualParams.length-1;
            if (lastnode instanceof CommandCall) {
                // All Commands are built-in, just search built-in Commands
                const bfind = arrayFilter(this.builtinCommand, item => item.name.toLowerCase() === funcName.toLowerCase());
                const info = convertBuiltin2Signature(bfind, true);
                if (info) {
                    return {
                        signatures: info,
                        activeParameter: index,
                        activeSignature: this.findActiveSignature(bfind, index || 0)
                    }
                }
            }
            let find = this.searchNode([funcName].concat(...perfixs.reverse()), position);
            // if no find, search build-in
            if (!find) {
                const bfind = arrayFilter(this.builtinFunction, item => item.name.toLowerCase() === funcName.toLowerCase());
                const info = convertBuiltin2Signature(bfind);
                if (info) {
                    return {
                        signatures: info,
                        activeParameter: index,
                        activeSignature: this.findActiveSignature(bfind, index || 0)
                    }
                }
            }
            if (find instanceof AHKMethodSymbol) {
                const reqParam: ParameterInformation[] = find.requiredParameters.map(param => ({
                    label: `${param.isByref ? 'byref ' : ''}${param.name}`
                }));
                const optParam: ParameterInformation[] = find.optionalParameters.map((param, i) => {
                    // fix active parameter on spread parameter
                    index = param.isSpread ? reqParam.length+i : index;
                    return {label: `${param.isByref ? 'byref ' : ''}${param.name}${param.isSpread? '*': '?'}`};
                });
                return {
                    signatures: [SignatureInformation.create(
                        find.toString(),
                        undefined,
                        ...reqParam,
                        ...optParam
                    )],
                    activeSignature: 0,
                    activeParameter: index
                };
            }
        }
        return undefined;
    }

    /**
     * Get all name token content of a `name.name.+`,
     * until given position.
     * @param factor factor expression
     * @param pos    given position
     * @returns list of class(function) name
     */
    private getAllName(factor: Expr.Factor, pos: Position): string[] {
        let names: string[] = []
        // TODO: Support fake base. eg "String".Method()
        if (!(factor.suffixTerm.atom instanceof Identifier))
            return names;
        names.push(factor.suffixTerm.atom.token.content);
        if (factor.trailer === undefined) return names;
        if (posInRange(factor.suffixTerm.atom, pos)) return names;
        const elements = factor.trailer.suffixTerm.getElements();
        for (let i = 0; i < elements.length; i += 1) {
            const suffix = elements[i];
            const isInRange = posInRange(suffix, pos)
            // TODO: 复杂的索引查找，估计不会搞这个，
            // 动态语言的类型推断不会，必不可能搞
            // 条件：任何的一种括号，并且这个括号不是最后一个，以防是在请求括号前的所有标识符
            if (suffix.brackets && i < elements.length - 1 && !isInRange) return [];
            if (!(suffix.atom instanceof Identifier)) return [];
            names.push(suffix.atom.token.content);
            // If we are at the position of request position,
            // rest name is needless.
            if (isInRange) return names;
        }
        return names;
    }

    private findCommandSignature(name: string, index: Maybe<number>): Maybe<SignatureHelp> {
        const bfind = arrayFilter(this.builtinCommand, item => item.name.toLowerCase() === name.toLowerCase());
        const info = convertBuiltin2Signature(bfind, true);
        if (info) {
            return {
                signatures: info,
                activeParameter: index,
                activeSignature: this.findActiveSignature(bfind, index || 0)
            }
        }
    }

    private findActiveParam(node: Call|Stmt.CommandCall, pos: Position): Maybe<number> {
        const args = node.args;
        if (args.length === 0) return 0;
        
        // Find range of each parameter
        let actualParams: Range[] = [];
        for (let i = 0; i < args.length; i += 1) {
            const arg = args.childern[i];
            if (arg instanceof Token ) {
                if (i === 0) {
                    actualParams.push(Range.create(
                        node instanceof Call ?
                            node.open.end:
                            node.command.end,
                        arg.start
                    ));
                }
                if (args.childern[i + 1] instanceof Token) {
                    const r = Range.create(
                        arg.end, 
                        args.childern[i + 1].start
                    ); 
                    actualParams.push(r);
                }
                if (i === args.length - 1) {
                    actualParams.push(Range.create(
                        arg.end, 
                        node instanceof Call ?
                            node.close.start :
                            node.end
                    ));
                } 
                continue;
            }
            // 参数的范围是在两个`,`之间
            const r = Range.create(
                i === 0 ? arg.start : args.childern[i - 1].end, 
                i < args.length - 1 ? args.childern[i + 1].start : arg.end
            )
            actualParams.push(r);
        }
        const active = binarySearchIndex(actualParams, pos);
        return active ?? undefined;
    }

    private findFuncAtPosOld(position: Position): Maybe<INodeResult<IASTNode>> {
        let context = this.LineTextToPosition(position);
		if (!context) return undefined;

        // check if we need to attach to previous lines
        const attachToPreviousTest = new RegExp('^[ \t]*,');
        if (attachToPreviousTest.test(context)) {
            let linenum = position.line-1;
            let lines: Maybe<string> = this.getLine(linenum);
            context = lines + context;
            while (lines) {
                if (attachToPreviousTest.test(lines)) {
                    linenum -= 1;
                    lines = this.getLine(linenum);
                    context = lines + context;
                } 
                else
                    lines = undefined;
            }
        }

        let stmtStack = new SemanticStack(context);
        let stmt: INodeResult<IFunctionCall| IMethodCall | IPropertCall | IAssign | ICommandCall>|undefined;
        try {
            stmt = stmtStack.statement();
        }
        catch (err) {
            return undefined;
        }
        if (!stmt) {
            return undefined;
        }

        let node: INodeResult<IASTNode> = stmt;
        if (isExpr(stmt.value)) {
            node = stmt.value.right;
            while(isExpr(node.value)) {
                node = node.value.right;
            }
        }

        return node;
    }

    /**
     * Find the deepest unfinished Function of a AST node
     * @param node Node to be found
     */
    private getUnfinishedFunc(node: IFunctionCall): Maybe<IFunctionCall> {
        let perfixs: string[]|undefined;
        let lastParam = node.actualParams[node.actualParams.length-1];
        // no-actual-parameter check 
        if (!lastParam || !lastParam.errors) {
            return undefined;
        }
        if (lastParam.value instanceof FunctionCall) {
            let lastnode = this.getUnfinishedFunc(lastParam.value);
            if (lastnode) {
                if (node instanceof FunctionCall) {
                    return lastnode
                }
            }
            return lastParam.value;
        }
        return node;
    }

    /**
     * Find which index of signatures is active
     * @param symbols symbols to be found
     * @param paramIndex active parameter index
     * @returns active signature index
     */
    private findActiveSignature(symbols: BuiltinFuncNode[], paramIndex: number): number {
        for (let i = 0; i < symbols.length; i++) {
            const sym = symbols[i];
            if (sym.params.length >= paramIndex)
                return i;
        }
        return 0;
    }

    public getDefinitionAtPosition(position: Position): Maybe<Location[]> {
        const symbol = this.getSymbolAtPosition(position, Expr.Factor, Call);
        if (symbol === undefined) return undefined;

        let locations: Location[] = [];
        if (symbol instanceof VaribaleSymbol ||
            symbol instanceof AHKMethodSymbol ||
            symbol instanceof AHKObjectSymbol)
            locations.push(Location.create(
                symbol.uri,
                symbol.range
            ));
        return locations;
    }

    public getHoverAtPosition(position: Position): Maybe<Hover> {
        const token = this.getTokenAtPos(position);
        if (token === undefined) return undefined;
        let docinfo: DocInfo|undefined;
        docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return undefined;

        const AST = docinfo.AST.script.stmts;
        const find = this.finder.find(AST, position, [Expr.Factor, Stmt.CommandCall, Parameter, FuncDef, ClassDef]);
        if (find === undefined) return undefined;
        
        const node = find.nodeResult
        const scope = this.getCurrentScope(position, docinfo.table);
        if (node instanceof Expr.Factor) {
            return convertFactorHover(node, position, scope, token, this.v2CompatibleMode);
        }
        // 只有为new表达式时才为 unary
        else if (node instanceof Expr.Unary) {
            // 不对复杂的表达式作处理，只考虑直接接 factor 的情况
            if (!(node.factor instanceof Expr.Factor)) return;
            return convertNewClassHover(node.factor, position, docinfo.table, token);
        }
        else if (node instanceof Stmt.CommandCall) {
            const cmd = resolveCommandCall(node);
            if (!cmd) return undefined;
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: '```autohotkey\n'+cmd+'\n```'
                },
                range: token
            };
        }
        else if (node instanceof Parameter) {
            const symbol = scope.resolve(node.identifier.content);
            return symbol ? convertSymbolsHover([symbol], token) : undefined;
        }
        else if (node instanceof FuncDef) {
            // Block hint in body content
            const block = node.body;
            if (posInRange(block, position)) return undefined;
            // Should not happen
            if (!(scope instanceof AHKMethodSymbol)) return undefined;

            // If hover on function decleration, 
            // current scope is the symbol of finding
            const last = scope;
            let symbols: AHKSymbol[] = [last];
            // Find if function is belong to a class
            const parent = last.parentScoop;
            if (parent === undefined)
                return convertSymbolsHover([last], token);

            const prefix = resolveSubclass(parent);
            return convertSymbolsHover(prefix.concat(last), token);
        }
        else if (node instanceof ClassDef) {
            // Block hint in body content
            const block = node.body;
            if (posInRange(block, position)) return undefined;
            // Should not happen
            if (!(scope instanceof AHKObjectSymbol)) return undefined;

            // If hover on class decleration, 
            // current scope is the symbol of finding
            return convertSymbolsHover(resolveSubclass(scope), token);
        }
    }

    private getSymbolAtPosition(position: Position, ...matchNodeType: NodeConstructor[]): Maybe<ISymbol> {
        let docinfo: DocInfo|undefined;
        docinfo = this.docsAST.get(this.currentDocUri);
        if (!docinfo) return undefined;

        const AST = docinfo.AST.script.stmts;
        const find = this.finder.find(AST, position, matchNodeType);
        if (find && find.nodeResult instanceof Expr.Factor) {
            const scope = this.getCurrentScope(position, docinfo.table);
            const symbol = resolveFactor(find.nodeResult, position, scope);
            // last symbol is the symbol on the position
            return symbol ? symbol[symbol.length - 1] : undefined;
        }
        
        // Fail back to old way
        const lexems = this.getLexemsAtPosition(position);
        if (!lexems) return undefined;

        const symbol = this.searchNode(lexems, position);
        if (!symbol) return undefined;
        return symbol;
    }

    private getWordAtPosition(position: Position): Word {
        let reg = /[a-zA-Z0-9\u4e00-\u9fa5#_@\$\?]+/;
		const context = this.getLine(position.line);
		if (!context)
			return Word.create('', Range.create(position, position));
        let wordName: string;
        let start: Position;
        let end: Position;
        let pos: number;

        pos = position.character;
        // Scan start
        // Start at previous character
        // 从前一个字符开始
        while (pos >= 0) {
            if(reg.test(this.getChar(context, pos-1)))
                pos -= 1;
            else
                break;
        }

        start = Position.create(position.line, pos);

        pos = position.character
        // Scan end
        while (pos <= context.length) {
            if(reg.test(this.getChar(context, pos)))
                pos += 1;
            else
                break;
        }
        
        end = Position.create(position.line, pos);
        wordName = context.slice(start.character, end.character);
        return Word.create(wordName, Range.create(start, end));
    }

    private getChar(context: string, pos: number): string {
        try {
            // if (context[pos] === '\r' || context[pos] === '\t')
            return context[pos] ? context[pos] : '';
        } catch (err) {
            return '';
        }
	}
}

/**
 * Get eligible items in the array(找到数组中符合callback条件的项)
 * @param list array to be filted
 * @param callback condition of filter
 */
function arrayFilter<T>(list: Array<T>, callback: (item: T) => boolean): T[] {
    let flag = false;
    const items: T[] = [];

    // search a continueous block of symbols
    for (const item of list) {
        if (callback(item)) {
            items.push(item);
            flag = true;
        }
        else if (flag === true) 
            break;
    }
    return items;
}
