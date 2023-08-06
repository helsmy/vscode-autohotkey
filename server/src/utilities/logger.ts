import { ConfigurationService } from '../services/configurationService';
export enum LogLevel {
    veberse,
    info,
    warn,
    error,
    off,
}


/**
 * Simple Logger, reference: kos-language-server
 */
export class Logger implements ILoggerBase {
	constructor(
		private readonly connection: ILoggerBase,
		private logLevel: LogLevel
	) { }

	error(message: string) {
		if (this.logLevel <= LogLevel.warn)
			this.connection.warn(message);
	}

	warn(message: string) {
		if (this.logLevel <= LogLevel.warn)
			this.connection.warn(message);
	}

	log(message: string) {
		if (this.logLevel <= LogLevel.veberse)
			this.connection.log(message);
	}

	info(message: string) {
		if (this.logLevel <= LogLevel.info)
			this.connection.info(message);

	}

	updateLevel(level: LogLevel) {
        if (this.logLevel != level)
            this.logLevel = level;
    }
}

/**
 * A mock logger for testings or performance
 * reference: kos-language-server
 */
 export const mockLogger: ILoggerBase = {
	error: (_: string) => {},
	warn: (_: string) => {},
	info: (_: string) => {},
	log: (_: string) => {}
};
  