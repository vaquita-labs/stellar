import { MAX_STRING_LENGTH } from 'config/constants';

function getFunctionSignature(fn: any) {
  const fnString = fn.toString().trim();
  
  // Expresión regular que captura:
  // 1) function <nombre>(...) {
  // 2) ( ...) => {
  // hasta la primera llave
  const pattern = /^(function\s+[a-zA-Z_$][0-9a-zA-Z_$]*\([^)]*\)\s*\{|\(.*?\)\s*=>\s*\{)/;
  const match = fnString.match(pattern);
  
  return match ? (match[0] + ' ... }') : ' {??} ';
}

export const stringifyObject = function (obj: any, depth: number, indent = 0) {
  
  if (depth < 0) {
    return '';
  }
  
  if (typeof obj === 'function') {
    return obj.toString();
  } else if (typeof obj === 'object' && obj !== null) {
    const indentStr = ' '.repeat(indent);
    const entries: string = Object.getOwnPropertyNames(obj).map((key) => {
      const value = obj[key];
      if (typeof value === 'function') {
        return `${indentStr}    ${key}: ${getFunctionSignature(value)},`;
      } else if (typeof value === 'object' && value !== null) {
        return `${indentStr}    ${key}: ${stringifyObject(value, depth - 1, indent + 4)},`;
      }
      return `${indentStr}    ${key}: ${JSON.stringify(value)},`;
    }).join('\n');
    return `{\n${entries}\n${indentStr}}`;
  }
  
  return JSON.stringify(obj);
};

export const cropString = (cad: string) => {
  if (cad.length > MAX_STRING_LENGTH) {
    return cad.substring(0, MAX_STRING_LENGTH)
      + `\n\n\n...Only the first ${MAX_STRING_LENGTH} characters are displayed`;
  }
  return cad;
};
