// Ссылки в заметках (п. 6, 17_ТЗ; Спецификация, раздел 18): http(s)-адреса показываются ссылкой,
// текст заметки в базе не меняется. Без HTML: распознанный адрес становится <a>, всё остальное — обычный текст.

const URL_RE = /https?:\/\/[^\s<>"«»]+/g;
const TRAIL = /[.,;:!?)\]»'"]+$/;

export const hasLink = (text: string) => /https?:\/\/\S/.test(text);

/** Текст с распознанными ссылками: открываются в новой вкладке браузера (в PWA и Safari из Dock — во внешнем браузере). */
export function LinkText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const tail = url.match(TRAIL)?.[0] ?? '';
    if (tail) url = url.slice(0, -tail.length);
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <a key={start} href={url} target="_blank" rel="noopener noreferrer" className="note-link"
        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>{url}</a>,
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
