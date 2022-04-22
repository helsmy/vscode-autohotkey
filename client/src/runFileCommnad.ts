import { Terminal, TerminalOptions, window, Uri } from 'vscode';
import { TerminalManager } from './terminalManger';

export class RunFileCommand {
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

	public executeFile() {
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