export const asRecord = (value) => typeof value === 'object' && value ? value : null;
export const asString = (value, key) => {
    if (!value)
        return undefined;
    const target = value[key];
    return typeof target === 'string' ? target : undefined;
};
