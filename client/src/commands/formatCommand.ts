import { commands, DocumentSelector, ExtensionContext, languages, TextEditor, TextEditorEdit, window } from 'vscode';
import { CancellationToken, FormattingOptions } from 'vscode-languageclient';
import { FormatProvider } from './formattingProvider';
import { ICommand } from './types';

export class FormatCommand implements ICommand {
    private provider: FormatProvider

    constructor() {
        this.provider = new FormatProvider();
    }

    subscript(name: string, context: ExtensionContext): void {
        // TODO: Implement in language server
        const ds: DocumentSelector = { language: "ahk" };
        const fpHandler = languages.registerDocumentFormattingEditProvider(ds, this.provider);
        context.subscriptions.push(fpHandler);

        context.subscriptions.push(commands.registerTextEditorCommand(
            name, this.execute.bind(this)
        ));
    }

    // FIXME: edit只能在callback内同步执行，异步会让edit没做callback内执行
    execute(textEditor: TextEditor, edit: TextEditorEdit): void {
        const result = this.provider.syncProvideFormattingEdits(
            textEditor.document, 
            FormattingOptions.create(4, true)
        );

        // 反正这个格式化也就是全都替换的实现
        // 全换就完了
        for (const e of result) {
            edit.replace(e.range, e.newText);
        }
    }
}