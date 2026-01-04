/**
 * Based on Microsoft language server examples under MIT LICENSE
 * Modified and rewirted by helsmy (github.com/helsmy)
 */

import {
	createConnection,
	FileChangeType,
	InlayHint,
	InlayHintParams,
	ProposedFeatures,
	// InlayHintParams,
	// InlayHint,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';

import {
	defaultSettings
} from './constants'
import { AHKLS } from './ahkls';
import { ConfigurationService } from './services/configurationService';
import { LogLevel, Logger } from './utilities/logger';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

const configurationService = new ConfigurationService(
	defaultSettings,
	connection
);
const logger = new Logger(
	connection.console, 
	LogLevel[defaultSettings.traceServer.level]
);
const ahkls: AHKLS = new AHKLS(connection, logger, configurationService);

// connection.languages.inlayHint.on(
// 	async (param: InlayHintParams, token): Promise<Maybe<InlayHint[]>> => {
// 		logger.log(JSON.stringify(param));
// 		return undefined;
// 	}
// );

connection.onDidChangeWatchedFiles(change => {
	// Handle file changes for workspace indexing
	for (const event of change.changes) {
		const uri = event.uri;
		const fsPath = URI.parse(uri).fsPath;

		// Only handle .ahk files
		if (!fsPath.toLowerCase().endsWith('.ahk')) continue;

		switch (event.type) {
			case FileChangeType.Created:
				logger.info(`File created: ${fsPath}`);
				ahkls.documentService.indexFile(fsPath);
				break;

			case FileChangeType.Changed:
				// Only re-index if not open in editor (open files are handled by docsAST)
				logger.info(`File changed: ${fsPath}`);
				ahkls.documentService.reindexFile(fsPath);
				break;

			case FileChangeType.Deleted:
				logger.info(`File deleted: ${fsPath}`);
				ahkls.documentService.removeFileFromIndex(uri);
				break;
		}
	}
});

function onConfigChange(config: ConfigurationService) {
	logger.info('update configuration');
	const trace = config.getConfig('traceServer');
	const level = LogLevel[trace.level];
	logger.updateLevel(level);
}

configurationService.on('change', onConfigChange);

ahkls.listen();
// Listen on the connection
connection.listen();
connection.console.log('Starting AHK Server')
