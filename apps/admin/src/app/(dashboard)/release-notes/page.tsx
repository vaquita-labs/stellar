'use client';

import { addDangerToast, addSuccessToast } from '@/core-ui/components';
import {
  NOTE_LANGUAGES,
  type NoteLanguage,
  type ReleaseNote,
  type ReleaseNoteImagePayload,
  type ReleaseNoteTranslations,
  createReleaseNote,
  deleteReleaseNote,
  releaseNoteImageUrl,
  updateReleaseNote,
  useReleaseNotes,
} from '@/core-ui/hooks';
import { ATTACHMENT_ACCEPT, prepareImage } from '@/helpers';
import { Spinner } from '@heroui/react';
import { Button, Card, Input, Textarea } from '@vaquita/ui';
import { useRef, useState } from 'react';

const TITLE_MAX = 160;
const BODY_MAX = 4000;
const IMAGES_MAX = 8;

/**
 * One picture in the editor. `id` is set for an image that already lives in the
 * database and `base64` for one just picked from disk — an edit that touches
 * neither still has to re-send the whole carousel, so both kinds need a preview
 * URL and both have to survive a save.
 */
type EditorImage = { key: string; src: string; id?: string; base64?: string };

/**
 * The editor tabs. `'en'` writes the `title`/`body` columns; the others write
 * `translations`.
 *
 * English is not one language among three — it is the fallback, so it is the
 * only one that has to be filled. Leaving `es` blank publishes the note with
 * Spanish readers seeing the English text, which is the right outcome while a
 * translation is pending and the reason there is no "all languages required"
 * check anywhere in this flow.
 */
const TABS = ['en', ...NOTE_LANGUAGES] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  en: 'English (required)',
  es: 'Español',
  pt: 'Português',
};

type FormState = {
  title: string;
  body: string;
  translations: Record<NoteLanguage, { title: string; body: string }>;
  published: boolean;
  images: EditorImage[];
};

const emptyTranslations = (): FormState['translations'] =>
  Object.fromEntries(NOTE_LANGUAGES.map((l) => [l, { title: '', body: '' }])) as FormState['translations'];

const emptyForm = (): FormState => ({
  title: '',
  body: '',
  translations: emptyTranslations(),
  published: false,
  images: [],
});

const formFromNote = (note: ReleaseNote): FormState => ({
  title: note.title,
  body: note.body,
  translations: Object.fromEntries(
    NOTE_LANGUAGES.map((l) => [l, { title: note.translations[l]?.title ?? '', body: note.translations[l]?.body ?? '' }]),
  ) as FormState['translations'],
  published: note.publishedAt !== null,
  images: note.imageIds.map((id) => ({ key: id, id, src: releaseNoteImageUrl(id) })),
});

/**
 * Only complete pairs are sent. A title with no body is a half-finished draft,
 * not a translation, and shipping it would show a Spanish headline over an
 * English paragraph — worse than falling back cleanly to English.
 */
const buildTranslations = (form: FormState): ReleaseNoteTranslations => {
  const out: ReleaseNoteTranslations = {};
  for (const language of NOTE_LANGUAGES) {
    const title = form.translations[language].title.trim();
    const body = form.translations[language].body.trim();
    if (title && body) out[language] = { title, body };
  }
  return out;
};

/** Which languages a saved note actually carries, for the list badges. */
const filledLanguages = (note: ReleaseNote): NoteLanguage[] =>
  NOTE_LANGUAGES.filter((language) => note.translations[language] !== undefined);

const formatDate = (iso: string) => new Date(iso).toLocaleString();

export default function Page() {
  const { data: notes, refetch, isLoading } = useReleaseNotes();

  // null = no form open; 'new' = create; number = editing that note id.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [tab, setTab] = useState<Tab>('en');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Writes the field for whichever tab is open — base columns for `en`. */
  const setText = (field: 'title' | 'body', value: string) =>
    setForm((f) =>
      tab === 'en'
        ? { ...f, [field]: value }
        : { ...f, translations: { ...f.translations, [tab]: { ...f.translations[tab], [field]: value } } },
    );

  const text = tab === 'en' ? { title: form.title, body: form.body } : form.translations[tab];

  const openCreate = () => {
    setForm(emptyForm());
    setTab('en');
    setEditing('new');
  };

  const openEdit = (note: ReleaseNote) => {
    setForm(formFromNote(note));
    setTab('en');
    setEditing(note.id);
  };

  const closeForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setTab('en');
  };

  const pickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = IMAGES_MAX - form.images.length;
    if (room <= 0) {
      addDangerToast('Too many images', `A note can carry at most ${IMAGES_MAX} pictures.`);
      return;
    }

    const added: EditorImage[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      // Resized in the browser: a phone screenshot is several MB, and these
      // bytes end up inline in every user's /latest response.
      const prepared = await prepareImage(file);
      if (!prepared) {
        addDangerToast('Image skipped', `“${file.name}” could not be read or is too large even resized.`);
        continue;
      }
      added.push({
        key: `${file.name}-${Date.now()}-${added.length}`,
        src: prepared.dataUrl,
        base64: prepared.base64,
      });
    }

    if (added.length) setForm((f) => ({ ...f, images: [...f.images, ...added] }));
    // Reset the input so re-picking the same file fires change again.
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = (key: string) => setForm((f) => ({ ...f, images: f.images.filter((i) => i.key !== key) }));

  /**
   * The carousel to send.
   *
   * `null` means "an image already in the database is still in the set, and
   * nothing was added or removed" — so the images field is omitted and the
   * server leaves the carousel untouched. Sending it would mean re-uploading
   * bytes the browser only has as a URL.
   */
  const buildImages = (original: ReleaseNote | undefined): ReleaseNoteImagePayload[] | null => {
    const unchanged =
      original !== undefined &&
      form.images.length === original.imageIds.length &&
      form.images.every((image, index) => image.id === original.imageIds[index]);
    if (unchanged) return null;

    if (form.images.some((image) => !image.base64)) {
      // A mixed set cannot be expressed: replacing the carousel replaces all of
      // it, and the browser cannot re-encode a picture it only has a URL for.
      return null;
    }
    return form.images.map((image) => ({ contentType: 'image/jpeg' as const, data: image.base64! }));
  };

  const submit = async () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body) {
      // Only English is checked. It is the fallback, so a note without it has
      // no text at all for a reader whose language is not translated.
      addDangerToast('Missing fields', 'A release note needs an English title and body — they are the fallback.');
      setTab('en');
      return;
    }
    const translations = buildTranslations(form);

    setSaving(true);
    try {
      if (editing === 'new') {
        await createReleaseNote({
          title,
          body,
          translations,
          published: form.published,
          images: form.images.map((image) => ({ contentType: 'image/jpeg' as const, data: image.base64! })),
        });
        addSuccessToast('Saved', form.published ? 'Release note published.' : 'Draft saved.');
      } else if (typeof editing === 'number') {
        const original = notes?.find((n) => n.id === editing);
        const images = buildImages(original);
        await updateReleaseNote({
          id: editing,
          title,
          body,
          translations,
          published: form.published,
          ...(images === null ? {} : { images }),
        });
        addSuccessToast('Saved', 'Release note updated.');
      }
      await refetch();
      closeForm();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (note: ReleaseNote) => {
    const publishing = note.publishedAt === null;
    if (
      publishing &&
      !window.confirm(`Publish “${note.title}”? It pops for every user the next time they open the app.`)
    ) {
      return;
    }
    setSaving(true);
    try {
      // `translations` is resent as-is: omitting it leaves the column alone,
      // but sending the note back verbatim keeps this call a pure publish flip
      // even if the field ever stops being optional.
      await updateReleaseNote({
        id: note.id,
        title: note.title,
        body: note.body,
        translations: note.translations,
        published: publishing,
      });
      addSuccessToast('Saved', publishing ? 'Release note published.' : 'Release note unpublished.');
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (note: ReleaseNote) => {
    if (!window.confirm(`Delete release note “${note.title}”? Users who already closed it stay caught up.`)) return;
    setDeletingId(note.id);
    try {
      await deleteReleaseNote(note.id);
      addSuccessToast('Deleted', `“${note.title}” removed.`);
      if (editing === note.id) closeForm();
      await refetch();
    } catch (err) {
      addDangerToast('Error', (err as Error)?.message ?? 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Release notes</h1>
        <Button variant="primary" onPress={openCreate} isDisabled={editing === 'new'}>
          Add release note
        </Button>
      </div>

      <p className="text-sm text-default-500">
        Users only ever see the <strong>newest published</strong> note, once — closing the popup is the
        acknowledgement. Drafts are invisible to the app, so write freely and publish when it is ready.
      </p>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {editing !== null && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="text-base font-semibold text-black">
                {editing === 'new' ? 'New release note' : `Edit release note #${editing}`}
              </h2>

              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Language">
                {TABS.map((language) => {
                  const filled =
                    language === 'en'
                      ? form.title.trim() !== '' && form.body.trim() !== ''
                      : form.translations[language].title.trim() !== '' &&
                        form.translations[language].body.trim() !== '';
                  return (
                    <button
                      key={language}
                      type="button"
                      role="tab"
                      aria-selected={tab === language}
                      onClick={() => setTab(language)}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        tab === language ? 'bg-black text-white' : 'bg-default-100 text-default-600'
                      }`}
                    >
                      {TAB_LABEL[language]}
                      {/* A dot, not a warning: an empty tab is a normal state,
                          it just falls back to English. */}
                      {filled ? ' ●' : ' ○'}
                    </button>
                  );
                })}
              </div>

              <Input
                label="Title"
                maxLength={TITLE_MAX}
                placeholder="e.g. Bridge from Base, and a faster map"
                value={text.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText('title', e.target.value)}
              />

              <Textarea
                label="Body"
                rows={6}
                maxLength={BODY_MAX}
                placeholder={'Plain text. Line breaks are kept.\n\nWhat changed, and why it matters.'}
                value={text.body}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText('body', e.target.value)}
              />

              <p className="text-xs text-default-400">
                {tab === 'en'
                  ? 'Shown to English readers, and to anyone whose language has no translation below.'
                  : 'Optional. Leave both fields empty and these readers see the English note instead. Half a translation is not saved.'}
              </p>

              {/* The images are shared by every language: they are screenshots
                  of an app that is already localised, not captions. */}

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Images ({form.images.length}/{IMAGES_MAX})
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => fileRef.current?.click()}
                    isDisabled={saving || form.images.length >= IMAGES_MAX}
                  >
                    Add images
                  </Button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => void pickImages(e.target.files)}
                />
                {form.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.images.map((image) => (
                      <div key={image.key} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL or a route handler, not the optimizer */}
                        <img
                          src={image.src}
                          alt=""
                          className="h-20 w-20 rounded-lg border border-black/10 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(image.key)}
                          aria-label="Remove image"
                          className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black text-xs leading-5 text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {typeof editing === 'number' && form.images.some((i) => i.id) && (
                  <p className="text-xs text-default-400">
                    Removing or adding a picture replaces the whole carousel — the ones already saved are
                    re-uploaded from what you pick here, so re-add any you want to keep.
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.published} onChange={(e) => set('published', e.target.checked)} />
                Published — visible to every user.
              </label>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onPress={closeForm} isDisabled={saving}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={submit} isDisabled={saving} isLoading={saving}>
                  {editing === 'new' ? 'Create' : 'Save'}
                </Button>
              </div>
            </Card>
          )}

          {(notes?.length ?? 0) === 0 ? (
            <div className="rounded-medium bg-warning-50 p-3 text-sm text-warning-700">
              No release notes yet. Use “Add release note” to write the first one.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {notes?.map((note) => (
                <li
                  key={note.id}
                  className="flex flex-col gap-2 rounded-xl border border-black border-b-2 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{note.title}</span>
                        {note.publishedAt === null ? (
                          <span className="rounded bg-default-100 px-1.5 text-xs text-default-500">draft</span>
                        ) : (
                          <span className="rounded bg-success-100 px-1.5 text-xs text-success-700">
                            published {formatDate(note.publishedAt)}
                          </span>
                        )}
                        {note.imageIds.length > 0 && (
                          <span className="rounded bg-default-100 px-1.5 text-xs text-default-500">
                            {note.imageIds.length} image{note.imageIds.length === 1 ? '' : 's'}
                          </span>
                        )}
                        <span className="rounded bg-default-100 px-1.5 text-xs uppercase text-default-500">
                          en{filledLanguages(note).map((l) => ` · ${l}`)}
                        </span>
                      </div>
                      <span className="line-clamp-2 text-xs text-default-400">{note.body}</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onPress={() => togglePublished(note)} isDisabled={saving}>
                        {note.publishedAt === null ? 'Publish' : 'Unpublish'}
                      </Button>
                      <Button size="sm" variant="ghost" onPress={() => openEdit(note)} isDisabled={saving}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onPress={() => remove(note)}
                        isDisabled={deletingId === note.id}
                        isLoading={deletingId === note.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
