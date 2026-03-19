import { EventEmitter } from 'events';
import {
    commands,
    ExtensionContext,
    OpenDialogOptions,
    QuickPickItem,
    QuickPickItemKind,
    Uri,
    window,
    ThemeIcon,
} from 'vscode';
import { InterpreterInformation } from '../display/types';
import { ICommand } from './types';

type InterpreterChangeHandler = (interpreterInfomation: InterpreterInformation) => void;

export interface SelectInterpreterCommand {
    on(event: 'InterpreterChange', listener: InterpreterChangeHandler): this;
    emit(event: 'InterpreterChange', ...args: Parameters<InterpreterChangeHandler>): boolean;
}

export class SelectInterpreterCommand extends EventEmitter implements ICommand {
    constructor(private availableInterpreterProvider: (reacquireInterperterPath?: string) => Thenable<InterpreterInformation[]>) {
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
        const pickedItem = await this.createInterpreterQuickPick();
        if (!pickedItem) return;
        
        if (pickedItem.label === 'Select custom interpreter path') {
            const interpreters = await this.availableInterpreterProvider();
            this.OpenFileSelectDialog(interpreters[0].path);
        }

        // const selectedInterpreter = interpreters.find(inter => inter.path === pickedItem.detail);
        // if (selectedInterpreter)
        //     this.emit('InterpreterChange', selectedInterpreter);
    }

    private async OpenFileSelectDialog(defaultPath: string): Promise<void> {
        const defaultUri = Uri.file(defaultPath);
        const opt: OpenDialogOptions = {
            defaultUri: defaultUri,
            canSelectFolders: false,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Select',
            filters: { 'AHK interpreter': ['exe'] },
            title: 'Select AutoHotkey interpreter'
        }
        const selectFile = await window.showOpenDialog(opt);
        if (!selectFile) return;
        this.emit('InterpreterChange', {
            path: selectFile[0].fsPath,
            version: undefined
        });
    }

    private async createInterpreterQuickPick(): Promise<QuickPickItem | undefined> {
        const customPickItems: QuickPickItem[] = [
            {
                label: '',
                kind: QuickPickItemKind.Separator
            },
            {
                label: 'Select custom interpreter path',
                alwaysShow: true
            }
        ]

        let qp = window.createQuickPick();
        qp.busy = true;
        const ii = await this.availableInterpreterProvider();
        const quickPickItems: QuickPickItem[] = ii.map((inter, i) => {
            let item: QuickPickItem = {
                label: `Version ${inter.version ?? 'Unknown'}`,
                detail: inter.path,
                buttons: [{
                    iconPath: new ThemeIcon('debug-restart'),
                    tooltip: 'Redetect version'
                }]
            }
            if (i === 0) {
                item.description = 'Current';
                item.picked = true;
            }
            return item
        }).concat(...customPickItems);
        qp.busy = false;
        qp.items = quickPickItems;
        qp.onDidTriggerItemButton(async e => {
            window.showInformationMessage(JSON.stringify(e.item));
            qp.busy = true;
            const il = await this.availableInterpreterProvider(e.item.detail ?? '');
            // 找到被点击的项在qp.items中的索引
            const items = [...qp.items];
            const index = items.findIndex(item => item.detail === e.item.detail);
            if (index !== -1) {
                items[index] = {
                    ...items[index],
                    label: `Version ${il[index].version ?? 'Unknown'}`,
                };
                qp.items = items;
            }
            qp.busy = false;
        });
        qp.show();

        return Promise.race<QuickPickItem | undefined>([
            new Promise((resolve) => {
                qp.onDidAccept(_e => {
                    resolve(qp.activeItems.length >= 1 ? qp.activeItems[0] : undefined);
                    qp.hide();
                });
            }),
            new Promise<undefined>((resolve) => {
                qp.onDidHide(_e => { resolve(undefined); qp.dispose() });
            })
        ]);
    }
}

