import { ConfigurationChangeEvent, languages, LanguageStatusItem, LanguageStatusSeverity, TextEditor, window, workspace } from 'vscode';
import { AUTOHOTKEY_LANGUAGE } from '../constants';
import { InterpreterService } from './interpreterSerive';

export class InterpreterDisplay {
	private languageStatus: LanguageStatusItem | undefined;
	private interpreterSerive: InterpreterService

	constructor() {
		this.interpreterSerive = new InterpreterService();
		// window.onDidChangeActiveTextEditor(this.updateDisplay.bind(this));
		// window.onDidChangeTextEditorSelection(this.updateDisplay.bind(this));
	}

	public async onDidChangeConfiguration(event: ConfigurationChangeEvent) { 
		if (event.affectsConfiguration('ahk-simple-language-server.interpreterPath'))
			this.updateDisplay();
	}
	
	public activate() {
		this.languageStatus = languages.createLanguageStatusItem(
			'autohotkeyss.displayInterpreter',
			{language: AUTOHOTKEY_LANGUAGE}
		);
		this.languageStatus.severity = LanguageStatusSeverity.Information;
		this.languageStatus.command = {
			title: 'Change Interpreter config',
			command: 'workbench.action.openSettings',
			arguments: ['Ahk-simple-language-server:interpreterPath']
		};
	}

	public async updateDisplay() {
		if (this.languageStatus) {
			const interpreter = await this.interpreterSerive.getInerpreterStatus();
			if (interpreter) {
				this.languageStatus.text = interpreter.version;
				this.languageStatus.detail = 'Autohotkey';
				this.languageStatus.command.tooltip = interpreter.path;
			}
			else {
				this.languageStatus.text = '$(alert) No Interpreter Selected';
				this.languageStatus.detail = '';
				this.languageStatus.command.tooltip = 'Set A Vaild Interpreter';
			}
		}
	}
}