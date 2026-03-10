import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const toLine = (entry) => `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
export const appendLog = async (path, entry) => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, toLine(entry), 'utf8');
};
