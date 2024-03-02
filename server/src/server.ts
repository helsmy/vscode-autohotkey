/**
 * Based on Microsoft language server examples under MIT LICENSE
 * Modified and rewirted by helsmy (github.com/helsmy)
 */

import {
	createConnection,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentSyncKind,
	InitializeResult,
	SymbolInformation,
	DocumentSymbolParams,
	SignatureHelpParams,
	SignatureHelp,
	CancellationToken,
	DefinitionParams,
	Definition,
	CompletionParams,
	HoverParams,
	Hover,
	// InlayHintParams,
	// InlayHint,
} from 'vscode-languageserver/node';

import {
	defaultSettings,
	// serverName,
	ServerName
} from './constants'

import { builtin_variable } from "./utilities/builtins";
import { TreeManager } from './services/treeManager';
import { Logger, LogLevel } from './utilities/logger';
import { 
	docLangName,
} from './services/config/serverConfiguration';
import { ConfigurationService } from './services/configurationService';
import { IClientCapabilities } from './types';


// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

const configurationService = new ConfigurationService(
	defaultSettings,
	connection
);
const logger = new Logger(
	connection.console, 
	LogLevel[defaultSettings.traceServer.level]
);
const DOCManager: TreeManager = new TreeManager(connection, logger, configurationService);

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const clientCapability: IClientCapabilities = {
		hasConfiguration: hasConfigurationCapability,
		hasWorkspaceFolder: hasWorkspaceFolderCapability
	}

	logger.info('initializing.');
	// Update configuration of each service
	configurationService.updateCapabilities({
		hasConfiguration: hasConfigurationCapability,
		hasWorkspaceFolder: hasWorkspaceFolderCapability
	});

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
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, {
			section: ServerName
		});
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

connection.onDocumentSymbol(
	(params: DocumentSymbolParams): SymbolInformation[] => {

	DOCManager.selectDocument(params.textDocument.uri);
	return DOCManager.docSymbolInfo();
});

connection.onSignatureHelp(
	async (positionParams: SignatureHelpParams, cancellation: CancellationToken): Promise<Maybe<SignatureHelp>> => {
	const { position } = positionParams;
	const { uri } = positionParams.textDocument;

	if (cancellation.isCancellationRequested) {
		return undefined;
	}

	return DOCManager.selectDocument(uri).getSignatureHelp(position);
});

connection.onDefinition(
	async (params: DefinitionParams, token: CancellationToken): Promise<Maybe<Definition>> =>{
	if (token.isCancellationRequested) {
		return undefined;
	}

	let { position } = params;

	// search definiton at request position
	let locations = DOCManager.selectDocument(params.textDocument.uri).getDefinitionAtPosition(position);
	return locations;
});

connection.onHover(
	async (params: HoverParams, token, CancellationToken): Promise<Maybe<Hover>> => {
		if (token.isCancellationRequested) {
			return undefined;
		}

		let { position } = params;

		const hover = DOCManager.selectDocument(params.textDocument.uri).getHoverAtPosition(position);
		return hover;

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
});

// connection.languages.inlayHint.on(
// 	async (param: InlayHintParams, token): Promise<Maybe<InlayHint[]>> => {
// 		logger.log(JSON.stringify(param));
// 		return undefined;
// 	}
// );

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	logger.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	async (_compeltionParams: CompletionParams, token: CancellationToken): Promise<Maybe<CompletionItem[]>> => {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const {position, textDocument} = _compeltionParams;
		DOCManager.selectDocument(textDocument.uri);
		// findout if we are in an include compeltion
		if (_compeltionParams.context && 
			(_compeltionParams.context.triggerCharacter === '/' || _compeltionParams.context.triggerCharacter === '<')) {
			let result = DOCManager.includeDirCompletion(position);
			// if request is fired by `/` and `<`,but not start with "include", we exit
			if (result) 
				return result;
			else
				return undefined;
		}

		return DOCManager.getScopedCompletion(_compeltionParams.position);
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	async (item: CompletionItem): Promise<CompletionItem> => {
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
					const docLang = configurationService.getConfig('documentLanguage');
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
);

function onConfigChange(config: ConfigurationService) {
	logger.info('update configuration');
	const trace = config.getConfig('traceServer');
	const level = LogLevel[trace.level];
	logger.updateLevel(level);
}

configurationService.on('change', onConfigChange);

DOCManager.listen();
// Listen on the connection
connection.listen();
connection.console.log('Starting AHK Server')
