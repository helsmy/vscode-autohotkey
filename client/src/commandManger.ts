import { ExtensionContext, commands } from 'vscode';
import { RunFileCommand } from "./runFileCommnad";

interface ICommandList {
    ["AutohotkeySS.runCurrentFile"]: RunFileCommand 
}

export class CommandManger {
    private commandList: ICommandList

    constructor() {
        this.commandList = {
            "AutohotkeySS.runCurrentFile": new RunFileCommand()
        }
    }

    public subscript(context: ExtensionContext) {
        context.subscriptions.push(commands.registerCommand(
            "AutohotkeySS.runCurrentFile",
            this.commandList['AutohotkeySS.runCurrentFile'].executeFile
                .bind(this.commandList['AutohotkeySS.runCurrentFile'])
        ));
    }
}