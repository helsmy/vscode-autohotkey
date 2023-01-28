import { 
    debug, 
    ExtensionContext, 
    extensions,
    commands,
    window,
    DebugConfigurationProvider,
    CancellationToken,
    DebugConfiguration,
    ProviderResult,
    WorkspaceFolder
} from "vscode";
import { InterpreterPathProvider } from '../display/types';

const SupportDebugAdapterId = 'helsmy.autohotkey-debug';
interface SupportedDebugConfiguration extends DebugConfiguration {
    AhkExecutable?: string
}

/**
 * Service class to overlap runtime executable path with vaild path
 */
export class DebugConfigSubstituter implements DebugConfigurationProvider {
    constructor(
        private interpreterPathProvider: InterpreterPathProvider
    ) {
        
    }

    public resolveDebugConfigurationWithSubstitutedVariables(folder: WorkspaceFolder, config: SupportedDebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        const isSupportDebugAdapter = extensions.getExtension(SupportDebugAdapterId);
        if (!isSupportDebugAdapter) {
            window.showInformationMessage(
                `Supported debug extension "${SupportDebugAdapterId}" did not Found.
                Autohotkey runtime overlap will not take effect.`
            )
            return config;
        }

        if (config.AhkExecutable) return config;
        
        // If runtime is not spectified
        const runtime = this.interpreterPathProvider();
        if (!runtime) {
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
            // Let debugger know runtime is invaild
            // by passing '-1' as runtime path
            config.AhkExecutable = '-1';
            return config;
        }
        
        config.AhkExecutable = runtime;
        return config;
    }
}