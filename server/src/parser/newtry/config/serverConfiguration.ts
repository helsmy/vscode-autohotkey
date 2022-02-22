import { IClientCapabilities } from '../../../types';

/**
 * Name of AHK document language 
 */
export enum docLangName {
    CN = 'CN',
    NO = 'no'        // No Doc
};

/**
 * Representing for sending something or not
 */
type SendBool = 'on' | 'off';

/**
 * Log level of server
 */
type LogLevel = 'error' | 'info'| 'veberse' | 'off'

// The AHK Language Server settings
export interface AHKLSSettings {
    maxNumberOfProblems: number;
    documentLanguage: docLangName;            // which language doc to be used
    sendError: SendBool;
    logLevel: LogLevel;
}

export class ServerConfiguration implements AHKLSSettings {
	constructor(
		public readonly maxNumberOfProblems: number,
        public readonly documentLanguage: docLangName,
        public readonly sendError: SendBool,
        public readonly logLevel: LogLevel,
        public readonly clientCapability: IClientCapabilities
	) {

    }

    /**
     * Merge a partial server configuration into this configuration
     * @param config partial server configuration
     */
    public merge(config: Partial<ServerConfiguration>): ServerConfiguration {
        return new ServerConfiguration(
            config.maxNumberOfProblems || this.maxNumberOfProblems,
            config.documentLanguage || this.documentLanguage,
            config.sendError || this.sendError,
            config.logLevel || this.logLevel,
            config.clientCapability || this.clientCapability
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