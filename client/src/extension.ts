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
	languages
} from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';
import { CommandManger } from './commandManger';

import { FormatProvider } from "./formattingProvider";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// Register run file command
	const commandManger = new CommandManger();
	commandManger.subscript(context);

	// window.onDidOpenTerminal(e => console.log(e.name));

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
		documentSelector: [{ scheme: 'file', language: 'ahk' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// TODO: Implement in language server
	const ds: DocumentSelector = { language: "ahk" };
	const fpHandler = languages.registerDocumentFormattingEditProvider(ds, new FormatProvider());
	context.subscriptions.push(fpHandler);

	// Create the language client and start the client.
	client = new LanguageClient(
		'AutohotkeySimpleSupport',
		'Autohotkey Simple Support',
		serverOptions,
		clientOptions
	);
	
	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
