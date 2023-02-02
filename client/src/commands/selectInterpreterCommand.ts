import { EventEmitter } from 'events';
import { 
    commands, 
    ExtensionContext, 
    OpenDialogOptions, 
    QuickPickItem, 
    QuickPickItemKind, 
    Uri, 
    window
} from 'vscode';
import { InterpreterInformation } from '../display/types';
import { ICommand } from './types';

type InterpreterChangeHandler = (interpreterInfomation: InterpreterInformation) => void;

export interface SelectInterpreterCommand {
    on(event: 'InterpreterChange', listener: InterpreterChangeHandler): this;
    emit(event: 'InterpreterChange', ...args: Parameters<InterpreterChangeHandler>): boolean;
}

export class SelectInterpreterCommand extends EventEmitter implements ICommand {
    constructor(private availableInterpreterProvider: () => InterpreterInformation[]) {
        super();
    }

    public subscript(name: string, context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(
                name,
                this.execute.bind(this)
            )
        );
    }

    public async execute(...args: any[]) {
        const interpreters = this.availableInterpreterProvider();
        const customPickItems: QuickPickItem[]= [
            {
                label: '',
                kind: QuickPickItemKind.Separator
            },
            {
                label: 'Select custom interpreter path',
                alwaysShow: true
            }
        ]
        const quickPickItems: QuickPickItem[] = interpreters.map((inter, i) => {
            let item: QuickPickItem = {
                label: `Version ${inter.version ?? 'Unknown'}`,
                detail: inter.path
            }
            if (i === 0) {
                item.description = 'Current';
                item.picked = true;
            }
            return item
        }).concat(...customPickItems);
        const pickedItem = await window.showQuickPick(quickPickItems);
        if (!pickedItem) return;

        if (pickedItem.label === 'Select custom interpreter path') 
            this.OpenFileSelectDialog(interpreters[0].path);

        const selectedInterpreter = interpreters.find(inter => inter.path === pickedItem.detail);
        if (selectedInterpreter)
            this.emit('InterpreterChange', selectedInterpreter);
    }
    
    private async OpenFileSelectDialog(defaultPath: string): Promise<void> {
        const defaultUri = Uri.file(defaultPath);
        const opt: OpenDialogOptions = {
            defaultUri: defaultUri,
            canSelectFolders: false,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Select',
            filters: {'AHK interpreter': ['exe']},
            title: 'Select AutoHotkey interpreter'
        }
        const selectFile = await window.showOpenDialog(opt);
        if (!selectFile) return;
        this.emit('InterpreterChange', {
            path: selectFile[0].fsPath,
            version: undefined
        });
    }

}