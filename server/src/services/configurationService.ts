import { EventEmitter } from 'events';
import { 
    DidChangeConfigurationParams, 
    Connection 
} from 'vscode-languageserver/node';
import { AHKLSSettings, ServerConfiguration } from './config/serverConfiguration';
import { ServerName } from '../constants';
import { IClientCapabilities } from '../types';

type ConfigurationConnection = Pick<Connection, 'onDidChangeConfiguration'>;

export interface ChangeConfiguration {
    serverConfiguration: ServerConfiguration;
}

type ChangeHandler = (configurations: ConfigurationService) => void;

export declare interface ConfigurationService {
    on(event: 'change', listener: ChangeHandler): this;
    emit(event: 'change', ...args: Parameters<ChangeHandler>): boolean;
}

/**
 * Service for collection and organizing user configurations
 */
export class ConfigurationService extends EventEmitter {
    
    /**
     * configurations of server
     */
    private serverConfiguration: ServerConfiguration;

    /**
     * default server configuration
     */
    public defaultServerConfiguration: ServerConfiguration;

    /**
     * Configuration related client capabilities
     */
    private clientCapability: IClientCapabilities

    constructor(
        defaultServerConfiguration: ServerConfiguration,
        conn: Connection
    ) {
        super();
        this.serverConfiguration = defaultServerConfiguration;
        this.defaultServerConfiguration = defaultServerConfiguration;
        this.clientCapability = {
            hasConfiguration: false,
            hasWorkspaceFolder: false
        }
        this.listen(conn);
    }

    private listen(conn: ConfigurationConnection) {
        conn.onDidChangeConfiguration(this.onConfigurationChange.bind(this));
    }

    /**
     * Server configuration change handler. Updates the configuration when appropriate
     * @param change changes that occurred to the server configuration
     */
    private onConfigurationChange(change: DidChangeConfigurationParams): void {
        const clientCapability = this.clientCapability;
        if (clientCapability.hasConfiguration) {
            this.updateConfiguration(change.settings[ServerName]);
        }
    }

    public updateCapabilities(capabilities: IClientCapabilities) {
        this.clientCapability.hasConfiguration = capabilities.hasConfiguration;
        this.clientCapability.hasWorkspaceFolder = capabilities.hasWorkspaceFolder;

        // If client has no configuration capabilities,
        // told other service to use default configuration.
        if (!capabilities.hasConfiguration)
            this.emit('change', this);
    }

    /**
     * Update server config with diff
     * @param config config used for update
     */
    public updateConfiguration(config: Partial<ServerConfiguration>) {
        const serverConfiguration = this.serverConfiguration.merge(config);

        if (!this.serverConfiguration.equal(serverConfiguration)) {
            this.serverConfiguration = serverConfiguration;
            this.emit('change', this);
        }
    }

    public getConfig<K extends keyof AHKLSSettings>(key: K): AHKLSSettings[K] {
        return this.serverConfiguration[key];
    }
}