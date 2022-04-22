import { 
    window,
    Terminal, 
    TerminalOptions,
    Event
} from "vscode";

export class TerminalManager {
    public get onDidCloseTerminal(): Event<Terminal> {
        return window.onDidCloseTerminal;
    }
    
    public get onDidOpenTerminal(): Event<Terminal> {
        return window.onDidOpenTerminal;
    }

    public createTerminal(option: TerminalOptions): Terminal {
        return window.createTerminal(option);
    }
}