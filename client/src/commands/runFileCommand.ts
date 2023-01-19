import { commands, ExtensionContext, Terminal, TerminalOptions, window, workspace } from 'vscode';
import { InterpreterStatus } from '../display/types';
import { TerminalManager } from './terminalManger';
import { ICommand } from './types';

export class RunFileCommand implements ICommand {
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

    private interpreterStatus: InterpreterStatus;

    constructor() {
        this.terminalManager = new TerminalManager();
        this.termianlOption = {
            name: 'Autohotkey',
            shellPath: 'powershell'
        };
        this.interpreterStatus = InterpreterStatus.unknown;
    }

    private onDidCloseTerminal(eterminal: Terminal) {
        this.ownTerminal = undefined;
        eterminal.dispose();
    }

    public onDidChangeInterpreterStatus(status: InterpreterStatus) {
        this.interpreterStatus = status;
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
        const runtime = workspace
                        .getConfiguration('ahk-simple-language-server')
                        .get('interpreterPath') as string;
        const activeEditor = window.activeTextEditor;
        if (this.interpreterStatus === InterpreterStatus.unknown) {
            window.showErrorMessage(
                'Interpreter Is Unavailable. Please check Settings>Ahk-simple-language-server:interpreterPath',
                'Go to settings'
            ).then(s => {
                // if `Go to settings` button is pressed
                if (s)
                    commands.executeCommand(
                        'workbench.action.openSettings', 
                        'Ahk-simple-language-server:interpreterPath'
                    );
            });
            return;
        }

        if (!this.ownTerminal) {
            this.ownTerminal = this.terminalManager.createTerminal(this.termianlOption);
            this.terminalManager.onDidCloseTerminal(this.onDidCloseTerminal.bind(this));
        }
        this.ownTerminal.show();
        
        if (activeEditor !== undefined) {
            const filePath = activeEditor.document.uri.fsPath

            // Send command and redirect stdout to console
            this.ownTerminal.sendText(
                ['&', this.pathGuard(runtime), this.pathGuard(filePath), '| echo'].join(' ')
            );
        }
    }

    /**
     * Convert path to be safety for command line
     * @param p path string
     */
    private pathGuard(p: string): string {
        if (/[\s\t]+/.test(p)) {
            p = '"' + p + '"';
        }
        if (p.search('/')) {
            p = p.replace('/', '\\');
        }
        return p;
    }
}