import { EventEmitter } from 'events';
import { 
    DidChangeConfigurationParams, 
    Connection 
} from 'vscode-languageserver/node';
import { AHKLSSettings, ServerConfiguration } from './config/serverConfiguration';
import { ServerName } from '../constants';

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
            this.updateConfiguration(change.settings[ServerName]);
        }
    }

    /**
     * Update server config with diff
     * @param config config used for update
     */
    public updateConfiguration(config: Partial<ServerConfiguration>) {
        const serverConfiguration = this.serverConfiguration.merge(config);

        if (!this.serverConfiguration.equal(serverConfiguration)) {
            this.serverConfiguration = serverConfiguration;
            // It is needless to notify clientCapbility, for now
            // 现在LS的组件里没有需要clientCapbility的，
            // treeManger的configuration done只要configuration更新一次就会完成
            // 而实际需要的configuration则会在下次change事件才会得到
            // 所以要暂时跳过clientCapbility改变的事件
            // TODO: 发送变化的configuration给各个组件，方便各个组件判断
            if (config.clientCapability && Object.keys(config).length === 1)
                return;
            this.emit('change', this);
        }
        
    }

    public getConfig<K extends keyof AHKLSSettings>(key: K): AHKLSSettings[K] {
        return this.serverConfiguration[key];
    }
}