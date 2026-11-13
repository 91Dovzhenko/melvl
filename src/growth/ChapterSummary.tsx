// Сводка главы — один компонент для экрана поздравления и архива «Главы» (Спецификация, раздел 11).
// Mac: две таблицы на общей сетке из 7 колонок, справа колонка 300 (ветки, привычки, моменты).
import { useStore } from '../lib/store';
import { type ChapterMoment, type ChapterProjectRow, type ChapterSummary as Summary, type IdleMark } from '../lib/growth/growth';
import { branchName, daysText, fmtH } from '../lib/growth/format';
import { parseISO, shortDate } from '../lib/dates';
import { useIsPhone } from '../ui/useIsPhone';

const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

/** «12–25 нояб.», «25 окт. – 2 нояб.», с годом — если не текущий. */
export function fmtRange(a: string, b: string) {
  const da = parseISO(a), db = parseISO(b);
  const thisYear = new Date().getFullYear();
  const y = (d: Date) => (d.getFullYear() !== thisYear ? ` ${d.getFullYear()}` : '');
  if (a === b) return `${da.getDate()} ${MONTHS[da.getMonth()]}${y(da)}`;
  if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MONTHS[db.getMonth()]}${y(db)}`;
  if (da.getFullYear() === db.getFullYear()) return `${da.getDate()} ${MONTHS[da.getMonth()]} – ${db.getDate()} ${MONTHS[db.getMonth()]}${y(db)}`;
  return `${da.getDate()} ${MONTHS[da.getMonth()]} ${da.getFullYear()} – ${db.getDate()} ${MONTHS[db.getMonth()]} ${db.getFullYear()}`;
}

/** Подпись главы: «12–25 нояб. · от уровня 5 до уровня 6». */
export const chapterSub = (s: Summary) =>
  `${fmtRange(s.bounds.startDay, s.bounds.lastDay)} · от уровня ${s.from} до уровня ${s.to}${s.bounds.n === 1 ? ' · первая глава' : ''}`;

const STAR = 'M12 2.8l2.75 5.75 6.3.8-4.6 4.35 1.15 6.25L12 16.9l-5.6 3.05 1.15-6.25L2.95 9.35l6.3-.8z';
export function Star({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={STAR} fill="#C5F25A" stroke="#3D6A00" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

const MOMENT_ICON: Record<ChapterMoment['kind'], string> = {
  record: 'M13 3L5 14h6l-1 7 8-11h-6z',
  newSkill: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16v4 M17 18h4',
  quest: 'M6 21V4 M6 4h11l-2.5 4.5L17 13H6',
  overtake: 'M4 17l6-6 4 4 6-6 M15 9h5v5',
};

const idleText = (i: IdleMark) =>
  i.kind === 'none' ? '—' : i.kind === 'days' ? `${i.days} дн.` : i.secondInRow ? 'вся глава · 2-я подряд' : 'вся глава';

export function ChapterSummaryView({ s, framed }: { s: Summary; framed: boolean }) {
  const store = useStore();
  const phone = useIsPhone();
  const skillName = (id: string) => store.skills.find((x) => x.id === id)?.name ?? 'Навык удалён';
  const projectName = (id: string) => store.projects.find((x) => x.id === id)?.name || 'Новый проект';
  const first = !s.prev;
  const avgDiff = s.prev ? Math.round(s.stats.avgPerDay) - Math.round(s.prev.avgPerDay) : 0;

  const stats = first ? [
    { label: `Уровень ${s.to} — за`, value: daysText(s.stats.days), a: 'первая глава — сравнивать не с чем' },
    { label: 'В среднем в день', value: fmtH(s.stats.avgPerDay), a: 'сравнение — со следующей главы' },
    { label: 'Задач сделано', value: String(s.stats.tasksDone), a: '' },
  ] : [
    { label: `Уровень ${s.to} — за`, value: daysText(s.stats.days), a: `уровень ${s.from} — за ${daysText(s.prev!.days)}` },
    { label: 'В среднем в день', value: fmtH(s.stats.avgPerDay), a: '', b: avgDiff === 0 ? '= ' : (avgDiff > 0 ? '↑ ' : '↓ ') + fmtH(Math.abs(avgDiff)), c: avgDiff === 0 ? 'как в прошлой главе' : ' к прошлой главе' },
    { label: 'Задач сделано', value: String(s.stats.tasksDone), a: `в прошлой главе — ${s.prev!.tasksDone}` },
  ];

  const momentText = (m: ChapterMoment): [string, string] => {
    if (m.kind === 'record') return [`Рекордный день — ${fmtH(m.minutes)}`, shortDate(m.day)];
    if (m.kind === 'newSkill') return [`${skillName(m.skillId)} — уровень 2`, 'первый уровень нового навыка'];
    if (m.kind === 'quest') return ['Первый завершённый квест', projectName(m.projectId)];
    return [`${skillName(m.skillId)} обогнал ${skillName(m.overId)}`, `${fmtH(m.minutes)} против ${fmtH(m.overMinutes)} всего`];
  };

  const groups = [
    { title: 'Квесты', g: s.quests },
    { title: 'Проекты', g: s.projects },
  ].filter((x) => x.g.rows.length > 0);

  if (phone) return <PhoneSummary s={s} framed={framed} stats={stats} groups={groups} skillName={skillName} projectName={projectName} momentText={momentText} />;

  return (
    <section className={'sum' + (framed ? ' framed' : '')} aria-label="Сводка главы">
      <div className="sum-top">
        {framed && (
          <div className="sum-head"><h2>Глава {s.bounds.n}</h2><span>{chapterSub(s)}</span></div>
        )}
        <div className="sum-stats">
          {stats.map((x) => (
            <div key={x.label} className="sum-stat">
              <span className="l">{x.label}</span>
              <span className="v">{x.value}</span>
              <span className="c">{x.a}{'b' in x && <b>{x.b}</b>}{'c' in x && x.c}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sum-grid">
        <div className="sum-col">
          <h3>Навыки <span>· было → стало</span></h3>
          <div className="sum-row head"><span /><span>Навык</span><span>Ветка</span><span>Уровень</span><span className="r">За главу</span><span>До след.</span><span>Без роста</span></div>
          {s.skills.map((k) => (
            <div key={k.id} className="sum-row" style={{ opacity: k.shade ? 0.5 : 1 }}>
              <span className="star">{k.star && <Star />}</span>
              <span className="nm">{skillName(k.id)}</span>
              <span className="br">{branchName(k.branch)}</span>
              <span className="lv">{k.locked ? <span className="locked">не открыт</span>
                : k.to > k.from ? <span className="up">{k.from} → {k.to}</span> : `${k.from} → ${k.to}`}</span>
              <span className="r strong">{k.locked ? '' : k.minutes ? '+' + fmtH(k.minutes) : '—'}</span>
              <span className="next">{!k.locked && <><span className="bar"><span style={{ width: `${Math.round(k.progress * 100)}%` }} /></span><span className="pct">{Math.round(k.progress * 100)}%</span></>}</span>
              <span className="idle">{k.locked ? '' : idleText(k.idle)}</span>
            </div>
          ))}
          <span className="sum-legend"><Star size={13} />навык главы · приглушены — «в тени», меньше 5% часов главы</span>
        </div>

        <div className="sum-side">
          <div className="sum-block">
            <h3>Ветки</h3>
            {s.branches.map((b) => (
              <div key={b.key} className="sum-branch">
                <div className="t"><b>{branchName(b.key)}</b><span>{Math.round(b.share * 100)}% · {fmtH(b.minutes)}</span>
                  <span className="lv">ур. {b.from} → {b.to > b.from ? <span className="up">{b.to}</span> : b.to}</span></div>
                <div className="bar8"><div style={{ width: `${Math.round(b.share * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {s.habits.length > 0 && (
            <div className="sum-block tight">
              <h3>Привычки</h3>
              {s.habits.map((h) => (
                <div key={h.templateId} className="sum-habit">
                  <div className="t"><b>{h.title || 'Без названия'}</b><span>{h.done} из {h.due}</span><span className="pct">{Math.round((h.done / h.due) * 100)}%</span></div>
                  <div className="bar6"><div style={{ width: `${Math.round((h.done / h.due) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(groups.length > 0 || s.moments.length > 0) && (
        <div className="sum-grid sep">
          <div className="sum-col">
            {groups.length > 0 && (
              <>
                <div className="sum-row head q"><span /><span className="span3">Квесты и проекты</span><span className="r">За главу</span><span>Всего / оценка</span><span>Срок</span></div>
                {groups.map(({ title, g }) => (
                  <div key={title}>
                    <div className="sum-group"><b>{title}</b><span>· завершено {g.done} · в работе {g.inWork}</span></div>
                    {g.rows.map((r) => <ProjectRow key={r.id} r={r} name={projectName(r.id)} />)}
                  </div>
                ))}
              </>
            )}
          </div>
          {s.moments.length > 0 && (
            <div className="sum-block">
              <h3>Моменты главы</h3>
              <div className="sum-moments">
                {s.moments.map((m, i) => {
                  const [t, sub] = momentText(m);
                  return (
                    <div key={i} className="sum-moment">
                      <span className="ico"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={MOMENT_ICON[m.kind]} stroke="#3D6A00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                      <span className="tx"><b>{t}</b><span>{sub}</span></span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProjectRow({ r, name }: { r: ChapterProjectRow; name: string }) {
  const total = r.quest ? (r.estimate !== null ? `${fmtH(r.totalMin)} из ${fmtH(r.estimate)}` : `${fmtH(r.totalMin)} · без оценки`) : fmtH(r.totalMin);
  return (
    <div className="sum-row">
      <span className={'st' + (r.done ? ' done' : '')} aria-label={r.done ? 'завершён' : 'в работе'}>
        {r.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#C5F25A" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span className="nm span3">{name}</span>
      <span className="r strong">{r.minutes ? '+' + fmtH(r.minutes) : '—'}</span>
      <span className="tot">{total}{r.over !== null && <span className="over">+{fmtH(r.over)}</span>}</span>
      <span className="idle">{r.days === null ? '' : r.done ? daysText(r.days) : `идёт ${daysText(r.days)}`}</span>
    </div>
  );
}

type StatRow = { label: string; value: string; a: string; b?: string; c?: string };

/** iPhone: сводка строками, без таблиц (Спецификация, раздел 15). */
function PhoneSummary({ s, framed, stats, groups, skillName, projectName, momentText }: {
  s: Summary; framed: boolean; stats: StatRow[]; groups: { title: string; g: Summary['quests'] }[];
  skillName: (id: string) => string; projectName: (id: string) => string; momentText: (m: ChapterMoment) => [string, string];
}) {
  return (
    <section className="psum" aria-label="Сводка главы">
      {framed && <div className="psum-head"><b>Глава {s.bounds.n}</b><span>{chapterSub(s)}</span></div>}
      <div className="psum-stats">
        {stats.map((x) => (
          <div key={x.label}>
            <span className="l"><span>{x.label}</span><span className="c">{x.a}{x.b && <b>{x.b}</b>}{x.c}</span></span>
            <span className="v">{x.value}</span>
          </div>
        ))}
      </div>
      <section className="psum-sec">
        <h3>Навыки <span>· было → стало</span></h3>
        {s.skills.map((k) => (
          <div key={k.id} className="psk" style={{ opacity: k.shade ? 0.5 : 1 }}>
            <span className="r1">
              <span className="star">{k.star && <Star size={15} />}</span>
              <span className="nm">{skillName(k.id)}</span>
              <span className="lv">{k.locked ? <span className="locked">не открыт</span> : k.to > k.from ? <span className="up">{k.from} → {k.to}</span> : `${k.from} → ${k.to}`}</span>
              <span className="h">{k.locked ? '' : k.minutes ? '+' + fmtH(k.minutes) : '—'}</span>
            </span>
            {!k.locked && (
              <span className="r2">
                <span className="br">{branchName(k.branch)}</span>
                <span className="bar"><span style={{ width: `${Math.round(k.progress * 100)}%` }} /></span>
                <span className="pct">{Math.round(k.progress * 100)}%</span>
                <span className="idle">{idleText(k.idle)}</span>
              </span>
            )}
          </div>
        ))}
        <span className="sum-legend"><Star size={13} />навык главы · приглушены — «в тени», меньше 5% часов главы</span>
      </section>
      <section className="psum-sec">
        <h3>Ветки</h3>
        {s.branches.map((b) => (
          <div key={b.key} className="sum-branch">
            <div className="t"><b>{branchName(b.key)}</b><span>{Math.round(b.share * 100)}% · {fmtH(b.minutes)}</span>
              <span className="lv">ур. {b.from} → {b.to > b.from ? <span className="up">{b.to}</span> : b.to}</span></div>
            <div className="bar8"><div style={{ width: `${Math.round(b.share * 100)}%` }} /></div>
          </div>
        ))}
      </section>
      {groups.length > 0 && (
        <section className="psum-sec">
          {groups.map(({ title, g }) => (
            <div key={title} className="pq">
              <h3>{title} <span>· завершено {g.done} · в работе {g.inWork}</span></h3>
              {g.rows.map((r) => {
                const total = r.quest ? (r.estimate !== null ? `${fmtH(r.totalMin)} из ${fmtH(r.estimate)}` : `${fmtH(r.totalMin)} · без оценки`) : fmtH(r.totalMin);
                return (
                  <div key={r.id} className="pq-row">
                    <span className="r1">
                      <span className={'st' + (r.done ? ' done' : '')} aria-label={r.done ? 'завершён' : 'в работе'}>
                        {r.done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#C5F25A" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                      <span className="nm">{projectName(r.id)}</span>
                      <span className="h">{r.minutes ? '+' + fmtH(r.minutes) : '—'}</span>
                    </span>
                    <span className="r2">{total}{r.over !== null && <span className="over">+{fmtH(r.over)}</span>}{r.days !== null && ` · ${r.done ? daysText(r.days) : `идёт ${daysText(r.days)}`}`}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      )}
      {s.habits.length > 0 && (
        <section className="psum-sec">
          <h3>Привычки</h3>
          {s.habits.map((h) => (
            <div key={h.templateId} className="sum-habit">
              <div className="t"><b>{h.title || 'Без названия'}</b><span>{h.done} из {h.due}</span><span className="pct">{Math.round((h.done / h.due) * 100)}%</span></div>
              <div className="bar6"><div style={{ width: `${Math.round((h.done / h.due) * 100)}%` }} /></div>
            </div>
          ))}
        </section>
      )}
      {s.moments.length > 0 && (
        <section className="psum-sec">
          <h3>Моменты главы</h3>
          {s.moments.map((m, i) => {
            const [t, sub] = momentText(m);
            return (
              <div key={i} className="sum-moment">
                <span className="ico"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={MOMENT_ICON[m.kind]} stroke="#3D6A00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span className="tx"><b>{t}</b><span>{sub}</span></span>
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}
