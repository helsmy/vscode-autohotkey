import { IClientCapabilities } from '../../../types';

/**
 * Name of AHK document language 
 */
export enum docLangName {
    CN = 'CN',
    NO = 'no'        // No Doc
};

/**
 * Log level of server
 */
type LogLevelClient = 'error' | 'info'| 'veberse' | 'off'

// The AHK Language Server settings
export interface AHKLSSettings {
    maxNumberOfProblems: number;
    documentLanguage: docLangName;            // which language doc to be used
    sendError: boolean;
    traceServer: {
        level: LogLevelClient
    };
    v2CompatibleMode: Boolean;
}

export class ServerConfiguration implements AHKLSSettings {
	constructor(
		public readonly maxNumberOfProblems: number,
        public readonly documentLanguage: docLangName,
        public readonly sendError: boolean,
        public readonly traceServer: {level: LogLevelClient},
        public readonly clientCapability: IClientCapabilities,
        public readonly v2CompatibleMode: boolean
	) {

    }

    /**
     * Merge a partial server configuration into this configuration
     * @param config partial server configuration
     */
    public merge(config: Partial<ServerConfiguration>): ServerConfiguration {
        return new ServerConfiguration(
            config.maxNumberOfProblems ?? this.maxNumberOfProblems,
            config.documentLanguage ?? this.documentLanguage,
            config.sendError ?? this.sendError,
            config.traceServer ?? this.traceServer,
            config.clientCapability ?? this.clientCapability,
            config.v2CompatibleMode ?? this.v2CompatibleMode
        );
    }

    /**
     * Is this server config equal to another?
     * @param other other configuration
     */
    public equal(other: ServerConfiguration): boolean {
        return JSON.stringify(this) === JSON.stringify(other);
    }
}