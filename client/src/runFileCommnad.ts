import { commands, ExtensionContext, Terminal, TerminalOptions, window } from 'vscode';
import { TerminalManager } from './terminalManger';
import { ICommnad } from './types';

export class RunFileCommand implements ICommnad {
	/**
	 * API to vscode terminal
	 */
	private terminalManager: TerminalManager;

	/**
	 * Terminal owned by command
	 */
	private ownTerminal: Terminal|undefined;

	/**
	 * Option of terminal to be created
	 */
	private readonly termianlOption: TerminalOptions;

	constructor() {
		this.terminalManager = new TerminalManager();
		this.termianlOption = {
			name: 'Autohotkey',
			shellPath: 'powershell'
		};
	}

	private onDidCloseTerminal(eterminal: Terminal) {
		this.ownTerminal = undefined;
	}

	public subscript(commandName: string, context: ExtensionContext) {
		context.subscriptions.push(
			commands.registerCommand(
				commandName,
				this.execute.bind(this)
			)
		);
	}

	public execute() {
		const runtime = '"C:\\Program Files\\AutoHotkey\\AutoHotkeyU64.exe"';
		const activeEditor = window.activeTextEditor

		if (!this.ownTerminal) {
			this.ownTerminal = this.terminalManager.createTerminal(this.termianlOption);
			this.terminalManager.onDidCloseTerminal(this.onDidCloseTerminal.bind(this));
		}
		this.ownTerminal.show();
		
		if (activeEditor !== undefined) {
			const filePath = activeEditor.document.uri.fsPath

			// Send command and redirect stdout to console
			// NUL 就让tee写到空文件，就只剩下输出功能
			this.ownTerminal.sendText(
				['&', runtime, filePath.replace('/', '\\'), '| tee -FilePath NUL'].join(' ')
			);
		}
	}
}