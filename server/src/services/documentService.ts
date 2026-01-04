import { TextDocument } from 'vscode-languageserver-textdocument';
import { IoService } from './ioService';
import { WorkspaceIndex } from './workspaceIndex';
import { mockLogger } from '../utilities/logger';
import { DocumentSyntaxInfo } from './types';
import { Connection, Diagnostic, Position, Range, TextDocuments } from 'vscode-languageserver/node';
import { SymbolTable } from '../parser/newtry/analyzer/models/symbolTable';
import { URI } from 'vscode-uri';
import { dirname, extname, isAbsolute, join, normalize } from 'path';
import { AHKParser } from '../parser/newtry/parser/parser';
import { PreProcesser, Processer } from '../parser/newtry/analyzer/semantic';
import { Notifier } from './utils/notifier';
import { AHKSymbol } from '../parser/newtry/analyzer/models/symbol';
import { getBuiltinScope } from '../constants';
import { IAST, IParseError } from '../parser/newtry/types';
import { homedir } from 'os';
import { ConfigurationService } from './configurationService';
import { Token } from '../parser/newtry/tokenizor/types';
import { debounce } from '../utilities/decorator';

export interface IBuiltinScope {
    v1: Map<string, AHKSymbol>
    v2: Map<string, AHKSymbol>
}

class DocumentInfomation {
    /**
     * @param document TextDocument of document
     * @param syntax AST related information of document
     */
    constructor(
        public readonly document: TextDocument,
        public readonly syntax: DocumentSyntaxInfo
    ) {}
    
    /**
     * Return a line of text up to the given position
     * @param position position of end mark
     */
	public LineTextToPosition(position: Position): string {
        return this.document.getText(Range.create(
                Position.create(position.line, 0),
                position
            )).trimRight();
    }

    /**
     * Return the text of a given line
     * @param line line number
     */
    public getLine(line: number): string {
        return this.document.getText(Range.create(
                Position.create(line, 0),
                Position.create(line+1, 0)
            )).trimRight();
    }
}

export class DocumentService {
    /**
     * Builtin functions and variable symbols
     */
    public readonly builtinScope: IBuiltinScope;

    /**
     * server cached documnets
     */
    private serverDocs: Map<string, TextDocument> = new Map();

    /**
     * server cached AST for documents, respectively 
     * Map<uri, IDocmentInfomation>
     */
    private docsAST: Map<string, DocumentSyntaxInfo> = new Map();

    /**
     * local storaged AST of ahk documents, cached included documents
     */
    private localAST: Map<string, DocumentSyntaxInfo> = new Map();

    /**
     * Server cached include informations for each documents
     * Map<DocmemtsUri, Map<IncludeAbsolutePath, RawIncludePath>>
     */
    public incInfos: Map<string, Map<string, string>> = new Map();

    private ioService: IoService = new IoService();

    /**
     * Standard Library directory
     */
    public readonly SLibDir: string;

    /**
     * User library directory
     */
    public readonly ULibDir: string;

    private isSendError: boolean = false;

    private _configurationDone = new Notifier();

    /**
     * Workspace root directory
     */
    private workspaceRoot: string | undefined;

    /**
     * Workspace-wide symbol index
     */
    public readonly workspaceIndex: WorkspaceIndex = new WorkspaceIndex();

    constructor(
        private conn: Connection, 
        documents: TextDocuments<TextDocument>,
        private logger: ILoggerBase = mockLogger,
        private v2CompatibleMode: boolean
    ) {
        this.builtinScope = {
            v1: getBuiltinScope(false, logger),
            v2: getBuiltinScope(true, logger)
        };
        // TODO: non hardcoded Standard Library
        this.SLibDir = 'C:\\Program Files\\AutoHotkey\\Lib';
        this.ULibDir = homedir() + '\\Documents\\AutoHotkey\\Lib';

        documents.onDidChangeContent(e => this.updateDocumentAST(e.document.uri, e.document));
        documents.onDidSave(e => this.updateLocalAST(e.document.uri));
        documents.onDidClose(e => this.deleteUnusedDocument(e.document.uri));
    }

    public getDocumentInfo(uri: string): Maybe<DocumentInfomation> {
        const info = this.docsAST.get(uri);
        const doc = this.serverDocs.get(uri);
        if (!info || !doc) return undefined;
        return new DocumentInfomation(doc, info);
    }

    /**
     * Get all open document information for workspace symbol search
     */
    public getAllDocumentInfo(): Map<string, DocumentInfomation> {
        const result = new Map<string, DocumentInfomation>();
        for (const [uri, info] of this.docsAST) {
            const doc = this.serverDocs.get(uri);
            if (doc) {
                result.set(uri, new DocumentInfomation(doc, info));
            }
        }
        return result;
    }

    public onConfigChange(config: ConfigurationService) {
        const sendError = config.getConfig('sendError');
        if (this.isSendError != sendError) {
            this.isSendError = sendError;
            this.updateErrors();
        }

        const v2CompatibleMode = config.getConfig('v2CompatibleMode');
        if (v2CompatibleMode !== this.v2CompatibleMode) {
            this.v2CompatibleMode = v2CompatibleMode;
            if (this.docsAST.size > 0) {
                this.docsAST = new Map();
                this.localAST = new Map();
                for (const [uri, doc] of this.serverDocs.entries())
                    this.updateDocumentAST(uri, doc);
            } 
        }
        this._configurationDone.notify();
    }

    /**
     * Update infomation of a given document, will automatic load its includes
     * @param uri Uri of updated document
     * @param docinfo AST of updated document
     * @param doc TextDocument of update documnet
     */
    @debounce(100)
    private async updateDocumentAST(uri: string, doc: TextDocument) {
        // wait for configuation 1000ms, before start any parsing.
        await this._configurationDone.wait(1000);
        // update documnet
        this.serverDocs.set(uri, doc);
        // this.logger.info(`v2 mode ${this.v2CompatibleMode}.`)

        const parser = new AHKParser(doc.getText(), doc.uri, this.v2CompatibleMode, this.logger);
        const ast = parser.parse();
        const start = Date.now();
        const preprocesser = new PreProcesser(
            ast.script, 
            this.v2CompatibleMode ? this.builtinScope.v2 : this.builtinScope.v1
        );
        const processResult = preprocesser.process();
        const processer = new Processer(ast.script, this.v2CompatibleMode, processResult.table);
        const sencondResult = processer.process();
        const docTable = sencondResult.table;

        // Connect workspace index to enable cross-file symbol resolution
        docTable.setWorkspaceSymbolProvider(this.workspaceIndex);

        const end = Date.now();
        this.logger.log(`Analzay finished[${end - start} ms]`);

        if (this.isSendError) {
            this.sendErrors(ast.sytanxErrors, uri);
            this.conn.sendDiagnostics({
                uri: uri,
                diagnostics: processResult.diagnostics
            });
        }

        for (const diagnostic of processResult.diagnostics) {
            ast.sytanxErrors.push({
                // FIXME: Temporary using, since token property is not using for now.
                token: diagnostic.range as Token,
                message: diagnostic.message,
                start: diagnostic.range.start,
                end: diagnostic.range.end
            });
        }

        // updata AST first, then its includes
        const oldInclude = this.filterLoadedInclude(this.docsAST.get(uri)?.AST);
        // Store AST first, before await document load
        // In case of other async function run ahead
        this.docsAST.set(uri, {
            AST: ast,
            table: docTable,
            callInfomation: processResult.callInfomation
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
            table: docTable,
            callInfomation: processResult.callInfomation
        });
    }

    /**
     * Update cached include file AST when this file is saved
     * @param uri update file uri
     */
    private updateLocalAST(uri: string) {
        const ast = this.docsAST.get(uri);
        if (!ast) return;
        if (this.localAST.has(uri)) {
            this.localAST.set(uri, ast);
            for (const [docUri, doc] of this.docsAST)
                doc.table.updateInclude(ast.table)
        }
    }

    /**
     * Filter out already loaded included files 
     */
    private filterLoadedInclude(AST: Maybe<IAST>): Maybe<Set<string>> {
        if (!AST) return undefined;
        const oldInc: Set<string> = new Set();
        const docDir = dirname(URI.parse(AST.script.uri).fsPath);
        AST.script.include?.forEach(i => {
            const p = this.include2Path(i, docDir);
            if (p && this.localAST.has(URI.file(p).toString()))
                oldInc.add(i);
        })
        return oldInc;
    }

    private compareInclude(oldInc: Maybe<Set<string>>, newInc: Maybe<Set<string>>): [string[], string[]] {
        if (oldInc && newInc) {
            // useless need delete, useneed need to add
            // FIXME: delete useless include
            const [useless, useneed] = setDiffSet(oldInc, newInc);
            this.logger.log(`Got ${newInc.size} include file. ${useneed.length} file to load.` );
            return [useless, useneed];
        }
        else {
            const useneed = newInc ? [... newInc] : [];
            this.logger.log(`Got ${useneed.length} include file to load.` );
            return [[], useneed];
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

    /**
     * Load include scripts' AST to `this.localAST`
     * @param inc2update path of include files
     * @param uri Uri of script
     */
    private async EnumIncludes(inc2update: string[], uri: string) {
        let incQueue: string[] = [...inc2update];
        // this code works why?
        // no return async always fails?
        let path = incQueue.shift();
        while (path) {
            const docDir = dirname(URI.parse(uri).fsPath);
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
                const parser = new AHKParser(doc.getText(), doc.uri, this.v2CompatibleMode, this.logger);
                const ast = parser.parse();
                const preprocesser = new PreProcesser(
                    ast.script, 
                    this.v2CompatibleMode ? this.builtinScope.v2 : this.builtinScope.v1
                );
                const processResult = preprocesser.process();
                // cache to local storage file AST
                this.localAST.set(doc.uri, {
                    AST: ast,
                    table: processResult.table,
                    callInfomation: processResult.callInfomation
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

    private deleteUnusedDocument(uri: string) {
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

    private updateErrors() {
        for (const [uri, info] of this.docsAST.entries()) {
            if (this.isSendError) 
                this.sendErrors(info.AST.sytanxErrors, uri);
            else
                this.sendErrors([], uri);
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

    public include2Path(rawPath: string, scriptPath: string): Maybe<string> {
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

    // ==================== Workspace Indexing ====================

    /**
     * Set the workspace root and prepare for scanning
     * @param root Workspace root directory path
     */
    public setWorkspaceRoot(root: string): void {
        this.workspaceRoot = root;
        this.workspaceIndex.clear();
    }

    /**
     * Scan all .ahk files in the workspace and index their symbols
     * @param progressCallback Optional callback for progress updates
     */
    public async scanWorkspace(progressCallback?: (processed: number, total: number) => void): Promise<void> {
        if (!this.workspaceRoot) {
            this.logger.warn('No workspace root set, cannot scan');
            return;
        }

        this.workspaceIndex.isIndexing = true;

        try {
            const files = this.ioService.findFilesRecursive(this.workspaceRoot, '.ahk');
            const totalFiles = files.length;
            let processed = 0;

            // Process files in batches to avoid blocking
            const BATCH_SIZE = 10;
            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                const batch = files.slice(i, i + BATCH_SIZE);

                for (const filePath of batch) {
                    await this.indexFile(filePath);
                    processed++;
                    if (progressCallback) {
                        progressCallback(processed, totalFiles);
                    }
                }

                // Yield to event loop between batches
                if (i + BATCH_SIZE < files.length) {
                    await new Promise(resolve => setImmediate(resolve));
                }
            }

            this.logger.info(`Indexed ${processed} files in workspace`);
        } finally {
            this.workspaceIndex.isIndexing = false;
        }
    }

    /**
     * Index a single file into the workspace index
     * @param filePath Absolute path to the file
     */
    public async indexFile(filePath: string): Promise<void> {
        const uri = URI.file(filePath).toString();

        // Skip if already open in editor (handled by docsAST)
        if (this.docsAST.has(uri)) return;

        try {
            const content = await this.ioService.load(filePath);
            const parser = new AHKParser(content, uri, this.v2CompatibleMode, this.logger);
            const ast = parser.parse();
            const preprocesser = new PreProcesser(
                ast.script,
                this.v2CompatibleMode ? this.builtinScope.v2 : this.builtinScope.v1
            );
            const processResult = preprocesser.process();

            // Extract top-level symbols for the index
            const symbols = processResult.table.allSymbols() as AHKSymbol[];
            this.workspaceIndex.addFile(uri, symbols);
        } catch (err) {
            this.logger.error(`Failed to index ${filePath}: ${err}`);
        }
    }

    /**
     * Re-index a file (remove old entry and index again)
     * @param filePath Absolute path to the file
     */
    public async reindexFile(filePath: string): Promise<void> {
        const uri = URI.file(filePath).toString();

        // Skip if open in editor
        if (this.docsAST.has(uri)) return;

        this.workspaceIndex.removeFile(uri);
        await this.indexFile(filePath);
    }

    /**
     * Remove a file from the workspace index
     * @param uri File URI to remove
     */
    public removeFileFromIndex(uri: string): void {
        this.workspaceIndex.removeFile(uri);
    }
}

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