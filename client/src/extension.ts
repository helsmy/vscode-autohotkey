/* --------------------------------------------------------------------------------------------
 * Autohotkey Simple language server vscode client
 * based on Microsoft language server examples under MIT LICENSE
 * Modified and rewirted by helsmy (github.com/helsmy)
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { 
	workspace, 
	ExtensionContext,
	DocumentSelector,
	languages,
	window
} from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';
import { CommandManger } from './commands/commandManger';
import { AHKSS_CLIENT_NAME, AHKSS_EXTENSION_ID, AUTOHOTKEY_LANGUAGE } from './constants';
import { InterpreterDisplay } from "./display/interpreterDisplay";
import { InterpreterService } from './display/interpreterSerive';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// Register command
	const commandManger = new CommandManger();
	commandManger.subscript(context);

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: AUTOHOTKEY_LANGUAGE }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		AHKSS_EXTENSION_ID,
		AHKSS_CLIENT_NAME,
		serverOptions,
		clientOptions
	);
	
	// Start the client. This will also launch the server
	client.start();
	delayActive(context);
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

async function delayActive(context: ExtensionContext) {
	const interpreterDisplay = new InterpreterDisplay();
	interpreterDisplay.activate();
	context.subscriptions.push(
		workspace.onDidChangeConfiguration(
			interpreterDisplay.onDidChangeConfiguration.bind(interpreterDisplay)
		)
	);

	setTimeout(async () => {
		interpreterDisplay.updateDisplay();
	}, 0);
} 