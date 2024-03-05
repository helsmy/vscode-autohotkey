/**
 * Based on Microsoft language server examples under MIT LICENSE
 * Modified and rewirted by helsmy (github.com/helsmy)
 */

import {
	createConnection,
	InlayHint,
	InlayHintParams,
	ProposedFeatures,
	// InlayHintParams,
	// InlayHint,
} from 'vscode-languageserver/node';

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

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	logger.log('We received an file change event');
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
