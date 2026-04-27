export function isStringJson(str: any): str is string {
  try {
    if (typeof str === 'string') {
      JSON.parse(str);
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

export function firstElement(str: string) {
  return str?.split(',')?.[0] ?? '';
}
