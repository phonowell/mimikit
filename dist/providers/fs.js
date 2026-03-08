import { readFile } from 'node:fs/promises';
export const readTextFileIfExists = async (path) => {
    try {
        return await readFile(path, 'utf8');
    }
    catch (error) {
        if (error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT')
            return '';
        throw error;
    }
};
export const readJson = async (path, fallback) => {
    const text = await readTextFileIfExists(path);
    if (!text.trim())
        return fallback;
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
};
