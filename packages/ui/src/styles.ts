// Shared field styling so inputs, selects and textareas stay visually in sync.
// Mirrors the web app's form look: white surface, black border with a thicker
// bottom edge ("raised" feel) and a warm primary focus ring.
export const FIELD_BASE =
  'w-full rounded-md border border-black border-b-2 bg-white px-3 py-2 text-sm text-black outline-none transition placeholder:text-default-400 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50';

export const FIELD_ERROR = 'border-danger focus:border-danger';

export const FIELD_LABEL = 'flex flex-col gap-1 text-sm text-black';
