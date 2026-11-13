import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useGrowthData, useToday } from '../lib/store';
import { chapterArchive, chapterSummary } from '../lib/growth/growth';
import { branchName, daysText, fmtH } from '../lib/growth/format';
import { useStore } from '../lib/store';
import { Icon } from '../ui/icons';
import { useIsPhone } from '../ui/useIsPhone';
import { ChapterSummaryView, chapterSub, fmtRange, Star } from '../growth/ChapterSummary';

const SHARE_COLORS = ['#C5F25A', '#3D6A00', '#15171A', '#8E9289'];

function Crumbs({ chapter }: { chapter?: number }) {
  return (
    <nav aria-label="Путь" className="crumbs">
      <Link to="/character">Персонаж</Link>
      <Icon name="chevronRight" size={12} color="#8E9289" width={2.4} />
      {chapter ? <><Link to="/chapters">Главы</Link><Icon name="chevronRight" size={12} color="#8E9289" width={2.4} /><span>Глава {chapter}</span></> : <span>Главы</span>}
    </nav>
  );
}

/** Архив «Главы» (Спецификация, раздел 11): текущая глава сверху, ниже прошлые, свежие сверху. */
export function ChaptersScreen() {
  const data = useGrowthData();
  const today = useToday();
  const store = useStore();
  const a = useMemo(() => chapterArchive(data, today), [data, today]);
  const name = (id: string) => store.skills.find((s) => s.id === id)?.name ?? '';
  const branches = a.past[0]?.branches.map((b) => b.key) ?? [];
  const phone = useIsPhone();

  if (phone) {
    // iPhone: карточки (Спецификация, раздел 15).
    return (
      <div className="chapters-page">
        <h1 className="phone-h1">Главы</h1>
        {a.current ? (
          <div className="pch-cur">
            <span className="t"><b>Глава {a.current.n}</b><span>идёт · {daysText(a.current.days)}</span></span>
            <span className="s">с {fmtRange(a.current.startDay, a.current.startDay)} · сводка появится, когда возьмёшь уровень {a.current.n + 1}</span>
            <span className="to"><span className="bar"><span style={{ width: `${Math.round(a.current.progress * 100)}%` }} /></span><span>до {a.current.n + 1} — <b>{fmtH(a.current.toNext)}</b></span></span>
          </div>
        ) : (
          <div className="empty-dashed"><span className="eb-text"><span className="t">Глав пока нет</span>
            <span className="h">Первая глава начнётся с первой выполненной задачи с навыком и оценкой.</span></span></div>
        )}
        {a.past.map((c) => (
          <Link key={c.n} to={`/chapters/${c.n}`} className="pch-card">
            <span className="r1"><b>Глава {c.n}</b><span className="d">{daysText(c.days)} · {fmtRange(c.startDay, c.lastDay)}</span>
              {c.first && <span className="first">первая</span>}<span className="avg">{fmtH(c.avgPerDay)}<span> в день</span></span></span>
            {c.stars.length > 0 && <span className="stars">{c.stars.map((id) => <span key={id}><Star size={14} />{name(id)}</span>)}</span>}
            <span className="shares">
              <span className="sbar">{c.branches.map((b, i) => <span key={b.key} style={{ width: `${b.share * 100}%`, background: SHARE_COLORS[Math.min(i, 3)] }} />)}</span>
              <span className="lbl">{branches.map(branchName).join(' / ')} · {c.branches.map((b) => Math.round(b.share * 100)).join(' / ')}%</span>
            </span>
          </Link>
        ))}
        <span className="foot-note">Главы считаются из истории задач — после правок архив пересчитается сам.</span>
      </div>
    );
  }

  return (
    <div className="chapters-page">
      <Crumbs />
      <header className="ch-header">
        <h1>Главы</h1>
        <span>Глава N — время на уровне N, от получения уровня N до N+1</span>
      </header>

      {a.current ? (
        <section aria-label="Текущая глава" className="ch-current">
          <span className="n">Глава {a.current.n}</span>
          <span className="mid"><b>Идёт сейчас · {daysText(a.current.days)}</b>
            <span>с {fmtRange(a.current.startDay, a.current.startDay)} · сводка появится, когда возьмёшь уровень {a.current.n + 1}</span></span>
          <span className="to"><span>до уровня {a.current.n + 1} — <b>{fmtH(a.current.toNext)}</b></span>
            <span className="bar"><span style={{ width: `${Math.round(a.current.progress * 100)}%` }} /></span></span>
        </section>
      ) : (
        <div className="empty-dashed"><span className="eb-text"><span className="t">Глав пока нет</span>
          <span className="h">Первая глава начнётся с первой выполненной задачи с навыком и оценкой.</span></span></div>
      )}

      {a.past.length > 0 && (
        <section aria-label="Прошлые главы" className="ch-table">
          <div className="ch-row head"><span>Глава</span><span>Дней</span><span>Даты</span><span className="r">В день</span><span>Навык главы</span>
            <span>{branches.map(branchName).join(' / ')}</span><span /></div>
          {a.past.map((c) => (
            <Link key={c.n} to={`/chapters/${c.n}`} className="ch-row">
              <span className="b nowrap">Глава {c.n}</span>
              <span className="b7">{daysText(c.days)}</span>
              <span className="dates">{fmtRange(c.startDay, c.lastDay)}{c.first && <span className="first">первая</span>}</span>
              <span className="r b">{fmtH(c.avgPerDay)}</span>
              <span className="stars">{c.stars.map((id) => <span key={id}><Star size={14} />{name(id)}</span>)}</span>
              <span className="shares">
                <span className="sbar">{c.branches.map((b, i) => (
                  <span key={b.key} style={{ width: `${b.share * 100}%`, background: SHARE_COLORS[Math.min(i, 3)] }} />
                ))}</span>
                <span className="lbl">{c.branches.map((b) => Math.round(b.share * 100)).join(' / ')}%</span>
              </span>
              <Icon name="chevronRight" size={14} color="#8E9289" width={2.4} />
            </Link>
          ))}
        </section>
      )}
      <span className="foot-note">Главы считаются из истории задач: после удаления или переноса навыка, правки оценки архив пересчитается сам.</span>
    </div>
  );
}

/** Открытая прошлая глава: та же сводка без своей шапки, стрелки к соседним главам. */
export function ChapterScreen() {
  const { n: param } = useParams();
  const n = Number(param);
  const data = useGrowthData();
  const today = useToday();
  const s = useMemo(() => chapterSummary(data, n, today), [data, n, today]);
  const phone = useIsPhone();
  if (!s || !s.bounds.closed) return <Navigate to="/chapters" replace />;
  const next = chapterSummary(data, n + 1, today);
  if (phone) {
    return (
      <div className="chapters-page">
        <div className="pch-open"><h1 className="phone-h1">Глава {n}</h1><span>{chapterSub(s)}</span></div>
        <ChapterSummaryView s={s} framed={false} />
      </div>
    );
  }
  return (
    <div className="chapters-page">
      <Crumbs chapter={n} />
      <div className="ch-open-head">
        <div><h1>Глава {n}</h1><span>{chapterSub(s)}</span></div>
        <div className="ch-nav">
          {n > 1 && <Link to={`/chapters/${n - 1}`} className="nav2"><Icon name="back" size={12} color="#3E423C" width={2.4} />Глава {n - 1}</Link>}
          {next && (next.bounds.closed
            ? <Link to={`/chapters/${n + 1}`} className="nav2">Глава {n + 1}<Icon name="chevronRight" size={12} color="#3E423C" width={2.4} /></Link>
            : <span className="nav2 off" aria-disabled="true">Глава {n + 1} · идёт<Icon name="chevronRight" size={12} color="#BFC3BA" width={2.4} /></span>)}
        </div>
      </div>
      <ChapterSummaryView s={s} framed={false} />
    </div>
  );
}
