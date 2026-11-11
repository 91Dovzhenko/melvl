import { fmtMin } from '../lib/dates';
import { useIsPhone } from './useIsPhone';

/** Блок суммы часов «Сегодня»: справа в шапке, по высоте первой строки, не сжимается. */
export function TodaySumBlock({ left, planned, done, total, pct }: { left: number; planned: number; done: number; total: number; pct: number }) {
  const phone = useIsPhone();
  return (
    <div className="sum-block" aria-label="Часы на сегодня" style={phone ? { minWidth: 0, width: '100%' } : undefined}>
      <div className="sum-line">
        <div className="sum-big"><span className="sum-num">{fmtMin(left)}</span><span className="sum-cap">осталось</span></div>
        <span className="sum-div" />
        <div className="sum-small"><span className="sum-cap">запланировано</span><b>{fmtMin(planned)}</b></div>
        <div className="sum-small"><span className="sum-cap">задачи</span><b>{done} из {total}</b></div>
      </div>
      <div className="sum-bar"><div style={{ width: `${Math.round(pct * 100)}%` }} /></div>
    </div>
  );
}

/** Проект / область: «сегодня» крупно, затем «завтра · позже · всего», без полосы. */
export function PlanSumBlock({ today, tomorrow, later, total }: { today: number; tomorrow: number; later: number; total: number }) {
  return (
    <div className="sum-line" aria-label="Запланировано" style={{ minHeight: 34, flexShrink: 0 }}>
      <div className="sum-big"><span className="sum-num">{fmtMin(today)}</span><span className="sum-cap">сегодня</span></div>
      <span className="sum-div" />
      <div className="sum-small"><span className="sum-cap">завтра</span><b>{fmtMin(tomorrow)}</b></div>
      <div className="sum-small"><span className="sum-cap">позже</span><b>{fmtMin(later)}</b></div>
      <div className="sum-small"><span className="sum-cap">всего</span><b>{fmtMin(total)}</b></div>
    </div>
  );
}
