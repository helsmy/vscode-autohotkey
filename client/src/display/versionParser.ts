import { AUTOHOTKEY_VERSION } from './types';

export const parseVersion = (version: string): AUTOHOTKEY_VERSION => {
    const s = version.split('.');
    const reg = /^(?<major>\d+)\.(?<minor>\d+)(\.(?<patch>\d+))?(\.(?<build>\d+))?$/
    const result = [
        '-1' ?? s[0],
        '-1' ?? s[1],
        '-1' ?? s[2],
        '-1' ?? s[3]
    ];
    return {
        major: parseInt(result[0]),
        minor: parseInt(result[1]),
        patch: parseInt(result[2]),
        build: parseInt(result[3]),
    };
}