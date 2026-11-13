import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useGrowthData, useStore } from '../lib/store';
import { skillDeletionPreview } from '../lib/growth/growth';
import { branchName } from '../lib/growth/format';
import { Select } from '../ui/Select';
import { useAccount } from '../lib/account';
import { signOut } from '../lib/session';
import type { Settings, Skill } from '../lib/types';
import { useNewTaskContext } from '../tasks/editing';
import { SkillGlyph } from '../tasks/pickers';
import { Icon } from '../ui/icons';
import { Pop, PopItem, PopSep, type Anchor } from '../ui/Pop';
import { SKILL_ICON_GROUPS, SKILL_ICON_LABEL, SKILL_ICONS } from '../ui/skillIcons';
import { useIsPhone } from '../ui/useIsPhone';
import { LEVEL_TABLE_ROWS, levelTable, type LevelKind } from '../lib/growth/levels';
import { fmtMin } from '../lib/dates';

const D = {
  account: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M4.5 20a7.5 7.5 0 0 1 15 0',
  log: 'M8 3h8a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z M9 12l2.2 2.2L15.5 10',
  today: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0 M12 2.5v2.2 M12 19.3v2.2 M2.5 12h2.2 M19.3 12h2.2 M5.3 5.3l1.6 1.6 M17.1 17.1l1.6 1.6 M5.3 18.7l1.6-1.6 M17.1 6.9l1.6-1.6',
  skills: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  about: 'M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 11v5 M12 7.5h.01',
  calendars: 'M7 5h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z M4 10h16 M8 3v4 M16 3v4',
  claude: 'M5 5h14v11H10l-5 4z M9 10h6',
  time: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 7.5V12l3 2',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
};

const SECTIONS = [
  { key: 'account', label: 'Аккаунт' },
  { key: 'log', label: 'Журнал' },
  { key: 'today', label: 'Сегодня' },
  { key: 'skills', label: 'Навыки' },
  { key: 'about', label: 'О приложении' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

const LATER = [
  { label: 'Календари', stage: 'этап 3', d: D.calendars },
  { label: 'Claude', stage: 'этап 4', d: D.claude },
  { label: 'Время', stage: 'этап 5', d: D.time },
];

const LOG_MODES: { value: Settings['log_mode']; label: string; hint: string }[] = [
  { value: 'immediately', label: 'Сразу', hint: 'Отмеченная задача сразу уходит в Журнал.' },
  { value: 'daily', label: 'Раз в день', hint: 'Выполненные уходят в Журнал раз в сутки; до этого видны тусклыми.' },
  { value: 'manual', label: 'Вручную', hint: 'Выполненные остаются тусклыми, пока не перенесёте: Shift+⌘Y или кнопка «Перенести выполненные» в Журнале.' },
];

function Glyph({ d, size = 16, color = '#15171A', width = 1.9 }: { d: string; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Настройки. Mac — в рабочей панели: слева колонка разделов, справа раздел.
 * iPhone — список разделов, каждый раздел — отдельный экран с «‹ Настройки».
 */
export function SettingsScreen() {
  const { section } = useParams();
  const phone = useIsPhone();
  const store = useStore();
  const account = useAccount();
  useNewTaskContext({ defaults: {}, list: [], onNew: () => {} });

  const cur = (SECTIONS.find((s) => s.key === section)?.key ?? (phone ? null : 'account')) as SectionKey | null;
  const values: Record<SectionKey, string> = {
    account: account.name || account.email,
    log: LOG_MODES.find((m) => m.value === store.settings.log_mode)?.label ?? '',
    today: store.settings.today_view === 'list' ? 'Списком' : 'По проектам',
    skills: String(store.skills.length),
    about: '',
  };

  if (phone) {
    if (!cur) {
      return (
        <>
          <h1 className="title" style={{ fontSize: 25, marginBottom: 4 }}>Настройки</h1>
          <div className="phone-card">
            {SECTIONS.map((s, i) => (
              <Link key={s.key} to={`/settings/${s.key}`} className="phone-row set-row" style={{ borderTop: i ? '1px solid #F0F1EC' : 0 }}>
                <Glyph d={D[s.key]} size={22} width={1.8} />
                <span className="label">{s.label}</span>
                <span className="count" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{values[s.key]}</span>
                <Icon name="chevronDown" size={18} color="#8E9289" width={2} style={{ transform: 'rotate(-90deg)' }} />
              </Link>
            ))}
          </div>
          <span className="set-caption">СКОРО</span>
          <div className="phone-card">
            {LATER.map((l, i) => (
              <div key={l.label} className="phone-row future" aria-disabled="true" style={{ borderTop: i ? '1px solid #F0F1EC' : 0 }}>
                <Glyph d={l.d} size={22} color="#8E9289" width={1.8} />
                <span className="label">{l.label}</span>
                <span className="soon">{l.stage}</span>
              </div>
            ))}
          </div>
        </>
      );
    }
    return (
      <>
        <h1 className="title" style={{ fontSize: 25, marginBottom: 4 }}>{SECTIONS.find((s) => s.key === cur)!.label}</h1>
        <Section k={cur} />
      </>
    );
  }

  return (
    <>
      <header className="screen-head">
        <div className="screen-title">
          <span className="title-badge lime"><Icon name="settings" size={22} width={1.9} /></span>
          <h1 className="title">Настройки</h1>
        </div>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, alignItems: 'flex-start' }}>
        <nav aria-label="Разделы настроек" style={{ flex: '0 0 210px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {SECTIONS.map((s) => (
              <NavLink key={s.key} to={`/settings/${s.key}`} className={() => 'set-nav' + (s.key === cur ? ' current' : '')}
                aria-current={s.key === cur ? 'page' : undefined}>
                <Glyph d={D[s.key]} />{s.label}
              </NavLink>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="set-caption" style={{ padding: '0 10px 4px' }}>СКОРО</span>
            {LATER.map((l) => (
              <button key={l.label} type="button" className="set-nav" disabled>
                <Glyph d={l.d} color="#8E9289" /><span style={{ flex: 1 }}>{l.label}</span>
                <span className="soon">{l.stage}</span>
              </button>
            ))}
          </div>
        </nav>
        <div style={{ flex: '1 1 420px', minWidth: 0, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section k={cur!} />
        </div>
      </div>
    </>
  );
}

function Head({ title, sub, extra }: { title: string; sub?: string; extra?: React.ReactNode }) {
  const phone = useIsPhone();
  if (phone) return sub ? <p className="set-sub" style={{ margin: '0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>{sub}{extra}</p> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h2 className="set-h2">{title}</h2>{extra}</span>
      {sub && <p className="set-sub">{sub}</p>}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="set-seg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Section({ k }: { k: SectionKey }) {
  const store = useStore();
  const account = useAccount();
  if (k === 'account') {
    const letter = (account.name || account.email || '?').trim().charAt(0).toUpperCase();
    return (
      <>
        <Head title="Аккаунт" sub="Вход и где хранятся настройки" />
        <div className="set-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
            <span className="avatar" aria-hidden="true">{letter}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{account.name || 'Без имени'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#5F635C', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.email}</span>
            </div>
          </div>
          <div className="set-line"><span>Вход</span><span>через Google</span></div>
          <div className="set-line"><span>Настройки</span><span>хранятся в аккаунте, одинаковы на Mac и iPhone</span></div>
        </div>
        <button type="button" className="set-btn" onClick={() => { void signOut(); }}>
          <Icon name="logout" size={16} color="#3E423C" />Выйти
        </button>
      </>
    );
  }
  if (k === 'log') {
    const mode = LOG_MODES.find((m) => m.value === store.settings.log_mode) ?? LOG_MODES[2];
    return (
      <>
        <Head title="Журнал" sub="Когда выполненные задачи уходят из списков" />
        <div className="set-card set-pad">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="set-label">Переносить выполненные в Журнал</span>
            <span className="set-sub" style={{ fontSize: 12 }}>До переноса задача остаётся в списке тусклой</span>
          </div>
          <Seg label="Переносить выполненные в Журнал" value={store.settings.log_mode}
            options={LOG_MODES.map((m) => ({ value: m.value, label: m.label }))}
            onChange={(v) => store.patchSettings({ log_mode: v })} />
          <p className="set-hint">{mode.hint}</p>
        </div>
      </>
    );
  }
  if (k === 'today') {
    return (
      <>
        <Head title="Сегодня" sub="Вид экрана «Сегодня» по умолчанию" />
        <div className="set-card set-pad">
          <span className="set-label">Показывать задачи</span>
          <div style={{ maxWidth: 360 }}>
            <Seg label="Показывать задачи" value={store.settings.today_view}
              options={[{ value: 'projects', label: 'По проектам' }, { value: 'list', label: 'Списком' }]}
              onChange={(v) => store.patchSettings({ today_view: v })} />
          </div>
          <p className="set-hint">Это вид по умолчанию. На экране «Сегодня» его можно переключить на время.</p>
        </div>
      </>
    );
  }
  if (k === 'skills') return <SkillsSection />;
  return (
    <>
      <Head title="О приложении" />
      <div className="set-card">
        <div className="set-line" style={{ borderTop: 0 }}><span>Версия</span><span>{__APP_VERSION__} · этап 1</span></div>
        <a className="set-line link" href="https://github.com/91Dovzhenko/melvl/commits/main" target="_blank" rel="noreferrer">
          <span>Что нового</span>
          <Icon name="chevronDown" size={16} color="#8E9289" width={2} style={{ transform: 'rotate(-90deg)' }} />
        </a>
      </div>
    </>
  );
}

/* ───────── Навыки ───────── */

const BRANCHES: { key: Skill['branch']; name: string }[] = [{ key: 'creator', name: 'Креатор' }, { key: 'profession', name: 'Профессия' }];

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function SkillsSection() {
  const store = useStore();
  const phone = useIsPhone();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<Skill['branch'] | null>(null);
  const [menu, setMenu] = useState<{ skill: Skill; anchor: Anchor } | null>(null);
  const [icons, setIcons] = useState<{ skill: Skill | null; anchor: Anchor; onPick: (key: string) => void } | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);
  const [levels, setLevels] = useState(false);
  const skills = store.skills.filter((s) => !s.deleted_at).sort((a, b) => a.sort_order - b.sort_order);

  const move = (s: Skill, dir: -1 | 1) => {
    const list = skills.filter((x) => x.branch === s.branch);
    const i = list.findIndex((x) => x.id === s.id);
    const other = list[i + dir];
    if (!other) return;
    store.patch('skills', s.id, { sort_order: other.sort_order });
    store.patch('skills', other.id, { sort_order: s.sort_order });
  };

  return (
    <>
      <Head title="Навыки" sub="Из этого списка навык выбирается у задачи и проекта"
        extra={<button type="button" className={'info-i lg' + (levels ? ' on' : '')} aria-label="Как растут уровни" title="Как растут уровни" onClick={() => setLevels(true)}>i</button>} />
      {BRANCHES.map((b) => {
        const list = skills.filter((s) => s.branch === b.key);
        return (
          <div key={b.key} className="set-card">
            <div className="skill-branch">
              <span style={{ flex: 1 }}>{b.name} <span style={{ fontWeight: 600, color: '#5F635C' }}>· {list.length} {plural(list.length, 'навык', 'навыка', 'навыков')}</span></span>
              {!phone && <span style={{ fontSize: 11, fontWeight: 700, color: '#5F635C', width: 84, textAlign: 'center' }}>Показывать</span>}
              {!phone && <span style={{ width: 30 }} />}
            </div>
            {list.map((s) => (
              <SkillRow key={s.id} skill={s} editing={editing === s.id}
                onEditDone={(name) => { setEditing(null); if (name && name !== s.name) store.patch('skills', s.id, { name }); }}
                onMenu={(anchor) => setMenu({ skill: s, anchor })}
                onIcon={(anchor) => setIcons({ skill: s, anchor, onPick: (icon) => store.patch('skills', s.id, { icon }) })}
                onStartEdit={() => setEditing(s.id)} />
            ))}
            {adding === b.key ? (
              <AddSkillRow onCancel={() => setAdding(null)} onIcon={(anchor, cur, onPick) => setIcons({ skill: { icon: cur } as Skill, anchor, onPick })}
                onAdd={(name, icon) => {
                  setAdding(null);
                  store.insert('skills', { name, icon, branch: b.key, active: true, sort_order: Math.max(0, ...skills.map((x) => x.sort_order)) + 1 });
                }} />
            ) : (
              <button type="button" className="skill-add" onClick={() => setAdding(b.key)}>
                <Icon name="plus" size={16} color="#3D6A00" width={2.2} />Добавить навык
              </button>
            )}
          </div>
        );
      })}
      <p className="set-hint" style={{ color: '#5F635C' }}>
        Скрытый навык не предлагается у новых задач и проектов, но остаётся там, где уже стоит.{' '}
        {phone
          ? 'Нажмите на строку — меню: Переименовать, Сменить иконку, Скрыть, Выше/Ниже, Удалить.'
          : 'Имя — двойным кликом, остальное — в меню «…» или правым кликом.'}
      </p>

      {menu && (
        <Pop anchor={menu.anchor} onClose={() => setMenu(null)} variant="light" width={220} title={menu.skill.name}>
          <PopItem icon="pencil" label="Переименовать" onClick={() => { setEditing(menu.skill.id); setMenu(null); }} />
          <PopItem icon="skill" label="Сменить иконку" onClick={() => {
            const s = menu.skill; const a = menu.anchor; setMenu(null);
            setIcons({ skill: s, anchor: a, onPick: (icon) => store.patch('skills', s.id, { icon }) });
          }} />
          <PopItem icon={menu.skill.active ? 'clear' : 'check'} label={menu.skill.active ? 'Скрыть' : 'Показать'}
            onClick={() => { store.patch('skills', menu.skill.id, { active: !menu.skill.active }); setMenu(null); }} />
          <PopItem icon="back" label="Выше" onClick={() => { move(menu.skill, -1); setMenu(null); }} />
          <PopItem icon="chevronDown" label="Ниже" onClick={() => { move(menu.skill, 1); setMenu(null); }} />
          <PopSep />
          <PopItem icon="trash" label="Удалить" onClick={() => { setDeleting(menu.skill); setMenu(null); }} />
        </Pop>
      )}
      {icons && (
        <IconPicker anchor={icons.anchor} value={icons.skill?.icon ?? ''} onClose={() => setIcons(null)}
          onPick={(key) => { icons.onPick(key); setIcons(null); }} />
      )}
      {deleting && <DeleteSkillDialog skill={deleting} onClose={() => setDeleting(null)} />}
      {levels && <LevelsDialog onClose={() => setLevels(false)} />}
    </>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')}
      onClick={(e) => { e.stopPropagation(); onChange(); }}>
      <span />
    </button>
  );
}

function SkillRow({ skill: s, editing, onEditDone, onMenu, onIcon, onStartEdit }: {
  skill: Skill; editing: boolean; onEditDone: (name: string) => void;
  onMenu: (anchor: Anchor) => void; onIcon: (anchor: Anchor) => void; onStartEdit: () => void;
}) {
  const store = useStore();
  const phone = useIsPhone();
  const [name, setName] = useState(s.name);
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (editing) setName(s.name); }, [editing, s.name]);
  const on = s.active;
  return (
    <div className={'skill-row' + (editing ? ' editing' : '')}
      onContextMenu={(e) => { if (phone) return; e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}
      onClick={(e) => { if (phone && !editing && moreRef.current) { e.preventDefault(); onMenu(moreRef.current); } }}>
      <button type="button" className={'skill-ic' + (on ? '' : ' off')} aria-label={`Иконка «${s.name}»: ${SKILL_ICON_LABEL[s.icon] ?? ''}`}
        title="Сменить иконку" onClick={(e) => { e.stopPropagation(); onIcon(e.currentTarget); }}>
        <SkillGlyph skill={s} size={phone ? 17 : 16} color={on ? '#3D6A00' : '#8E9289'} />
      </button>
      {editing ? (
        <form className="skill-edit" onSubmit={(e) => { e.preventDefault(); onEditDone(name.trim()); }} onClick={(e) => e.stopPropagation()}>
          <input autoFocus value={name} aria-label="Название навыка" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onEditDone(s.name); }} />
          <button type="submit" className="btn-mini">Готово</button>
        </form>
      ) : (
        <span className="skill-name" style={{ color: on ? '#15171A' : '#8E9289' }} onDoubleClick={onStartEdit}>
          {s.name}{!on && <span className="hidden-tag">скрыт</span>}
        </span>
      )}
      {!editing && (
        <span style={{ width: phone ? 'auto' : 84, display: 'flex', justifyContent: 'center' }}>
          <Switch on={on} label={`Показывать «${s.name}»`} onChange={() => store.patch('skills', s.id, { active: !on })} />
        </span>
      )}
      {!editing && (
        <button ref={moreRef} type="button" className="tool" aria-label={`Действия с «${s.name}»`} title="Действия"
          style={{ width: 30, height: 30, display: phone ? 'none' : 'flex' }}
          onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget); }}>
          <Icon name="more" size={16} color="#5F635C" width={3} />
        </button>
      )}
    </div>
  );
}

function AddSkillRow({ onAdd, onCancel, onIcon }: {
  onAdd: (name: string, icon: string) => void; onCancel: () => void;
  onIcon: (anchor: Anchor, cur: string, onPick: (key: string) => void) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  return (
    <form className="skill-row editing" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd(name.trim(), icon || 'star'); }}>
      <button type="button" className="skill-ic dashed" aria-label="Выбрать иконку" title="Выбрать иконку"
        onClick={(e) => onIcon(e.currentTarget, icon, setIcon)}>
        {icon ? <SkillGlyph skill={{ icon } as Skill} size={16} color="#3D6A00" /> : <Icon name="plus" size={14} color="#3D6A00" width={2.2} />}
      </button>
      <div className="skill-edit">
        <input autoFocus value={name} placeholder="Название навыка" aria-label="Название нового навыка"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} />
        <button type="submit" className="btn-mini" disabled={!name.trim()}>Добавить</button>
        <button type="button" className="btn-mini text" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

/** Выбор иконки: Mac — тёмное окно 344, 8 колонок; iPhone — нижний лист, 7 колонок. Выбор применяется сразу. */
function IconPicker({ anchor, value, onPick, onClose }: { anchor: Anchor; value: string; onPick: (k: string) => void; onClose: () => void }) {
  const phone = useIsPhone();
  return (
    <Pop anchor={anchor} onClose={onClose} title="Иконка навыка" width={344}>
      {!phone && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 4px' }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>Иконка навыка</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#B4B8B0' }}>{SKILL_ICON_LABEL[value] ?? ''}</span>
        </div>
      )}
      {SKILL_ICON_GROUPS.map((g) => (
        <div key={g.name} style={{ display: 'contents' }}>
          <div className="pop-group-name">{g.name}</div>
          <div className="icon-grid">
            {g.items.map((it) => (
              <button key={it.key} type="button" className={'icon-cell' + (it.key === value ? ' selected' : '')}
                aria-label={it.label} title={it.label} aria-pressed={it.key === value} onClick={() => onPick(it.key)}>
                <Glyph d={it.d} size={phone ? 22 : 20} color={it.key === value ? '#15171A' : '#FFFFFF'} width={1.8} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </Pop>
  );
}

/**
 * Удаление навыка (раздел 7 `12_ТЗ`): неиспользуемый — короткое подтверждение;
 * используемый — «Перенести в другой навык» (по умолчанию первый в той же ветке) или «Оставить без навыка».
 * Удаление мягкое, отменяется.
 */
function DeleteSkillDialog({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const store = useStore();
  const tasks = store.tasks.filter((t) => t.skill_id === skill.id && !t.deleted_at);
  const projects = store.projects.filter((p) => p.default_skill_id === skill.id && !p.deleted_at);
  const used = tasks.length + projects.length > 0;
  const others = store.skills.filter((s) => s.id !== skill.id && !s.deleted_at)
    .sort((a, b) => (a.branch === skill.branch ? 0 : 1) - (b.branch === skill.branch ? 0 : 1) || a.sort_order - b.sort_order);
  const [mode, setMode] = useState<'move' | 'none'>(others.length ? 'move' : 'none');
  const [targetId, setTargetId] = useState<string | undefined>(others[0]?.id);
  const target = others.find((x) => x.id === targetId);
  const growth = useGrowthData();
  // Куда уйдут часы — до подтверждения (15_ТЗ, п. 4.7): тот же расчёт, что применится при удалении.
  const preview = useMemo(() => skillDeletionPreview(growth, skill.id, mode === 'move' && target ? { kind: 'transfer', to: target.id } : { kind: 'keep' }),
    [growth, skill.id, mode, target]);
  const hours = preview.minutes;
  const nameOf = (id: string) => store.skills.find((x) => x.id === id)?.name ?? '';
  const ownProjects = projects.map((p) => `«${p.name || 'Новый проект'}»`);
  // Почему часы пропадут: задачи без проекта и/или проекты, у которых удаляемый навык — навык проекта.
  const loose = tasks.some((t) => !t.project_id || !store.projects.find((p) => p.id === t.project_id)?.default_skill_id);
  const lostWhy = [
    loose ? 'Задачи без проекта (и в проектах без своего навыка) остаются без навыка.' : '',
    ownProjects.length ? `${ownProjects.length > 1 ? 'Проекты' : 'Проект'} ${ownProjects.join(', ')}: «${skill.name}» — ${ownProjects.length > 1 ? 'их' : 'его'} навык проекта, он тоже снимется.` : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const run = () => {
    // Тот же патч, что в расчёте окна: у задач и проектов навык переносится или снимается.
    const to = mode === 'move' && target ? target.id : null;
    store.withUndo('Навык удалён', () => {
      for (const t of tasks) store.patch('tasks', t.id, { skill_id: to });
      for (const p of projects) store.patch('projects', p.id, { default_skill_id: to });
      store.remove('skills', skill.id);
    });
    onClose();
  };

  const usage = [
    tasks.length ? `${tasks.length} ${plural(tasks.length, 'задачи', 'задач', 'задач')}` : '',
    projects.length ? `${projects.length} ${plural(projects.length, 'проекта', 'проектов', 'проектов')}` : '',
  ].filter(Boolean).join(' и ');

  return createPortal(
    <div className="modal-scrim" data-keep-card onClick={onClose}>
      <div className="modal" role={used ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="del-skill"
        style={{ width: used ? 480 : 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="skill-ic" style={{ width: 36, height: 36, borderRadius: 18 }}><SkillGlyph skill={skill} size={18} color="#3D6A00" /></span>
          <h2 id="del-skill">Удалить навык «{skill.name}»?</h2>
        </div>
        {used ? (
          <>
            <p>Навык «{skill.name}» стоит у {usage}{hours > 0 ? `, на нём ${fmtMin(hours)}` : ''}. {tasks.length + projects.length > 1 ? 'Что с ними сделать?' : tasks.length ? 'Что с ней сделать?' : 'Что с ним сделать?'}</p>
            <div role="radiogroup" aria-label="Что сделать с задачами" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className={'opt-card' + (mode === 'move' ? ' on' : '')} role="radio" aria-checked={mode === 'move'} tabIndex={0}
                onClick={() => others.length && setMode('move')} aria-disabled={!others.length}>
                <span className="opt-dot" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="set-label">Перенести в другой навык</span>
                    {hours > 0 && <span className="set-sub" style={{ fontSize: 12 }}>{fmtMin(hours)} перейдут в выбранный навык и его ветку</span>}
                  </span>
                  {mode === 'move' && target && (
                    <span onClick={(e) => e.stopPropagation()} style={{ alignSelf: 'flex-start' }}>
                      <Select label="Перенести в навык" value={target.id} width={220} onChange={setTargetId}
                        options={others.map((x) => ({ value: x.id, label: x.name, icon: SKILL_ICONS[x.icon] || SKILL_ICONS.target, hint: x.active ? undefined : 'скрыт' }))} />
                    </span>
                  )}
                </div>
              </div>
              <div className={'opt-card' + (mode === 'none' ? ' on' : '')} role="radio" aria-checked={mode === 'none'} tabIndex={0} onClick={() => setMode('none')}>
                <span className="opt-dot" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="set-label">Оставить без навыка</span>
                  <span className="set-sub" style={{ fontSize: 12 }}>Задачи в проектах снова возьмут навык проекта</span>
                  {mode === 'none' && hours > 0 && (
                    <div role="note" className="del-warn">
                      <Icon name="warn" size={16} color="#8A5A00" width={2.2} />
                      <div className="body">
                        <span style={{ fontWeight: 700 }}>Куда уйдут {fmtMin(hours)} навыка «{skill.name}»:</span>
                        <span className="rows">
                          {preview.moved.map((m) => (
                            <span key={m.skillId} className="kv"><span>«{nameOf(m.skillId)}» получит — навык проектов</span><b>{fmtMin(m.minutes)}</b></span>
                          ))}
                          {preview.lost > 0 && <span className="kv"><span>Больше не будут считаться</span><b>{fmtMin(preview.lost)}</b></span>}
                          {preview.lost > 0 && (
                            <span className="why">{lostWhy}</span>
                          )}
                        </span>
                        {(preview.total.from !== preview.total.to || preview.branches.length > 0) && (
                          <>
                            <span className="lv">
                              {preview.total.from !== preview.total.to && <span>Общий уровень: <b>{preview.total.from} → {preview.total.to}</b></span>}
                              {preview.branches.map((b) => <span key={b.key}>Ветка «{branchName(b.key)}»: <b>{b.from} → {b.to}</b></span>)}
                            </span>
                            <span style={{ fontWeight: 600 }}>Уровни изменятся тихо, без уведомлений.</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p>Он не стоит ни у одной задачи и проекта.</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="set-sub" style={{ fontSize: 12 }}>{used ? 'Вернуть — «Отменить» сразу после удаления' : ''}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-text" style={{ padding: '0 12px' }} onClick={onClose}>Отменить</button>
            <button type="button" className="btn-quiet" style={{ padding: '0 18px', height: 40 }} onClick={run}>Удалить</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Окно «Как растут уровни» (Спецификация, раздел 13): три таблицы из тех же формул, что и уровни, — уровни 2–16 и 50. */
function LevelsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const tables: { kind: LevelKind; title: string; rule: string }[] = [
    { kind: 'skill', title: 'Навык', rule: 'переход с уровня n — 3 × √n ч' },
    { kind: 'branch', title: 'Ветка', rule: 'переход с уровня n — 6 + n ч' },
    { kind: 'total', title: 'Общий уровень', rule: 'переход с уровня n — 12 + 1,5 × n ч' },
  ];
  return createPortal(
    <div className="modal-scrim" data-keep-card onClick={onClose}>
      <div className="modal lv-modal" role="dialog" aria-modal="true" aria-labelledby="lv-t" onClick={(e) => e.stopPropagation()}>
        <div className="lv-head">
          <h2 id="lv-t">Как растут уровни</h2>
          <button type="button" className="lv-x" aria-label="Закрыть" onClick={onClose}><Icon name="clear" size={14} color="#3E423C" width={2.2} /></button>
        </div>
        <div className="lv-text">
          <span>Часы — это оценки выполненных задач. Задача без навыка часов не даёт.</span>
          <span><b>Навык</b> растёт от своих часов, <b>ветка</b> — от суммы часов её навыков, <b>общий уровень</b> — от часов всех навыков. Каждый следующий уровень стоит чуть дороже.</span>
          <span className="q">Формулы стартовые — их калибруют по факту. При смене формулы уровни пересчитываются сами и тихо, без поздравлений.</span>
        </div>
        <div className="lv-grid">
          {tables.map((t) => {
            const rows = levelTable(t.kind, LEVEL_TABLE_ROWS);
            return (
              <section key={t.kind} className="lv-table">
                <h3>{t.title}</h3>
                <span className="rule">{t.rule}</span>
                <div className="lv-row head"><span>Уровень</span><span className="r">Переход</span><span className="r">Всего</span></div>
                {rows.map((r) => (
                  <div key={r.level} className={'lv-row' + (r.level === 50 ? ' fifty' : '')}>
                    <span className="l">{r.level}</span><span className="r s">{fmtMin(r.step)}</span><span className="r t">{fmtMin(r.total)}</span>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
        <span className="lv-foot">«Переход» — сколько часов стоит взять этот уровень с предыдущего; «Всего» — сколько часов нужно с нуля. Строка «50» — для ориентира.</span>
      </div>
    </div>,
    document.body,
  );
}
