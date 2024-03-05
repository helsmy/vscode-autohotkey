import {
	CompletionItem,
	CompletionItemKind,
    Definition,
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
    MarkupKind,
    TextDocuments,
    InitializeResult,
    InitializeParams,
    TextDocumentSyncKind,
    DidChangeConfigurationNotification,
    DocumentSymbolParams,
    SignatureHelpParams,
    CancellationToken,
    DefinitionParams,
    HoverParams,
    CompletionParams,
    SemanticTokenTypes,
    SemanticTokenModifiers,
    SemanticTokens,
    SemanticTokensParams,
    SemanticTokensBuilder
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { 
    IFuncNode,
	ISymbolNode, 
	Word
} from './parser/regParser/types';
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
} from './parser/regParser/asttypes';
import { SemanticStack, isExpr } from './parser/regParser/semantic_stack';
import { 
    BuiltinFuncNode,
    buildBuiltinFunctionNode,
    buildBuiltinCommandNode,
    buildKeyWordCompletions,
    buildbuiltin_variable,
    ServerName
} from './constants';
import {
    dirname,
    extname,
    normalize,
    isAbsolute,
    join,
    relative
} from 'path';
import { IoEntity, IoKind, IoService } from './services/ioService';
import { IScope, ISymbol } from './parser/newtry/analyzer/types';
import { AHKDynamicPropertySymbol, AHKMethodSymbol, AHKObjectSymbol, AHKSymbol, ScopedSymbol, VaribaleSymbol, isClassObject, isMethodObject } from './parser/newtry/analyzer/models/symbol';
import { ScriptASTFinder } from './services/scriptFinder';
import { ArrayTerm, Call, Identifier, Literal, PercentDereference, SuffixTerm } from './parser/newtry/parser/models/suffixterm';
import * as Stmt from "./parser/newtry/parser/models/stmt";
import * as Expr from "./parser/newtry/parser/models/expr";
import { binarySearchIndex, binarySearchRange, posInRange, rangeBefore } from './utilities/positionUtils';
import { NodeConstructor } from './parser/newtry/parser/models/parseError';
import { ClassDef, FuncDef, Parameter } from './parser/newtry/parser/models/declaration';
import { convertSymbolsHover, convertSymbolCompletion, getFuncPrototype, convertBuiltin2Signature, convertFactorHover, convertNewClassHover } from './services/utils/converter';
import { resolveCommandCall, resolveFactor, resolveSubclass, searchPerfixSymbol } from './services/utils/symbolResolver';
import { Token } from './parser/newtry/tokenizor/types';
import { ConfigurationService } from './services/configurationService';
import { Notifier } from './services/utils/notifier';
import { DocumentService, IBuiltinScope } from './services/documentService';
import { IClientCapabilities } from './types';
import { IAST } from './parser/newtry/types';
import { docLangName } from './services/config/serverConfiguration';
import { builtin_variable } from './utilities/builtins';
import { SymbolTable } from './parser/newtry/analyzer/models/symbolTable';

export class AHKLS
{
    private conn: Connection;

    private finder: ScriptASTFinder;
    
    /**
     * built-in standard function AST
     */
	private readonly builtinFunction = buildBuiltinFunctionNode();
    
    /**
     * builtin standard command AST
     */
    private readonly builtinCommand = buildBuiltinCommandNode();

    private readonly builtinScope: IBuiltinScope

    private readonly keywordCompletions = buildKeyWordCompletions();

    private readonly builtinVarCompletions = buildbuiltin_variable();

    private logger: ILoggerBase;

    private documentService: DocumentService;
    // text document manager
    private documents: TextDocuments<TextDocument>;

    private ioService: IoService;

    private configurationService: ConfigurationService

    private _configurationDone = new Notifier();

    public sendError: boolean = false;

    public v2CompatibleMode: boolean = false;
    private currentDocUri: string = '';

	constructor(conn: Connection, logger: ILoggerBase, config: ConfigurationService) {
        this.conn = conn;
        this.finder = new ScriptASTFinder();
        this.logger = logger;
        this.documents = new TextDocuments(TextDocument);
        this.documentService = new DocumentService(conn, this.documents, logger, this.v2CompatibleMode);
        this.ioService = new IoService();
        this.configurationService = config;

        this.builtinScope = this.documentService.builtinScope;
        this._configurationDone.reset();

        this.conn.onInitialize(this.onInitialize.bind(this));
        this.conn.onInitialized(this.onInitialized.bind(this));
        this.conn.onDocumentSymbol(this.onDocumentSymbol.bind(this));
        this.conn.onSignatureHelp(this.onSignatureHelp.bind(this));
        this.conn.onDefinition(this.onDefinition.bind(this));
        this.conn.onHover(this.onHover.bind(this));
        this.conn.onCompletion(this.onCompletion.bind(this));
        this.conn.onCompletionResolve(this.onCompletionResolve.bind(this));
        // this.conn.languages.semanticTokens.on(this.onSemanticTokens.bind(this))

        this.documents.onDidOpen(e => this.initDocument(e.document.uri, e.document));

        config.on('change', this.onConfigChange.bind(this));
        config.on('change', this.documentService.onConfigChange.bind(this.documentService));
    }

    private onConfigChange(config: ConfigurationService) {
        const sendError = config.getConfig('sendError');
        if (this.sendError != sendError) {
            this.sendError = sendError;
        }

        this.v2CompatibleMode = config.getConfig('v2CompatibleMode');
        this._configurationDone.notify();
    }

    public listen() {
        this.documents.listen(this.conn);
    }

    private onInitialize(params: InitializeParams) {
        let capabilities = params.capabilities;
    
        // Does the client support the `workspace/configuration` request?
        // If not, we fall back using global settings.
        const hasConfigurationCapability = !!(
            capabilities.workspace && !!capabilities.workspace.configuration
        );
        const hasWorkspaceFolderCapability = !!(
            capabilities.workspace && !!capabilities.workspace.workspaceFolders
        );
        const hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        );
    
        const clientCapability: IClientCapabilities = {
            hasConfiguration: hasConfigurationCapability,
            hasWorkspaceFolder: hasWorkspaceFolderCapability
        }
    
        this.logger.info('initializing.');
        // Update configuration of each service
        this.configurationService.updateCapabilities(clientCapability);
    
        const result: InitializeResult = {
            serverInfo: {
                // The name of the server as defined by the server.
                name: ServerName,
        
                // The servers's version as defined by the server.
                // version: this.version,
            },
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                // Tell the client that this server supports code completion.
                // `/` and `<` is only used for include compeltion
                completionProvider: {
                    resolveProvider: true,
                    triggerCharacters: ['.', '/', '<']
                },
                signatureHelpProvider: {
                    triggerCharacters: ['(', ',']
                },
                hoverProvider: true,
                documentSymbolProvider: true,
                definitionProvider: true,
                // semanticTokensProvider: {
                //     legend: {
                //         tokenTypes: [SemanticTokenTypes.variable],
                //         tokenModifiers: [SemanticTokenModifiers.static]
                //     },
                //     full: true
                // },
                // inlayHintProvider: true,
            }
        };
        if (hasWorkspaceFolderCapability) {
            result.capabilities.workspace = {
                workspaceFolders: {
                    supported: true
                }
            };
        }
        return result;
    }

    private onInitialized() {
        if (this.configurationService.clientCapability.hasConfiguration) {
            // Register for all configuration changes.
            this.conn.client.register(DidChangeConfigurationNotification.type, {
                section: ServerName
            });
        }
        if (this.configurationService.clientCapability.hasWorkspaceFolder) {
            this.conn.workspace.onDidChangeWorkspaceFolders(_event => {
                this.logger.info('Workspace folder change event received.');
            });
        }
    }

    private onDocumentSymbol(params: DocumentSymbolParams): SymbolInformation[] {
        const info = this.documentService.getDocumentInfo(params.textDocument.uri);
        if (!info) return [];
        return info.syntax.table.symbolInformations();
    }

    private async onSignatureHelp(positionParams: SignatureHelpParams, cancellation: CancellationToken): Promise<Maybe<SignatureHelp>> {
        const { position } = positionParams;
        const { uri } = positionParams.textDocument;
    
        if (cancellation.isCancellationRequested) {
            return undefined;
        }
    
        const docinfo = this.documentService.getDocumentInfo(uri);
        if (!docinfo) return undefined;
        const token = binarySearchRange(docinfo.syntax.AST.script.tokens, position);
        if (!token) return undefined;
        const found = this.finder.find(docinfo.syntax.AST.script.stmts, position, [Call, Stmt.CommandCall])

        // If finder did not find anything, failback to old way.
        if (found === undefined) {
            this.logger.log('SignatureHelp: Fail back to old way.');
            this.currentDocUri = uri;
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
        const scope = this.getCurrentScope(position, docinfo.syntax.table);

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

    private async onDefinition(params: DefinitionParams, cancellation: CancellationToken): Promise<Maybe<Definition>> {
        if (cancellation.isCancellationRequested) {
            return undefined;
        }
    
        let { textDocument, position } = params;
        
        const docinfo = this.documentService.getDocumentInfo(textDocument.uri);
        if (!docinfo) return undefined;
        
        const symbol = this.getSymbolAtPosition(docinfo.syntax.AST, position, Expr.Factor, Call);
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

    private async onHover(params: HoverParams, cancellation: CancellationToken): Promise<Maybe<Hover>> {
        if (cancellation.isCancellationRequested) {
            return undefined;
        }

        let { textDocument, position } = params;

        // For debug usage
        // const hoveringToken = DOCManager.selectDocument(params.textDocument.uri)
        // 					.getTokenAtPos(params.position);
        // if (!hoveringToken)
        // 	return {
        // 		contents: {
        // 			kind: 'markdown',
        // 			value: '**Test Hover**'
        // 		}
        // 	};
        // return {
        // 	contents: {
        // 		kind: 'markdown',
        // 		value: `\`${TokenType[hoveringToken.type]}\` **${hoveringToken.content}** [${hoveringToken.start.line}.${hoveringToken.start.character}-${hoveringToken.end.line}.${hoveringToken.end.character}]`
        // 	},
        // 	range: hoveringToken
        // };
        let docinfo = this.documentService.getDocumentInfo(textDocument.uri);
        if (!docinfo) return undefined;
        const token = binarySearchRange(docinfo.syntax.AST.script.tokens, position);
        if (token === undefined) return undefined;

        const AST = docinfo.syntax.AST.script.stmts;
        const find = this.finder.find(AST, position, [Expr.Factor, Stmt.CommandCall, Parameter, FuncDef, ClassDef]);
        if (find === undefined) return undefined;
        
        const node = find.nodeResult
        const scope = this.getCurrentScope(position, docinfo.syntax.table);
        if (node instanceof Expr.Factor) {
            return convertFactorHover(node, position, scope, token, this.v2CompatibleMode);
        }
        // 只有为new表达式时才为 unary
        else if (node instanceof Expr.Unary) {
            // 不对复杂的表达式作处理，只考虑直接接 factor 的情况
            if (!(node.factor instanceof Expr.Factor)) return;
            return convertNewClassHover(node.factor, position, docinfo.syntax.table, token);
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

    private async onCompletion(_compeltionParams: CompletionParams, cancellation: CancellationToken): Promise<Maybe<CompletionItem[]>> {
        if (cancellation.isCancellationRequested) {
            return undefined;
        }
        const {position, textDocument} = _compeltionParams;

        const docinfo = this.documentService.getDocumentInfo(textDocument.uri);
        if (!docinfo) return undefined;

        // findout if we are in an include compeltion
        if (_compeltionParams.context && 
            (_compeltionParams.context.triggerCharacter === '/' || _compeltionParams.context.triggerCharacter === '<')) {
            return this.includeDirCompletion(docinfo.LineTextToPosition(position));
        }
        
        const scope = this.getCurrentScope(position, docinfo.syntax.table);
        const found = this.finder.find(docinfo.syntax.AST.script.stmts, position, [Expr.Factor]);
        
        // if nothing found, just do scoped symbol completion
        if (found === undefined || found.nodeResult === undefined)
            return this.getSymbolCompletion(docinfo.syntax.table, scope);

        // Should not happen
        // FIXME: raise Exception here, to log the wrong function trace
        if (!(found.nodeResult instanceof Expr.Factor)) return undefined;

        const node = found.nodeResult
        // if we are in atom do scoped symbol completion
        if (posInRange(node.suffixTerm.atom, position)) {
            return this.getSymbolCompletion(docinfo.syntax.table, scope);
        }

        // now we need completions about suffix
        return this.getSuffixCompletion(node, scope, position);

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
     * Resolve some additional information
     */
    private async onCompletionResolve(item: CompletionItem): Promise<CompletionItem> {
        switch (item.kind) {
            case CompletionItemKind.Function:
            case CompletionItemKind.Method:
            case CompletionItemKind.Class:
                // provide addition infomation of class and function
                item.detail = item.data;
                break;
            case CompletionItemKind.Variable:
                // if this is a `built-in` variable
                // provide the document of it
                if (item.detail === 'Built-in Variable') {
                    // TODO: configuration for each document.
                    const docLang = this.configurationService.getConfig('documentLanguage');
                    if (docLang === docLangName.CN)
                        // item.data contains the infomation index(in builtin_variable)
                        // of variable
                        item.documentation = {
                            kind: 'markdown',
                            value: builtin_variable[item.data][1]
                        };
                }
            default:
                break;
        }
        return item;
    }

    private async onSemanticTokens(param: SemanticTokensParams, cancellation: CancellationToken): Promise<SemanticTokens>{
        const { textDocument } = param;
        this.logger.info('onSemanticTokens');
        const doc = this.documentService.getDocumentInfo(textDocument.uri);
        if (!doc) return {data: []};
        const builder = new SemanticTokensBuilder();
        const first = doc.syntax.AST.script.tokens[1];
        builder.push(
            first.start.line, 
            first.start.character, 
            first.content.length,
            0, 0
        );
        return builder.build();
    }
    
    /**
     * Initialize information of a just open document
     * @param uri Uri of initialized document
     * @param doc TextDocument of initialized documnet
     */
    private initDocument(uri: string, doc: TextDocument) {
        this.currentDocUri = uri;
        // this.updateDocumentAST(uri, doc);
    }

    public getGlobalCompletion(table: SymbolTable): CompletionItem[] {
        let incCompletion: CompletionItem[] = [];

        const symbols = table.allSymbols();

        for (let [uri, symbols] of table.includeSymbols()) {
            const base = URI.parse(table.uri).fsPath;
            incCompletion.push(...symbols.map(node => {
                let c = convertSymbolCompletion(node);
                c.data += '  \nInclude from ' + relative(
                    base, URI.parse(uri).fsPath
                );
                return c;
            }))
        }

        const builtin = this.v2CompatibleMode ? this.builtinScope.v2 : this.builtinScope.v1;
        
        return symbols.map(sym => convertSymbolCompletion(sym))
        .concat(Array(...builtin.values()).map(node => {
            let ci = CompletionItem.create(node.name);
            if (node instanceof AHKMethodSymbol)
                ci.data = node.toString();
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

    public getSymbolCompletion(table: SymbolTable, scope: IScope): Maybe<CompletionItem[]> {
        if (scope.name === 'global') return this.getGlobalCompletion(table)
                                    .concat(this.keywordCompletions)
            // Now scope is a method.
            const symbols = scope.allSymbols();
            return symbols.map(sym => convertSymbolCompletion(sym))
                    .concat(this.getGlobalCompletion(table))
                    .concat(this.keywordCompletions)
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
                const { items } = (<ArrayTerm>bracket);
                // no type casting on complex indexing
                if (items.length !== 1) return undefined;
                const first = items.childern[0]
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


    public includeDirCompletion(context: string): Maybe<CompletionItem[]> {
        const reg = /^\s*#include/i;
        let match = context.match(reg);
        if (!match) return undefined;
        // get dir text
        const p = context.slice(match[0].length).trim();
        const docDir = dirname(URI.parse(this.currentDocUri).fsPath);
        let searchDir: string[] = []
        // if is lib include, use lib dir
        if (p[0] === '<') {
            const np = normalize(p.slice(1));
            const dir = normalize(join(docDir, 'Lib', np));
            const ULibDir = join(this.documentService.ULibDir, np);
            const SLibDir = join(this.documentService.SLibDir, np);
            searchDir.push(dir, ULibDir, SLibDir);
        } 
        // absolute dirctory
        if (isAbsolute(p)) {
            searchDir.push(p);
        }
        // relative dirctory
        else {
            const dir = normalize(join(docDir, normalize(p)));
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
        const doc = this.documentService.getDocumentInfo(this.currentDocUri);
        if (!doc) return undefined;
        const context = doc.getLine(position.line);
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
        const docinfo = this.documentService.getDocumentInfo(this.currentDocUri);
        if (!docinfo) return undefined;
        const scope = this.getCurrentScope(position, docinfo.syntax.table);
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
                const bfind = this.builtinCommand.filter(item => item.name.toLowerCase() === funcName.toLowerCase());
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
                const bfind = this.builtinFunction.filter(item => item.name.toLowerCase() === funcName.toLowerCase());
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
        const bfind = this.builtinCommand.filter(item => item.name.toLowerCase() === name.toLowerCase());
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
        const doc = this.documentService.getDocumentInfo(this.currentDocUri);
        if (!doc) return undefined;
        let context = doc.LineTextToPosition(position);

        // check if we need to attach to previous lines
        const attachToPreviousTest = new RegExp('^[ \t]*,');
        if (attachToPreviousTest.test(context)) {
            let linenum = position.line-1;
            let lines = doc.getLine(linenum);
            context = lines + context;
            while (lines !== '') {
                if (attachToPreviousTest.test(lines)) {
                    linenum -= 1;
                    lines = doc.getLine(linenum);
                    context = lines + context;
                } 
                else
                    lines = '';
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

    private getSymbolAtPosition(docsAST: IAST, position: Position, ...matchNodeType: NodeConstructor[]): Maybe<ISymbol> {
        let docinfo = this.documentService.getDocumentInfo(this.currentDocUri);
        if (!docinfo) return undefined;

        const AST = docsAST.script.stmts;
        const find = this.finder.find(AST, position, matchNodeType);
        if (find && find.nodeResult instanceof Expr.Factor) {
            const scope = this.getCurrentScope(position, docinfo.syntax.table);
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
        const doc = this.documentService.getDocumentInfo(this.currentDocUri);
        if (!doc) return Word.create('', Range.create(position, position));
		const context = doc.getLine(position.line);

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
