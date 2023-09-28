import { EventEmitter } from 'events';
import { 
    DidChangeConfigurationParams, 
    Connection 
} from 'vscode-languageserver/node';
import { AHKLSSettings, ServerConfiguration } from '../parser/newtry/config/serverConfiguration';
import { ServerName } from '../utilities/constants';

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

    constructor(
        defaultServerConfiguration: ServerConfiguration,
        conn: Connection
    ) {
        super();
        this.serverConfiguration = defaultServerConfiguration;
        this.defaultServerConfiguration = defaultServerConfiguration;
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
        const clientCapability = this.serverConfiguration.clientCapability;
        if (clientCapability.hasConfiguration) {
            const serverConfiguration = this.serverConfiguration
                .merge(change.settings[ServerName]);
            if (!this.serverConfiguration.equal(serverConfiguration)) {
                this.serverConfiguration = serverConfiguration;
                this.emit('change', this);
            }
        }
    }

    /**
     * Update server config with diff
     * @param config config used for update
     */
    public updateConfiguration(config: Partial<ServerConfiguration>) {
        this.serverConfiguration = this.serverConfiguration.merge(config);
    }

    public getConfig<K extends keyof AHKLSSettings>(key: K): AHKLSSettings[K] {
        return this.serverConfiguration[key];
    }
}